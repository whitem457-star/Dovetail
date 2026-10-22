/* Dovetail: the page (DOM, storage, Android bridge). Uses the pure functions in calc.js, migrate.js and analysis.js. */
var VERSION="2.18",SCHEMA=5,BACKUP_VERSION=6;
/* ---------- constants & helpers ---------- */
/* COLOURS (account colours) is in calc.js, which setup's pure helpers share. */
function $(id){return document.getElementById(id)}
function el(tag,cls,txt){var e=document.createElement(tag);if(cls)e.className=cls;if(txt!=null)e.textContent=txt;return e}
function clear(n){while(n.firstChild)n.removeChild(n.firstChild);return n}
function safeId(s){return String(s).replace(/[^a-z0-9_-]/gi,"_")}
/* Errors the page didn't expect: the last few are kept (in memory, and on the phone when it lets us) and go into
   "Copy app details", so a tester can send what went wrong. Messages hold no names or amounts: only the error text,
   where in the code it happened and when. */
var K_ERR="payday.errors.v1",errLog=(function(){try{var a=JSON.parse(localStorage.getItem(K_ERR)||"[]");return Array.isArray(a)?a.slice(-10):[]}catch(e){return []}})();
function logError(kind,msg,where){try{errLog.push({at:new Date().toISOString().slice(0,16),v:VERSION,kind:kind,msg:String(msg||"").slice(0,300),where:where?String(where).slice(0,120):undefined});
  errLog=errLog.slice(-10);try{localStorage.setItem(K_ERR,JSON.stringify(errLog))}catch(e){}}catch(e){}}
window.addEventListener("error",function(e){logError("error",e&&e.message,(e&&e.filename?e.filename.split("/").pop():"")+(e&&e.lineno?":"+e.lineno:""))});
window.addEventListener("unhandledrejection",function(e){var r=e&&e.reason;logError("promise",r&&r.message||r)});
/* A short message above the tab bar. Longer messages stay up longer (1.8 to 5 seconds). */
var toastT=null;function toast(m){var t=$("toast");t.textContent=m;t.classList.toggle("lift",!$("undoBar").hidden);t.classList.add("show");clearTimeout(toastT);toastT=setTimeout(function(){t.classList.remove("show")},Math.min(5000,Math.max(1800,String(m).length*55)))}
/* Undo for deletes: a bar with an Undo button for 6 seconds. restore() puts the item back exactly (same id, same place). */
var undoT=null,undoFn=null;
var undoHold=false,undoSeq=0,undoFocus=null;
function offerUndo(msg,restore,focusSel){undoFocus=focusSel||null;var t=$("toast");t.classList.remove("show");clearTimeout(toastT);var seq=++undoSeq;
  // show the bar first, then set the text, so screen readers announce it
  undoFn=restore;$("undoMsg").textContent="";$("undoBar").hidden=false;setTimeout(function(){if(seq===undoSeq&&undoFn)$("undoMsg").textContent=msg},30);armUndoTimer()}
function armUndoTimer(){clearTimeout(undoT);if(!undoHold)undoT=setTimeout(hideUndo,6000)}
function hideUndo(){clearTimeout(undoT);undoT=null;undoFn=null;undoHold=false;var b=$("undoBar");b.hidden=true;b.style.transform="";b.style.opacity=""}
/* Dismissed by the ×, a sideways swipe or Escape: the delete stands. Focus moves to the tab bar if it was on the bar. */
function dismissUndo(){var bar=$("undoBar"),had=bar.contains(document.activeElement);hideUndo();if(had){var t=$("t-"+tab);if(t&&!$("tabbar").hidden)t.focus()}}
/* Remove item from list, run after(), and offer to put it back. */
function removeWithUndo(list,item,msg,after,focusSel){var ix=list.indexOf(item);if(ix<0)return;var copy=clone(item);list.splice(ix,1);var sc0=syncCount;after();
  if(syncCount!==sc0)return; // the save was refused because another copy had newer data: nothing to undo
  offerUndo(msg,function(){if(list.some(function(x){return x.id!=null&&x.id===copy.id}))return;list.splice(Math.min(ix,list.length),0,copy);after()},focusSel)}
function plural(n,w,ws){return n+" "+(n===1?w:(ws||w+"s"))}

/* ---------- appearance (Settings › Appearance) ----------
   Theme sets data-theme on <html> (the CSS has light and dark colours); text size sets data-text, a root font-size
   multiplier (all CSS font sizes are in rem). The Android app is told the theme so its window, bars and lock screen match. */
var TEXT_MUL={small:0.9,normal:1,large:1.15};
function textMul(){return TEXT_MUL[(cfg&&cfg.appearance&&cfg.appearance.textSize)||"normal"]||1}
function applyAppearance(){var ap=(cfg&&cfg.appearance)||{},h=document.documentElement;
  if(ap.theme==="light"||ap.theme==="dark")h.setAttribute("data-theme",ap.theme);else h.removeAttribute("data-theme");
  if(ap.textSize==="small"||ap.textSize==="large")h.setAttribute("data-text",ap.textSize);else h.removeAttribute("data-text");
  if(NATIVE&&typeof NATIVE.setTheme==="function")nativeCall(function(){NATIVE.setTheme(ap.theme||"system")})}
/* scrolling: #main is the only thing that scrolls */
function scroller(){return $("main")}
function keepScroll(fn){var m=scroller(),y=m.scrollTop;fn();m.scrollTop=y}
var reduceMotion=false;try{var rmq=window.matchMedia("(prefers-reduced-motion: reduce)");reduceMotion=rmq.matches;
  if(rmq.addEventListener)rmq.addEventListener("change",function(e){reduceMotion=e.matches})}catch(e){}
/* Bring something that has just opened fully into view, but only if part of it is off-screen. */
function reveal(n){if(!n)return;var m=scroller(),mr=m.getBoundingClientRect(),r=n.getBoundingClientRect(),bar=$("monthBar");
  var top=mr.top+((bar&&!bar.hidden)?bar.offsetHeight:0)+8,bot=mr.bottom-8,d=0;
  if(r.top<top)d=r.top-top;else if(r.bottom>bot)d=Math.min(r.bottom-bot,r.top-top);
  if(Math.abs(d)>1){try{m.scrollBy({top:d,behavior:reduceMotion?"auto":"smooth"})}catch(e){m.scrollTop+=d}}}
function toTop(){scroller().scrollTop=0}

/* ---------- storage ---------- */
/* payday.wealth.v1 is the old Wealth tab's data. 2.0 doesn't use it, but keeps it untouched and in every backup, until it's saved as a
   file and removed in Settings › Backup (2.13, wealthBox). */
var K_CFG="payday.config.v1",K_MON="payday.months.v1",K_W="payday.wealth.v1";
function lsGet(k){try{var v=localStorage.getItem(k);return v?JSON.parse(v):null}catch(e){return null}}
/* Like lsGet, but tells "nothing there" (null) from "there, but unreadable" ({corrupt:true, raw}): the page must never
   treat damaged settings as a new install and set up over them. */
function lsRead(k){var raw;try{raw=localStorage.getItem(k)}catch(e){return null}if(!raw)return null;
  try{return {value:JSON.parse(raw)}}catch(e){return {corrupt:true,raw:raw}}}
/* Settings and months as this page last read or wrote them. If storage holds something else, another copy of the page
   (a second Dovetail screen) changed it: this copy takes the newer data instead of saving its out-of-date copy over it. */
var seenRaw={};
function rawGet(k){try{return localStorage.getItem(k)}catch(e){return null}}
function markSeen(){seenRaw[K_CFG]=rawGet(K_CFG);seenRaw[K_MON]=rawGet(K_MON)}
function storageChanged(){return seenRaw.hasOwnProperty(K_CFG)&&(rawGet(K_CFG)!==seenRaw[K_CFG]||rawGet(K_MON)!==seenRaw[K_MON])}
function lsSet(k,v,force){try{if(!force&&(k===K_CFG||k===K_MON)&&storageChanged()){syncFromStorage();return "newer"}
  var t=JSON.stringify(v);localStorage.setItem(k,t);if(k===K_CFG||k===K_MON)seenRaw[k]=t;
  if(k===K_CFG||k===K_MON||k===K_W)queueNativeBackup();if(k===K_CFG||k===K_MON)queueSchedule();return true}catch(e){return false}}
function lsDel(k){try{localStorage.removeItem(k)}catch(e){}if(k===K_CFG||k===K_MON)seenRaw[k]=null}
var syncCount=0;
function syncFromStorage(){if(!cfg||!storageChanged())return false;syncCount++;setupNote=null;endTour(false,true);closeSheet(true);if(setup&&setup.change)setup=null;
  clearTimeout(saveT);saveT=null;clearTimeout(cfgT);cfgT=null;clearTimeout(remT);remT=null;
  // Settings gone (the other copy chose "Set up my own household"): start setup here too, rather than keep the old household.
  var sc=lsGet(K_CFG);if(sc)cfg=normCfg(sc);else{cfg=normCfg({schema:SCHEMA,appearance:cfg.appearance});setup=null}months=lsGet(K_MON)||{};markSeen();
  cur=months[monthKey]?clone(months[monthKey]):null;openOne=null;openBill=null;importOffer=null;hideUndo();paySig="";applyAppearance();
  if(cfg.setupDone)goMonth(monthKey);else{setup=null;startSetup();offerNewestBackup()}route();
  toast("Dovetail was changed on another screen, so this one has been brought up to date.");return true}
window.addEventListener("storage",function(e){if(e.key===K_CFG||e.key===K_MON||e.key===null)syncFromStorage()});
/* ---------- Android app bridge (window.PaydayNative). Absent in a browser, where everything works without it. ---------- */
var NATIVE=(function(){try{return window.PaydayNative||null}catch(e){return null}})();
var restoreOffer=null,nbT=null,lockBusy=false;
function nativeCall(fn,fallback){try{return fn()}catch(e){return fallback}}
function backupsAllowed(){return !!(NATIVE&&cfg&&cfg.setupDone&&!cfg.example&&!restoreOffer)}
function queueNativeBackup(delay){if(!backupsAllowed())return;clearTimeout(nbT);nbT=setTimeout(flushNativeBackup,delay==null?2500:delay)}
function flushNativeBackup(){clearTimeout(nbT);nbT=null;if(!backupsAllowed())return;nativeCall(function(){NATIVE.saveBackup(backupText())})}
/* Reminder notifications: the page works out what to notify (notificationSchedule in analysis.js) and hands the list to
   the app whenever settings or months change. The app posts each entry on its day; it stores which ones it has posted. */
var schT=null,notifyBusy=false,notifyRefused=false;
function notifyNative(){return !!(NATIVE&&typeof NATIVE.setNotificationSchedule==="function")}
function queueSchedule(delay){if(!notifyNative()||!cfg||!cfg.setupDone||cfg.example)return;clearTimeout(schT);schT=setTimeout(flushSchedule,delay==null?2000:delay)}
function flushSchedule(){clearTimeout(schT);schT=null;if(!notifyNative()||!cfg||!cfg.setupDone||cfg.example)return;
  var entries=[];try{entries=notificationSchedule(cfg,months,todayStr())}catch(e){entries=[]}
  nativeCall(function(){NATIVE.setNotificationSchedule(JSON.stringify({version:1,time:cfg.notify.time,amounts:!!cfg.notify.amounts,entries:entries}))})}
function nativeNotifyOn(){return !!(notifyNative()&&nativeCall(function(){return NATIVE.notificationsEnabled()&&NATIVE.notificationsAllowed()},false))}
/* Setup on a phone with automatic backups offers to restore the newest one. */
function offerNewestBackup(){var nb=nativeBackups();restoreOffer=nb.length?nb[0]:null}
function nativeBackups(){if(!NATIVE)return [];var s=nativeCall(function(){return NATIVE.listBackups()},"[]");try{var a=JSON.parse(s||"[]");return Array.isArray(a)?a:[]}catch(e){return []}}
function backupWhen(b){var p=String(b.savedAt||"").split("T"),d=p[0]||"",t=(p[1]||"").slice(0,5);return validDate(d)?fmtDate(d)+(t?", "+t:""):b.name}
/* Results from the app: the lock (on/off after the fingerprint prompt), a backup file opened or picked ("import"). */
window.paydayNativeEvent=function(type,value,ok){
  if(type==="import"){if(ok)offerImport(String(value||""));else importFailed(String(value||""));return}
  if(type==="open"){if(value==="due"&&cfg&&cfg.setupDone)goTab("due");return}
  if(type==="notify"){notifyBusy=false;notifyRefused=!ok;if(cfg){cfg.notify.on=!!(ok&&value);saveCfg(true)}
    if(ok&&value)flushSchedule();toast(ok?(value?"Notifications are on":"Notifications are off"):"Notifications weren't turned on");if(tab==="settings"){renderNotifySet();updateSums()}return}
  if(type!=="lock")return;lockBusy=false;
  toast(ok?(value?"App lock is on":"App lock is off"):"App lock wasn't changed");if(tab==="settings")renderLockSet()};
/* Leaving the app (or Android closing it): save anything still waiting on a short timer, then back up straight away. */
document.addEventListener("visibilitychange",function(){if(document.visibilityState==="visible"&&cfg){syncFromStorage();return}if(document.visibilityState!=="hidden"||!cfg)return;
  savePending();if(nbT)flushNativeBackup();if(schT)flushSchedule()});
/* The same when the page itself is being torn down (the app releases its WebView when the screen is rebuilt, 2.13), in case the hidden state hasn't arrived first. */
/* Save everything that's waiting on a timer now. pagehide calls it, and since 2.13 the app does too when it's paused
   (MainActivity.onPause), because destroying the WebView can drop the page's timers before pagehide runs. */
window.paydayFlush=function(){if(!cfg)return;savePending();if(nbT)flushNativeBackup();if(schT)flushSchedule()};
window.addEventListener("pagehide",function(){window.paydayFlush()});
/* Anything typed that's still waiting on a short timer, saved now (leaving the app, or sending an update file). */
function savePending(){try{if(saveT){clearTimeout(saveT);saveT=null;flushMonth()}if(cfgT||remT){clearTimeout(cfgT);clearTimeout(remT);cfgT=remT=null;saveCfg(true);afterCfgChange()}}catch(e){}}

var cfg,months,wealthRaw=null,storageOK=true;
var monthKey=defaultMonth({}),tab="pay";
function saveCfg(quiet){var r=lsSet(K_CFG,cfg);if(r==="newer")return false;if(!r){toast("Couldn't save – phone storage problem");return false}if(!quiet)toast("Saved");return true}
function saveMonths(){var r=lsSet(K_MON,months);if(r==="newer")return false;if(!r){toast("Couldn't save – phone storage problem");return false}return true}

/* ---------- the household: people, accounts and where each account's leftover goes ---------- */
function payCfg(){return (cfg&&cfg.payday)||{}}
/* The budget month it is now (not the one on screen). */
function thisMonth(){return defaultMonth(payCfg())}
/* ---------- dated edits (2.12, stage 4) ----------
   With months saved before the pay month the app opens on (thisMonth), a change to an item's amount or account (or a
   bill's months) applies from that month, and earlier months keep what it was (dateEdit in calc.js); an item added
   starts then, and one deleted still counts before then. A line under the item says so, with a way to change earlier
   months too. A household with no saved months yet changes every month, as before. */
function datesEdits(){return hasHistory(months,thisMonth())}
function dated(list,x,before,from){var k=thisMonth();if(datesEdits())dateEdit(list,x,before,from&&from>k?from:k)}
/* 2.15: the same for a person's usual pay (before = personSnap before the edit), from the month the app opens on. */
function datedPay(p,before){if(datesEdits())datePersonEdit(p,before,thisMonth())}
function startsNow(x){if(datesEdits())x.start=thisMonth();return x}
/* 2.13: where keyboard focus goes after an item in a list is deleted (the list is drawn again): the next item in the
   list, else the one before, else fallback (the list's "Add" button). Returns a selector, worked out before the delete. */
function nextFocus(node,itemSel,listSel,selFor,fallback){var all=[].slice.call(document.querySelectorAll(listSel+" "+itemSel)),i=all.indexOf(node),n=i>=0?all[i+1]||all[i-1]:null;
  return n&&n.id?selFor(n):fallback}
function focusOn(sel){var e=sel&&document.querySelector(sel);if(!e)return false;try{e.focus({preventScroll:true})}catch(x){}return true}
/* Remove an item (Undo puts it back): kept for earlier months when edits are dated. */
function removeItem(list,x,msg,after,focusSel){var k=thisMonth(),dates=datesEdits(),ix=cfg[list].indexOf(x);if(ix<0)return;var copy=clone(x);
  cfg[list].splice(ix,1);if(dates)endItem(cfg,list,x,k);var sc0=syncCount;after();
  if(syncCount!==sc0)return; // the save was refused because another copy had newer data: nothing to undo
  offerUndo(msg+(dates&&!(x.start&&x.start>=k)?". Earlier months keep it":""),function(){var l=cfg[list];if(l.some(function(y){return y.id===copy.id}))return;
    l.splice(Math.min(ix,l.length),0,copy);unendItem(cfg,list,copy.id);after()},focusSel)}
/* The line under an item changed or added this pay month: what earlier months keep, and a button to change them too.
   list "people" (2.15): a person whose usual pay changed this pay month (no account, no start). */
function datedNote(list,x,id,after,focusId){var box=el("div","dated");box.id=id;box.setAttribute("aria-live","polite");box.setAttribute("data-focus",focusId||"");fillDatedNote(box,list,x,after);return box}
function fillDatedNote(box,list,x,after){clear(box);var k=thisMonth(),last=datedNow(x,k),pay=list==="people",af=pay?"usualPay":"amount",acc=pay?null:ITEM_DATED[list][1],t=null,btn=null;box.hidden=true;
  if(x.start&&x.start===k&&datesEdits()){t="New from "+mLabel(k)+": earlier months don't have it.";btn="Add it to earlier months too"}
  // 2.16: a person on a pattern now or before: "Earlier months keep £1,500.00 each time." (pay each time changed) or, for
  // a change of pattern, "From February 2027. Earlier months keep monthly pay of £2,300.00." (or "… £420.00 a week.").
  else if(last&&pay&&(patternOf(last)||patternOf(x))){var lt=patternOf(last),xt=patternOf(x);
    if(lt&&xt&&lt.every===xt.every){if(Math.abs(lt.each-xt.each)<0.005)return;t="Changed from "+mLabel(k)+". Earlier months keep "+fmt(lt.each)+" each time."}
    else t="From "+mLabel(k)+". Earlier months keep "+(lt?patternWords(lt):num(last.usualPay)>0?"monthly pay of "+fmt(num(last.usualPay)):"no usual pay")+".";
    btn="Change earlier months too"}
  else if(last){var amt=num(last[af])!==num(x[af]),parts=[amt?(pay&&!(num(last[af])>0)?"no usual pay":fmt(num(last[af]))):"it"];
    if(acc&&last[acc]!==x[acc])parts.push((list==="income"?"paid into ":"paid from ")+accName(last[acc]));
    if(list==="bills"&&JSON.stringify(last.months||[])!==JSON.stringify(x.months||[])){var lm=arr(last.months);parts.push(!lm.length||lm.length>=12?"every month":"in "+listAnd(lm.slice().sort(function(a,b){return a-b}).map(function(m){return MS[m-1]})))}
    if(parts.length<2&&!amt)return;t="Changed from "+mLabel(k)+". Earlier months keep "+(amt?parts.join(", "):parts.join(" "))+".";btn="Change earlier months too"}
  if(!t)return;box.hidden=false;box.appendChild(el("span","small",t));
  var b=el("button","linkbtn",btn);b.type="button";b.id=box.id+"_all";b.addEventListener("click",function(){var cb=pay?clone(cfg):null;if(x.start===k)delete x.start;else undateLast(x);if(cb)refreezeEvery(cb,x.id);var fid=box.getAttribute("data-focus");cfgNow();if(after)after();
    var f=$(box.id);if(f)fillDatedNote(f,list,x,after);var g=fid&&$(fid);if(g)try{g.focus({preventScroll:true})}catch(e){}});box.appendChild(b)}
function person(id){return cfg?personById(cfg,id):null}
function accName(id){var a=accById(cfg,id);return a?a.name||"Unnamed account":"Missing account"}
function colourVar(k){return "var(--c-"+(COLOURS.some(function(c){return c[0]===k})?k:"grey")+")"}
/* "Current account (Sam)": an account only one person is paid into is labelled with their name */
function acctLabel(id){var a=accById(cfg,id);if(!a)return "Missing account";var who=cfg.people.filter(function(p){return p.payAccount===id});
  return (a.name||"Unnamed account")+(who.length===1&&who[0].name?" ("+who[0].name+")":"")}
/* An account's badge: a coloured circle with its initials (drawn by CSS from data-i, so it never adds to the text a
   screen reader or a test reads; the account's name is always written next to it). An account only one person is paid
   into uses that person's initial. */
function initials(id){var a=accById(cfg,id);if(!a)return "?";var who=cfg.people.filter(function(p){return p.payAccount===id});
  var first=function(t){return (Array.from(String(t||"").trim())[0]||"").toUpperCase()};
  if(who.length===1&&who[0].name)return first(who[0].name)||"?";
  var w=String(a.name||"").replace(/\baccount\b/ig,"").replace(/['’]s\b/g,"").trim().split(/\s+/).filter(Boolean);
  return (w.length>1?first(w[0])+first(w[1]):first(w[0]))||"?"}
function avatar(id,big,text){var a=accById(cfg,id),s=el("span","av"+(big?"":" sm"));s.setAttribute("aria-hidden","true");s.setAttribute("data-i",text!=null?text:initials(id));
  s.style.setProperty("--c",a?colourVar(a.colour):"var(--muted)");return s}
function acctTag(id,plain){var s=el("span","acct");s.appendChild(avatar(id));s.appendChild(document.createTextNode(plain?accName(id):acctLabel(id)));return s}
/* Money set like money: pounds in the display face, pence smaller. textContent stays "£1,234.56". */
function moneyEl(x,cls,id){var t=fmt(x),i=t.lastIndexOf("."),e=el("span","mny"+(cls?" "+cls:""));if(id)e.id=id;
  if(i<0){e.textContent=t;return e}e.appendChild(document.createTextNode(t.slice(0,i)));e.appendChild(el("span","p",t.slice(i)));return e}
function setMoney(e,x){var n=moneyEl(x);clear(e);while(n.firstChild)e.appendChild(n.firstChild)}
/* A light tap on the phone (Android's haptic feedback, no permission needed): "tick", "untick", "done". */
function haptic(kind){if(NATIVE&&typeof NATIVE.haptic==="function")nativeCall(function(){NATIVE.haptic(kind)})}
/* The hero figure rolls briefly to a new value (not when the phone asks for reduced motion). */
var heroShown=null,heroRaf=0;
function rollHero(e,to){cancelAnimationFrame(heroRaf);var from=heroShown;
  if(reduceMotion||from==null||Math.abs(from-to)<0.005||!window.requestAnimationFrame){heroShown=to;setMoney(e,to);return}
  setMoney(e,from); // never blank: start from the figure that was on screen
  var t0=0;function step(ts){if(!t0)t0=ts;var k=Math.min(1,(ts-t0)/380),q=1-Math.pow(1-k,3);heroShown=k<1?from+(to-from)*q:to;setMoney(e,heroShown);if(k<1)heroRaf=requestAnimationFrame(step)}
  heroRaf=requestAnimationFrame(step)}
function accountOptions(c,exclude){return c.accounts.filter(function(a){return !exclude||exclude.indexOf(a.id)<0}).map(function(a){return [a.id,(a.name||"Unnamed account")+(a.closedFrom?" (closed from "+mShort(a.closedFrom)+")":"")]})}

/* The transfer calculation is calc() in calc.js (README, "How the transfers are worked out"); the Pay tab below draws it. */
/* ---------- PAY TAB ---------- */
var cur=null,saveT=null,openOne=null;
function fieldVal(id){var i=$(id);if(!i)return null;var r=parseMoney(i.value,false);return r.empty||r.invalid?null:r2(r.value)}
/* Each person's pay for the month on screen, from the pay boxes. estimated: people whose box is empty (or can't be read),
   so the estimate is used; filled: people whose box holds the estimate that ticking a transfer filled in (payEstimated).
   2.16 (E6): vals is the pay the transfers use, from planPay with the boxes and the month's extra paydays as they are now
   (live), so an extra payday set aside is left out; plan is planPay's answer; est the estimate ({v, from}) for an empty box.
   2.17 (13.2, L3): the boxes as they are now go through freezePaydays, as flushMonth's save will, so a count frozen by
   what's just been typed, the extra payday line it opens and its default following the pay show at once and nothing
   jumps when the save lands. work: that working copy (its paydays and extra), which the extra payday line is drawn from. */
var work=null;
function readPay(){
  var out={vals:{},estimated:[],invalid:[],est:{},filled:[]},pe=(cur&&cur.payEstimated)||{},live={pay:{},payEstimated:pe},none=payEstimates(),typed={};
  cfg.people.forEach(function(p){var i=$("pay_"+safeId(p.id)),r=parseMoney(i?i.value:"",false);out.est[p.id]={v:none[p.id].arrived,from:none[p.id].from};
    if(r.invalid){out.invalid.push(p.id);live.pay[p.id]=null;out.estimated.push(p)}
    else if(r.empty){live.pay[p.id]=null;out.estimated.push(p)}else{live.pay[p.id]=r.value;typed[p.id]=r.value;if(pe[p.id])out.filled.push(p)}});
  work=freezePaydays(cfg,months,monthKey,Object.assign({},cur||{},{pay:typed,payEstimated:pe}),months[monthKey]||{});
  live.extra=isObj(work.extra)?work.extra:{};live.paydays=isObj(work.paydays)?work.paydays:{};
  out.plan=planPay(cfg,months,monthKey,live);cfg.people.forEach(function(p){out.vals[p.id]=out.plan[p.id].used});
  return out}
/* 2.16: planPay for the month on screen with every pay box empty: each person's estimate (arrived) and where it's from. */
function payEstimates(){return planPay(cfg,months,monthKey,{pay:{}})}
/* Everyone whose pay this month is an estimate, typed box or not. */
function estimatedPeople(p){return p.estimated.concat(p.filled)}
function curOneOffs(){return (cur&&Array.isArray(cur.oneOffs))?cur.oneOffs:[]}
function goMonth(k){
  if(saveT){clearTimeout(saveT);saveT=null;flushMonth()}
  if(tab==="due"&&k!==monthKey)remMonthHint=false; // Reminders' "change month above" hint has done its job
  monthKey=k;cur=months[k]?clone(months[k]):null;work=null;xArm=null;xOpened={};xFresh();
  // A one-off being edited belongs to the old month and closes (its changes were saved above); a new one-off that's
  // still being typed stays open, so nothing typed is lost, and is added to the month now on screen.
  openOne=openOne==="new"?"new":null;arm=null;
  $("monthLabel").textContent=mLabel(k);
  renderPayInputs();renderPay();if(tab==="analysis")keepScroll(renderAnalysis);else if(tab==="due")keepScroll(renderDue);
}
function renderPayInputs(){
  // Keep anything typed but not saved yet (e.g. when a person is added in Settings straight after typing pay).
  if(saveT){clearTimeout(saveT);saveT=null;flushMonth()}
  var g=clear($("payGrid"));
  if(!cfg.people.length){var b=el("button","linkbtn","Add the people who get paid in Settings › People");b.addEventListener("click",function(){openSettings("sPeople")});g.appendChild(b);return}
  var mc=monthCfg(),none=payEstimates();
  cfg.people.forEach(function(p,ix){var id=safeId(p.id),e={v:none[p.id].arrived},pa=(personById(mc,p.id)||p).payAccount;
    var f=el("div","field payrow");f.appendChild(avatar(pa,true,(p.name||"?").trim().charAt(0).toUpperCase()||"?"));
    var l=el("label");l.htmlFor="pay_"+id;l.appendChild(el("b",null,p.name||"Person "+(ix+1)));l.appendChild(el("span",null,"Into "+accName(pa)));f.appendChild(l);
    var mb=el("div","money");mb.id="payBox_"+id;mb.appendChild(el("span",null,"£"));
    var inp=el("input");inp.id="pay_"+id;inp.inputMode="decimal";inp.autocomplete="off";inp.setAttribute("enterkeyhint",ix<cfg.people.length-1?"next":"done");
    inp.value=cur&&cur.pay&&cur.pay[p.id]!=null?num(cur.pay[p.id]).toFixed(2):"";inp.placeholder=e.v?e.v.toFixed(2):"0.00";
    // Typing in a box filled with the estimate (when a transfer was ticked) makes it real pay.
    // (Something unreadable keeps the saved estimate, so it stays marked; an empty box drops both in flushMonth.)
    inp.addEventListener("input",function(){var rv=parseMoney(inp.value,false);if(!rv.invalid&&!rv.empty&&cur&&cur.payEstimated&&cur.payEstimated[p.id]){delete cur.payEstimated[p.id];if(!Object.keys(cur.payEstimated).length)delete cur.payEstimated}renderResults();queueMonthSave()});
    inp.addEventListener("blur",function(){var r=parseMoney(inp.value,false);if(!r.empty&&!r.invalid)inp.value=r.value.toFixed(2)});
    inp.addEventListener("keydown",function(ev){if(ev.key==="Enter"){ev.preventDefault();var nx=cfg.people[ix+1];if(nx&&$("pay_"+safeId(nx.id)))$("pay_"+safeId(nx.id)).focus();else inp.blur()}});
    mb.appendChild(inp);f.appendChild(mb);var h=el("div","hint");h.id="payHint_"+id;f.appendChild(h);
    // 2.16: under the pay of someone paid weekly, every two or four weeks: the extra payday, and the standing-order notice.
    var x=el("div","payx");x.id="payX_"+id;f.appendChild(x);g.appendChild(f)});
}
function renderPay(){if(!cfg.setupDone)return;renderOneOffs();renderResults()}
function renderResults(){
  if(!cfg.setupDone)return;
  var m=mNum(monthKey),p=readPay(),mc=monthCfg(),r=calc(mc,m,p.vals,curOneOffs()),done=(cur&&cur.done)||{};
  var ticked=anyTicked();
  cfg.people.forEach(function(pp){var id=safeId(pp.id),inp=$("pay_"+id);if(!inp)return;var bad=p.invalid.indexOf(pp.id)>=0;$("payBox_"+id).classList.toggle("err",bad);
    var h=$("payHint_"+id);h.className="hint"+(bad?" err":"");var e=p.est[pp.id],pl=p.plan[pp.id],pat=pl.kind==="pattern";
    if(bad)h.textContent="Enter an amount like 1850.00";
    // 2.17: with a recent payday, the hint counts the paydays and lists them (payHint), unless a tick filled the box.
    else if(pat&&pl.layer===2&&p.filled.indexOf(pp)<0)payHint(h,pp,pl,inp.value.trim()!=="");
    // 2.16: someone paid weekly, every two or four weeks types everything that's arrived since the last transfer day.
    else if(inp.value.trim()==="")h.textContent=pat?"Type everything that's arrived since your last transfer day (usually "+plural(pl.n,"payday")+"). Until then: "+eachTimes(pl)+".":e.from?"Using "+mShort(e.from)+": "+fmt(e.v):e.v?"Using usual pay: "+fmt(e.v):"Not typed in yet";
    // Filled in with the estimate when a transfer was ticked: say so until the real figure is typed.
    else if(p.filled.indexOf(pp)>=0){var v=p.vals[pp.id],same=Math.abs(v-e.v)<0.005;h.textContent=(same&&pat?eachTimes(pl):same?"Using "+(e.from?mShort(e.from):"usual pay")+": "+fmt(v):fmt(v))+" (estimated \u2014 tap to type what arrived)"}
    else h.textContent="";
    renderPayX(pp,pl,ticked)});
  renderNotice();renderActionBanner();renderPayLine();
  var pb=clear($("payBanner")),ep=estimatedPeople(p);
  // 2.16: someone on a pattern has their own sentence: "These transfers use Jordan's usual pay for 4 paydays."
  var epPat=ep.filter(function(x){return p.plan[x.id].kind==="pattern"}),epMon=ep.filter(function(x){return p.plan[x.id].kind!=="pattern"});
  // 2.17: with the paydays counted, the paydays these transfers use: min(M, N), never more than usual.
  if(ep.length&&cfg.people.length){var bt=epPat.map(function(x){var n=paydaysUsed(p.plan[x.id]),nm=x.name||"Someone";
      return n?"These transfers use "+possessive(nm)+" usual pay for "+plural(n,"payday")+".":nm+" has no paydays this month, so these transfers use none of "+possessive(nm)+" pay."}).join(" ");
    if(epMon.length){var fromLast=epMon.some(function(x){return p.est[x.id].from}),src=fromLast?"last month's pay":"usual pay";
      var all=epMon.length===cfg.people.length;
      bt=(all?"These transfers use "+src+".":"These transfers use "+src+" for "+listAnd(epMon.map(function(x){return x.name}))+".")+(bt?" "+bt:"")+" When pay arrives, type what reached your bank to make them exact."}
    pb.appendChild(el("div","banner",bt))}
  // steps
  // 2.13: a tick at an amount that has changed since isn't settled (nDone counts the settled ones, nTicked every tick):
  // "All transfers done", the ring's "done" and the phone's "done" tap wait for it. toSend is what's left to send (an
  // amount that went down has nothing to send, but still isn't settled). "N of M done" still counts ticks, as before.
  var ol=clear($("steps")),w=clear($("warnings")),nDone=0,nTicked=0,toSend=0;
  // 2.14: the first transfer into an account with a rough figure says what's in it that isn't listed yet (5.6).
  var unl={},figSaid={};mc.accounts.forEach(function(a){var x=r.A[a.id];if(x&&x.unlisted>0.004)unl[a.id]=x.unlisted});
  r.steps.forEach(function(s){
    var d=done[s.id],isDone=d!=null&&d!==false;if(isDone){nTicked++;if(typeof d==="number"&&Math.abs(d-r2(s.amt))>0.004)toSend+=Math.max(0,r2(s.amt)-d);else nDone++}
    var li=el("li","step"+(isDone?" done":""));li.setAttribute("data-id",s.id);
    var t=el("button","tick");t.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';t.setAttribute("aria-pressed",isDone?"true":"false");
    var label=accName(s.from)+" to "+(s.to?accName(s.to):s.toText)+" "+fmt(Math.abs(s.amt));
    t.setAttribute("aria-label",(isDone?"Done: ":"Mark done: ")+label);
    t.addEventListener("click",function(){toggleDone(s.id,s.amt)});
    var mid=el("div");mid.style.minWidth="0";
    var route=el("div","route");route.appendChild(acctTag(s.from));route.appendChild(el("span","arr","→"));
    if(s.to)route.appendChild(acctTag(s.to));else{var sv=el("span","acct");var sa=avatar(null,false,"£");sa.classList.add("pot");sv.appendChild(sa);sv.appendChild(document.createTextNode(s.toText));route.appendChild(sv)}
    mid.appendChild(route);var am=moneyEl(Math.abs(s.amt));am.className="amt mny";mid.appendChild(am);
    var cp=el("button","copy","Copy");cp.setAttribute("aria-label","Copy "+fmt(Math.abs(s.amt)));cp.addEventListener("click",function(){copyText(Math.abs(s.amt).toFixed(2),"Copied "+fmt(Math.abs(s.amt)))});
    li.appendChild(t);li.appendChild(mid);li.appendChild(cp);
    if(s.kind==="topup")li.appendChild(el("div","note","Top-up: "+accName(s.to)+" doesn't have enough for its own bills this month, so money goes back to it."+(s.short?" That's all "+accName(s.from)+" has: "+accName(s.to)+" is still "+fmt(s.short)+" short.":"")));
    if(s.kind==="contribute")li.appendChild(el("div","note",contribText(s,r,mc)));
    if(s.to&&unl[s.to]&&!figSaid[s.to]){figSaid[s.to]=1;var fn=el("div","note","Includes "+fmt(unl[s.to])+" of bills not listed yet.");fn.id="figNote_"+safeId(s.to);li.appendChild(fn)}
    // 2.16: a ticked step that went down says what to move back (every household); one that went up, what's still to send.
    if(isDone&&typeof d==="number"&&Math.abs(d-r2(s.amt))>0.004){var less=r2(d-r2(s.amt));
      li.appendChild(el("div","changed",less>0?"You ticked this at "+fmt(Math.abs(d))+" but it's now "+fmt(Math.abs(s.amt))+", "+fmt(less)+" less. Move "+fmt(less)+" back to "+accName(s.from)+", or untick and tick again once it's right."
        :"You ticked this at "+fmt(Math.abs(d))+" but it's now "+fmt(Math.abs(s.amt))+" ("+fmtS(r2(s.amt)-d)+"). Send the difference, or untick and tick again once it's right."))}
    ol.appendChild(li);
    if(s.kind==="topup")w.appendChild(el("div","banner",accName(s.to)+" doesn't have enough for its bills this month, so "+accName(s.from)+" tops it up with "+fmt(s.amt)+"."));
  });
  // 2.12.1: a top-up from an account with nothing to send isn't a transfer to make: say what's short instead.
  arr(r.cant).forEach(function(s){var b=el("div","banner bad",accName(s.to)+" is "+fmt(s.short)+" short, and "+accName(s.from)+" has nothing to top it up with."+(sharesSet(s.to)?" Raise the set amounts paid into it, or move money into it.":" Move money into it, or trim a bill."));b.id="cant_"+safeId(s.to);w.appendChild(b)});
  if(!r.steps.length)ol.appendChild(el("li","empty small muted","No transfers needed this month."));
  // An account with a figure that no transfer goes into (the pay goes straight there): said under the transfers.
  var fnl=$("figNote"),fr=Object.keys(unl).filter(function(id){return !figSaid[id]});fnl.hidden=!fr.length;fnl.textContent=fr.map(function(id){return possessive(accName(id))+" bills include "+fmt(unl[id])+" not listed yet."}).join(" ");
  $("progressText").textContent=r.steps.length?nTicked+" of "+r.steps.length+" done":"";$("shareTransfers").hidden=!r.steps.length;
  $("shareTransfers").setAttribute("aria-label",sendsUpdate()?"Share this month's transfers or an update file":"Share this month's transfers");
  if(sendsUpdate())$("shareTransfers").setAttribute("aria-haspopup","dialog");else $("shareTransfers").removeAttribute("aria-haspopup");
  $("payDetailsSum").textContent=r2(r.flt)<0?fmt(-r.flt)+" short":fmt(r.flt)+" left over";
  var pd=$("payDetails"),want=payDetailsOpen!=null?payDetailsOpen:curOneOffs().length>0;if(pd.open!==want){pdExpect=want;pd.open=want}
  $("progressBar").style.width=(r.steps.length?Math.round(100*nTicked/r.steps.length):0)+"%";
  if(nDone===r.steps.length&&r.steps.length)w.appendChild(el("div","banner good alldone","All transfers done for "+mLabel(monthKey)+"."));
  else if(nTicked===r.steps.length&&r.steps.length){var un=r.steps.length-nDone,ub=el("div","banner unsettled",toSend>0.004?"All ticked, but "+fmt(toSend)+" is still to send.":"All ticked, but "+(un===1?"a transfer has":un+" transfers have")+" changed since: check "+(un===1?"it":"them")+" below.");ub.id="unsettled";w.appendChild(ub)}
  // First-month hint: until some month has every transfer ticked, or another month has been used (worked out from the
  // months), never for the example.
  $("firstHint").hidden=!!cfg.example||!r.steps.length||nTicked===r.steps.length||firstMonthDone(months,monthKey);
  lastR=r;
  renderHero(r,nTicked,nTicked-nDone);renderFloats(r,w);
  renderPayExtra();renderNotEvery();
  var st=clear($("stats"));
  [["Income",r.totalIn],["Bills",r.billsExSav],["Saving",r.totalSaving],["Budgets & one-offs",r.spend+r.oneOut]].forEach(function(x){var d=el("div","stat");d.appendChild(el("div","k",x[0]));d.appendChild(el("div","v",fmt(x[1])));st.appendChild(d)});
  var al=clear($("acctList"));
  mc.accounts.forEach(function(a){var box=el("div");var h=el("div","accthead");h.appendChild(acctTag(a.id));
    var tot=r.A[a.id].bills.reduce(function(s,b){return s+num(b.amount)},0)+(r.A[a.id].unlisted||0),ep=estimateParts(mc,a.id);h.appendChild(el("span","num",fmt(tot)));box.appendChild(h);
    // 2.14: "Joint: £1,120.00 listed · £380.00 not listed yet (your figure £1,500.00)", with a thin bar.
    if(ep.has)box.appendChild(figLine(a.id,ep,"bba_"+safeId(a.id)));
    var rr=el("div","rows");mc.bills.filter(function(b){return b.account===a.id}).forEach(function(b){var on=applies(b,m);var d=el("div","row sub");
      d.appendChild(el("span","k",b.name+(on?"":" (not this month)")+(b.savings?" · savings":"")));d.appendChild(el("span","v",on?fmt(num(b.amount)):"–"));rr.appendChild(d)});
    if(!rr.firstChild&&!ep.has)rr.appendChild(el("div","small muted","No bills from this account."));
    box.appendChild(rr);al.appendChild(box)});
}
/* The first thing on the Pay tab: what's left this month (all floats together), progress through the transfers, and
   a warning if the figures don't reconcile (nothing is shown when they do). */
/* 2.12: what a contribution is, under its transfer: "Alex's share (60%)", "Alex's share (half each)" or "Kit's board"
   (contribWords, 2.13). */
function contribText(s,r,mc){return contribWords(mc,r,s)}
/* 2.12.1: whether an account is paid for by set amounts (so a shortfall there means raising them). */
function sharesSet(id){var a=accById(monthCfg(),id),f=a&&a.funding;return isObj(f)&&(f.rule==="set"||isObj(f.set))}
/* The settings for the month on screen: the way the household manages its money then (cfgFor, 2.12). */
function monthCfg(){return cfgFor(cfg,monthKey,curOneOffs())}
/* ---------- the extra payday and standing orders on the Pay tab (2.16, docs/payperiods.md 5.3.4, 5.3.6, E7, E10, E11) ----------
   Under the pay of someone paid weekly, every two or four weeks, once their pay is typed (E7): "Had an extra payday?",
   which opens a line (cur.extra[personId] = {amount, counted?}) pre-filled with pay each time. Set aside (the default)
   leaves it out of the transfers; "Count it this month" puts it back in. Ticks come first: with any transfer ticked the
   line opens counted, and "Set it aside" takes a second tap ("Set it aside anyway") after a warning, since it lowers
   ticked transfers (each then says what to move back). xArm: the person whose "Set it aside" is waiting for that second
   tap; xOpened: people whose line just opened counted because of ticks (it says why until the next change). */
/* 2.17: xHad, people whose extra payday line was already there when the month was opened; xHeard, people whose line's
   head has been read out since. */
var xHad={},xHeard={},xBlurT=null;
/* The month on screen replaced (a change of interval, a change of style or its undo): its lines are as they were saved. */
function xFresh(){xHeard={};xHad={};if(cur&&isObj(cur.extra))Object.keys(cur.extra).forEach(function(pid){xHad[pid]=true})}
var xArm=null,xOpened={},X_RULES={afterOwn:"Counting it changes the shares, because you share what's left after your own bills.",sameLeft:"Counting it changes the shares, because you share so you each keep the same."};
/* Whether any transfer in the month on screen is ticked. */
function anyTicked(){var d=(cur&&cur.done)||{};return Object.keys(d).some(function(k){return d[k]!=null&&d[k]!==false})}
/* "4 × £420.00" (one payday: "£1,560.00"): an estimate from pay each time. 2.17: for that many paydays (paydaysUsed). */
function eachTimes(pl){var k=paydaysUsed(pl);return k>1?k+" × "+fmt(pl.each):fmt(k?pl.each:0)}
/* The paydays an estimate is for: the usual number, or (2.17, counted) min(M, N). */
function paydaysUsed(pl){return pl.layer===2?Math.min(pl.m,pl.n):pl.n}
/* "£171.50 a week to Bills account": one standing order. */
function orderWords(o){return fmt(o.amount)+" "+(o.word==="week"?"a week":"every "+o.word)+" to "+o.name}
/* The extra payday of person pid in the month on screen (2.17: in the working copy, so a line the count has just opened
   is there before it's saved), or null. */
function extraOf(pid){var d=work||cur,x=d&&isObj(d.extra)?d.extra[pid]:null;return isObj(x)?x:null}
/* Change (or with fn null, remove) person pid's extra payday, then redraw and save. 2.17: from the working copy, whose
   count and extra payday lines (frozen by what's typed) the month then keeps. */
function setExtra(pid,fn,later){clearTimeout(xBlurT);xBlurT=null;cur=cur||{};if(work){if(isObj(work.paydays))cur.paydays=clone(work.paydays);if(isObj(work.extra))cur.extra=clone(work.extra)}
  var ex=Object.assign({},isObj(cur.extra)?cur.extra:{});
  if(fn)ex[pid]=fn(Object.assign({},ex[pid]||{}));else delete ex[pid];if(Object.keys(ex).length)cur.extra=ex;else delete cur.extra;
  renderResults();if(later)queueMonthSave();else{if(saveT){clearTimeout(saveT);saveT=null}flushMonth()}}
/* Text for a live region, set 0.7 s after the last change (so it's read out once typing stops), or straight away. */
function sayLater(n,t,now){clearTimeout(n._sayT);if(now||n.textContent===t){n.textContent=t;return}n._sayT=setTimeout(function(){n.textContent=t},700)}
/* The share rule under which counting someone's extra payday changes the shares (5.3.4), or null. */
function xRule(pid){var r=null;monthCfg().accounts.forEach(function(a){var f=a.funding;if(!r&&isObj(f)&&arr(f.people).indexOf(pid)>=0&&X_RULES[f.rule])r=f.rule});return r}
/* Person pp's part under their pay box: drawn again only when what it shows changes, so typing keeps its place.
   2.17 (docs/payperiods.md 13.2, L3, L6, L15): for someone with a recent payday, the extra payday line can open by itself
   (the count found more paydays than usual: "Jordan has 5 paydays since …, one more than usual: …", with "Not an extra
   payday" in place of Remove), read "All 5 of Jordan's paydays are in these transfers." with "It was an extra payday", or
   be locked ("Used in May 2027.") while a later month's one-off uses it; and a month with fewer paydays than usual has the
   gap line, with "Use it this month" when last month's extra payday was set aside. */
function renderPayX(pp,pl,ticked){var id=safeId(pp.id),box=$("payX_"+id);if(!box)return;
  var pat=pl.kind==="pattern",x=pat&&pl.typed?extraOf(pp.id):null,name=pp.name||"Someone",inp=$("pay_"+id);
  var first=pat&&!cfg.example&&!firstMonthDone(months,monthKey),note=pat?standingOrdersNotice(cfg,months,monthKey,pp.id):null,nt="";
  if(note&&note.kind==="first")nt="From your next pay, standing orders of "+listAnd(note.orders.map(orderWords))+" cover these transfers every month. This month, make them as usual.";
  else if(note)nt=possessive(name)+" standing order to "+note.name+" needs to be "+fmt(note.amount)+" "+(note.word==="week"?"a week":"every "+note.word)+" from your next pay (it was "+fmt(note.was)+"). This month, make the transfer as usual.";
  var st=x?extraState(cfg,months,monthKey,pp.id,work||cur||{}):null,fr=!!st&&st.opened==="freeze",lock=!!st&&!!st.lockedIn,not=!!st&&st.not;
  // While the amount is being typed in, the line stays as it is: clearing it or typing 0 on the way to another figure
  // isn't "Not an extra payday" (that's its button, or leaving the field at £0).
  if(not&&document.activeElement&&document.activeElement.id==="extraAmt_"+id){not=false;st=Object.assign({},st,{not:false})}
  var counted=!!(x&&x.counted===true),armed=!!x&&!lock&&xArm===pp.id,warn=!!x&&!lock&&ticked&&(armed||!counted),rule=x&&!counted&&!not&&!lock?xRule(pp.id):null;
  // The gap line: fewer paydays than usual (L15), and what last month's extra payday can do about it (L6).
  var gap=pat&&pl.layer===2&&pl.m<pl.n,used=gap?extraUsedIn(months,monthKey,pp.id):null,offer=gap&&!used?useExtraOffer(cfg,months,monthKey,pp.id):null;
  var gapOn=gap&&(pl.m>0||!!used||!!offer),dd=pat&&pl.layer===2?paydaysShown(pl):null;
  var sig=JSON.stringify([pat,pat&&pl.typed,!!x,counted,armed,!!xOpened[pp.id],warn,rule,first,nt,name,st,fr&&!not?[pl.m,dd]:null,gapOn?[pl.m,pl.n,dd,used&&[used.id,used.amount],offer&&offer.amount]:null]);
  if(inp){if(nt)inp.setAttribute("aria-describedby","soNote_"+id);else inp.removeAttribute("aria-describedby")}
  var sayText=!x?"":lock?usedInWords(st.lockedIn):not?notExtraWords(name,st.m):xOpened[pp.id]&&counted?"Some of these transfers are ticked already, so this extra payday is counted. Set it aside and the ticked ones will show what to move back."
    :counted?possessive(name)+" extra payday ("+fmt(num(x.amount))+") is counted in these transfers.":"Set aside: it stays in "+possessive(name)+" account and isn't in these transfers.";
  if(box.getAttribute("data-sig")===sig){var sy=$("extraSay_"+id);if(sy)sayLater(sy,sayText);if(lock||fr){var ai0=$("extraAmt_"+id);if(ai0&&document.activeElement!==ai0)ai0.value=money2(x.amount)}return}
  var a=document.activeElement,fid=a&&box.contains(a)?a.id:null;box.setAttribute("data-sig",sig);clear(box);
  if(first)box.appendChild(el("div","small muted","This is your first transfer day: if some of that pay is already spent, type what's left of it."));
  if(pat&&pl.typed&&!x){var lk=el("button","linkbtn","Had an extra payday?");lk.type="button";lk.id="extraAdd_"+id;lk.setAttribute("aria-label","Had an extra payday, "+name+"?");
    lk.addEventListener("click",function(){var t=anyTicked();xArm=null;xOpened={};if(t)xOpened[pp.id]=true;setExtra(pp.id,function(){var o={amount:r2(pl.each)};if(t)o.counted=true;return o});focusOn("#extraAmt_"+id)});box.appendChild(lk)}
  if(x){var xb=el("div","box");xb.id="extra_"+id;xb.setAttribute("role","group");xb.setAttribute("aria-label",possessive(name)+" extra payday");
    // 2.17: a line the count opened starts with why (read out when it opens by itself).
    if(fr&&!not){var hd=el("div","small"),fill=function(){clear(hd);var w=paydayLine(name+" has ",pl,", "+moreWords(pl.m-pl.n)+" than usual");while(w.firstChild)hd.appendChild(w.firstChild)};hd.id="extraHead_"+id;xb.appendChild(hd);
      // Read out once, when the count opens the line (not when a month that already had it is opened, nor on each redraw).
      if(!xHad[pp.id]&&!xHeard[pp.id]){xHeard[pp.id]=true;hd.setAttribute("aria-live","polite");setTimeout(function(){if(hd.isConnected)fill()},30)}else fill()}
    if(!not){var ai=textIn(money2(x.amount),function(v){var r=parseMoney(v,false),bad=r.invalid||(!r.empty&&r.value<0);ai.classList.toggle("bad",bad);if(bad){ai.setAttribute("aria-invalid","true");return}ai.removeAttribute("aria-invalid");
        // 2.17 (L3): an amount typed on a line the count opened is the household's own, and no longer follows the pay.
        setExtra(pp.id,function(o){o.amount=r.empty?0:r2(r.value);if(fr)o.edited=true;return o},true)},"extraAmt_"+id,true);
      if(lock){ai.readOnly=true;ai.setAttribute("aria-describedby","extraSay_"+id)}
      // Left at £0, a line the count opened becomes "Not an extra payday" (drawn again once focus has moved on).
      // A press on one of the line's buttons goes ahead (its own change draws the line again); otherwise focus moves to "It
      // was an extra payday" when the line becomes that.
      if(fr)ai.addEventListener("blur",function(e){var rt=e.relatedTarget,mine=!!(rt&&rt.tagName==="BUTTON"&&xb.contains(rt));clearTimeout(xBlurT);
        xBlurT=setTimeout(function(){xBlurT=null;if(document.activeElement===ai)return;renderResults();var f=document.activeElement;if((!f||f===document.body)&&$("extraWas_"+id))focusOn("#extraWas_"+id)},mine?300:0)});
      xb.appendChild(labeled("Extra payday (£)",ai))}
    // A live region drawn empty, then filled, so the new state is read out after a redraw.
    var say=el("div","small");say.id="extraSay_"+id;say.setAttribute("aria-live","polite");xb.appendChild(say);setTimeout(function(){if(say.isConnected)say.textContent=sayText},30);
    if(warn){var w=el("div","banner","Some transfers are ticked already. Setting this aside lowers them, and Dovetail will show what to move back.");w.id="extraWarn_"+id;xb.appendChild(w)}
    if(rule){var rn=el("div","small muted",X_RULES[rule]);rn.id="extraRule_"+id;xb.appendChild(rn)}
    var br=el("div","btnrow"),b1;
    if(lock)b1=null;
    else if(not){b1=el("button","btn ghost",armed?"Set it aside anyway":"It was an extra payday");b1.id="extraWas_"+id;b1.setAttribute("aria-label",armed?"Set "+possessive(name)+" extra payday aside anyway":"It was an extra payday, "+name);if(warn)b1.setAttribute("aria-describedby","extraWarn_"+id);
      b1.addEventListener("click",function(){
        // E10: it lowers the pay used, so with anything ticked the first tap warns.
        if(anyTicked()&&xArm!==pp.id){xArm=pp.id;renderResults();focusOn("#extraWas_"+id);return}
        xArm=null;setExtra(pp.id,function(o){delete o.edited;delete o.counted;var d=extraDefaultFor(cfg,months,monthKey,pp.id,work||cur||{});o.amount=d!=null?d:r2(pl.each);return o});focusOn("#extraCount_"+id)})}
    else if(!counted){b1=el("button","btn ghost","Count it this month");b1.id="extraCount_"+id;b1.setAttribute("aria-label","Count "+possessive(name)+" extra payday this month");
      b1.addEventListener("click",function(){xArm=null;delete xOpened[pp.id];setExtra(pp.id,function(o){o.counted=true;return o});focusOn("#extraAside_"+id)})}
    else{b1=el("button","btn ghost",armed?"Set it aside anyway":"Set it aside");b1.id="extraAside_"+id;if(warn)b1.setAttribute("aria-describedby","extraWarn_"+id);

      b1.addEventListener("click",function(){delete xOpened[pp.id];
        // E10: with anything ticked, the first tap warns; the second sets it aside.
        if(anyTicked()&&xArm!==pp.id){xArm=pp.id;renderResults();focusOn("#extraAside_"+id);return}
        xArm=null;setExtra(pp.id,function(o){delete o.counted;return o});focusOn("#extraCount_"+id)})}
    if(b1){b1.type="button";br.appendChild(b1)}
    if(fr&&!not&&!lock){var nb=el("button","btn ghost","Not an extra payday");nb.type="button";nb.id="extraNot_"+id;nb.setAttribute("aria-label","Not an extra payday, "+name);
      nb.addEventListener("click",function(){xArm=null;delete xOpened[pp.id];setExtra(pp.id,function(){return {amount:0,edited:true}});focusOn("#extraWas_"+id)});br.appendChild(nb)}
    else if(!fr&&!lock){var rm=el("button","btn ghost","Remove");rm.type="button";rm.id="extraRemove_"+id;rm.setAttribute("aria-label","Remove "+possessive(name)+" extra payday");
      rm.addEventListener("click",function(){xArm=null;delete xOpened[pp.id];setExtra(pp.id,null);focusOn("#extraAdd_"+id)});br.appendChild(rm)}
    if(br.firstChild)xb.appendChild(br);box.appendChild(xb)}
  if(gapOn){var gb=el("div","banner col");gb.id="gap_"+id;gb.tabIndex=-1;var gt=el("div");
    if(pl.m>0){var gw=paydayLine(name+" has ",pl,", not the usual "+pl.n);while(gw.firstChild)gt.appendChild(gw.firstChild);gt.appendChild(document.createTextNode(" These transfers use "+(pl.m===1?"that one.":"the "+pl.m+".")))}
    if(used||offer)gt.appendChild(document.createTextNode((pl.m>0?" ":"")+(used?usedExtraWords(cfg,pp.id,used):useExtraWords(cfg,pp.id,offer))));gb.appendChild(gt);
    if(offer){var ub=el("button","btn ghost","Use it this month");ub.type="button";ub.id="useExtra_"+id;ub.setAttribute("aria-label","Use "+possessive(name)+" extra payday from "+MN[mNum(offer.extraFrom)-1]+" this month");
      ub.addEventListener("click",function(){var o=useExtraOffer(cfg,months,monthKey,pp.id);if(!o)return;o.id=uid("o");cur=cur||{};cur.oneOffs=curOneOffs().concat([o]);
        if(saveT){clearTimeout(saveT);saveT=null}flushMonth();keepScroll(renderPay);updateBadge();focusOn("#gap_"+id)});
      var ur=el("div","btnrow");ur.appendChild(ub);gb.appendChild(ur)}
    box.appendChild(gb)}
  if(nt){var so=el("div","banner good",nt);so.id="soNote_"+id;box.appendChild(so)}
  if(fid)focusOn("#"+fid)}
/* 2.17: the dates a layer-2 entry shows: today's counted dates while they match the count, and only with a transfer day
   set (L8: with none, the 25th is used for counting, and no dates are shown). null otherwise. */
function paydaysShown(pl){return payCfg().day&&pl.dates?pl.dates:null}
/* "one more", "2 more" (than usual). */
function moreWords(k){return (k===1?"one":String(k))+" more"}
/* 2.17 (L15): "{start}5 paydays since Fri 30 Oct{mid}: 2, 9, 16, 23 and 30 Oct." with short dates hidden from screen
   readers and full ones beside them; with no dates to show, "…5 paydays since your last transfer day{mid}." or, when
   today's count no longer matches the one frozen, "…5 paydays (counted when this month was first saved){mid}.". */
function paydayLine(start,pl,mid){var f=document.createDocumentFragment(),dd=paydaysShown(pl),t=function(s){f.appendChild(document.createTextNode(s))};
  if(dd){t(start+paydaysN(pl.m)+" since ");f.appendChild(shortDates(transferWindow(cfg,monthKey).after));t(mid+": ");f.appendChild(shortDates(dd));var later=stillToCome(dd);t((later?" ("+later+" still to come)":"")+".")}
  else t(start+(payCfg().day?frozenWords(pl.m):paydaysN(pl.m)+" since your last transfer day")+mid+".");
  return f}
function stillToCome(dd){var t=todayStr();return dd.filter(function(d){return d>t}).length}
/* 2.17 (L15): the hint under the pay box of someone whose paydays are counted (planPay's layer 2). Not typed: the paydays
   since the last transfer day and the estimate ("4 paydays since Fri 30 Oct: 6, 13, 20 and 27 Nov (2 still to come).
   Until then: 4 × £420.00."); typed: the paydays, unless the extra payday line or the gap line already says them. */
function payHint(h,pp,pl,typed){clear(h);var name=pp.name||"Someone",more=pl.m>pl.n?", "+moreWords(pl.m-pl.n)+" than usual":"",t=function(s){h.appendChild(document.createTextNode(s))};
  if(typed&&pl.m>0){if(pl.m<pl.n||extraOf(pp.id))return;var w=paydayLine("",pl,"");while(w.firstChild)h.appendChild(w.firstChild);return}
  if(pl.m===0){if(paydaysShown(pl)){t("No paydays for "+name+" since ");h.appendChild(shortDates(transferWindow(cfg,monthKey).after));t(", not the usual "+pl.n+".")}
    else t("No paydays for "+name+" since your last transfer day, not the usual "+pl.n+".");return}
  if(pl.m<pl.n){t("Until then: "+eachTimes(pl)+".");return}
  var l=paydayLine("",pl,more);while(l.firstChild)h.appendChild(l.firstChild);
  t(" Until then: "+eachTimes(pl)+(more?"; the extra one is set aside once you type what arrived":"")+".")}

function renderHero(r,nDone,nChanged){
  var box=clear($("hero")),n=r.steps.length,neg=r2(r.flt)<0;box.classList.toggle("neg",neg);
  box.hidden=!cfg.people.length||!cfg.accounts.length;if(box.hidden){heroShown=null;return}
  var main=el("div","hmain");var h=el("h2","lbl",neg?"Short this month":"Left over this month");h.id="heroH";main.appendChild(h);
  var len=fmt(r.flt).length,v=el("div","hv mny"+(len>11?" longer":len>9?" long":""));v.id="heroFloat";rollHero(v,r.flt);main.appendChild(v);
  // Where it is: the accounts that keep what's left (a top-up's shortfall, marked short, isn't one; it's named below).
  var keepers=r.floats.filter(function(f){return !f.short}),wh=el("div","where");if(keepers.length===1){wh.appendChild(avatar(keepers[0].id));wh.appendChild(document.createTextNode("in "+accName(keepers[0].id)))}
  else wh.appendChild(document.createTextNode("across "+plural(keepers.length,"account")));main.appendChild(wh);
  var ks=personKeeps(monthCfg(),r);if(ks.length){var kl=el("div","keeps");kl.id="heroKeeps";ks.forEach(function(k,i){kl.appendChild(el("span",null,(k.p.name||"Someone")+(r2(k.amt)<0?" is short by "+fmt(-k.amt):" keeps "+fmt(k.amt))+(i<ks.length-1?",":"")))});main.appendChild(kl)}
  box.appendChild(main);
  if(n){var C=2*Math.PI*32,ring=el("div","ring");ring.setAttribute("role","img");ring.setAttribute("aria-label",nDone+" of "+n+" transfers "+(nChanged?"ticked, "+nChanged+" with a difference to send":"done"));
    ring.innerHTML='<svg viewBox="0 0 76 76" aria-hidden="true"><circle class="rb" cx="38" cy="38" r="32"/><circle class="rf" cx="38" cy="38" r="32" stroke-dasharray="'+C.toFixed(2)+'" stroke-dashoffset="'+(C*(1-nDone/n)).toFixed(2)+'"/></svg>';
    var rt=el("div","rt");rt.setAttribute("aria-hidden","true");rt.appendChild(el("b",null,nDone+"/"+n));rt.appendChild(el("span",null,nChanged?"ticked":"done"));ring.appendChild(rt);box.appendChild(ring)}
  // An account short: say so here, not only under the transfers. People's own accounts are in the list above; when the
  // whole month is short with one account, the heading says it (2.12.1: a joint account short is named even then).
  var kept=ks.map(function(k){return k.p.payAccount});
  shortAccounts(r).forEach(function(s){if(kept.indexOf(s.id)<0&&(!neg||shortNamed(r)))box.appendChild(el("div","hwarn",accName(s.id)+" is short by "+fmt(s.amount)))});
  // Silent when the figures reconcile; a warning with a way to fix it when they don't.
  if(!r.ok){var ck=el("div","banner bad col");ck.id="check";ck.setAttribute("role","group");ck.setAttribute("aria-label","The figures don't add up");
    ck.appendChild(el("div",null,"The figures don't add up: off by "+fmt(Math.abs(r.diff))+". Check that every bill, budget and savings transfer points at an account in Settings."));
    var ob=el("button","btn","Open accounts");ob.type="button";ob.addEventListener("click",function(){openSettings("sAccounts")});var row=el("div");row.appendChild(ob);ck.appendChild(row);box.appendChild(ck)}}
function renderFloats(r,w){
  var box=clear($("floatCards")),tops={};r.steps.forEach(function(s){if(s.kind==="topup")tops[s.to]=s.amt});
  // 2.12.1: a boarder's own account comes after the household's, and isn't counted in what's left.
  r.floats.concat(arr(r.outside).map(function(f){return Object.assign({out:true},f)})).forEach(function(f,ix){var s=r.A[f.id],card=el("section","card"),hid="flH_"+safeId(f.id);card.setAttribute("aria-labelledby",hid);
    var top=el("div","spread"),h=el("h2",null,accName(f.id)+" after the transfers");h.id=hid;top.appendChild(h);
    card.appendChild(top);if(f.out)card.appendChild(el("p","small muted","Their own money, so it isn't counted in what the household has left."+(f.amt<-0.004&&!s.pay.some(function(x){return x.v>0})?" Their pay isn't in, so it shows only what goes out.":"")));
    var rows=el("div","rows");rows.id="floatRows_"+safeId(f.id);
    // Money in: "+ £x" in the accent colour. Money out: muted, "− £x".
    function row(k,v,isSub){var d=el("div","row"+(isSub?" sub":""));d.appendChild(el("span","k",k));d.appendChild(el("span","v",v));rows.appendChild(d)}
    function rin(k,v){var d=el("div","row in");d.appendChild(el("span","k",k));d.appendChild(el("span","v","+ "+fmt(v)));rows.appendChild(d)}
    r.kids[f.id].forEach(function(k){var v=r.sub[k],t=tops[k]||0;if(v>0.004)rin("Arrives from "+accName(k),v);else if(v<-0.004&&t>0.004)row("Top-up to "+accName(k),"− "+fmt(t),true)});
    if(r.par[f.id]&&tops[f.id])rin("Top-up from "+accName(r.par[f.id]),tops[f.id]);
    s.pay.forEach(function(x){rin((x.p.name||"Pay")+"'s pay",x.v)});
    s.cIn.forEach(function(x){rin(possessive(x.p.name||"Someone")+(x.set&&x.p.boarder?" board":x.set?" set amount":" share"),x.v)});
    s.cOut.forEach(function(x){row("To "+accName(x.to)+" ("+possessive(x.p.name||"Someone")+(x.set&&x.p.boarder?" board)":x.set?" set amount)":" share)"),"− "+fmt(x.v),true)});
    s.income.forEach(function(i){rin(i.name||"Income",num(i.amount))});
    s.oneIn.forEach(function(o){rin((o.name||"One-off")+" (one-off)",num(o.amount))});
    s.bills.forEach(function(b){row(b.name,"− "+fmt(num(b.amount)),true)});
    if(s.unlisted>0.004)row("Bills not listed yet","− "+fmt(s.unlisted),true);
    s.savings.forEach(function(x){row("To "+(x.name||"savings"),"− "+fmt(num(x.amount)),true)});
    s.budgets.forEach(function(b){row(b.name||"Budget","− "+fmt(num(b.amount)),true)});
    s.oneOut.forEach(function(o){row((o.name||"One-off")+" (one-off)","− "+fmt(num(o.amount)),true)});
    if(!rows.firstChild)rows.appendChild(el("div","small muted","Nothing comes into or goes out of this account yet."));
    card.appendChild(rows);
    var tot=el("div","total"),lab=el("div");lab.appendChild(el("div",null,"Left over"));lab.firstChild.style.fontWeight="700";lab.appendChild(el("div","small muted","What's left after bills, spending budgets and savings"));tot.appendChild(lab);
    var fv=moneyEl(f.amt,"v"+(f.amt<0?" neg":""),ix===0?"floatV":"floatV_"+safeId(f.id));tot.appendChild(fv);card.appendChild(tot);box.appendChild(card);
    if(f.amt<-0.004&&!f.out&&!f.short)w.appendChild(el("div","banner bad",accName(f.id)+" will be short by "+fmt(-f.amt)+" this month after budgets and savings."))});
  if(r.floats.length>1){var c=el("section","card"),t=el("div","total");t.style.borderTop="0";t.style.paddingTop="0";
    var l=el("div");l.appendChild(el("div",null,"Total left over"));l.firstChild.style.fontWeight="700";l.appendChild(el("div","small muted","Across "+plural(r.floats.filter(function(f){return !f.short}).length,"account")+" that keep what's left"+(r.floats.some(function(f){return f.short})?", and any that are short":"")));t.appendChild(l);
    var v=moneyEl(r.flt,"v"+(r.flt<0?" neg":""),"floatTotal");t.appendChild(v);c.appendChild(t);box.appendChild(c)}
}
/* Other money coming in this month, under the pay boxes. Read-only: amounts and accounts are set in Settings › Other
   income and in the one-offs card, and a tap opens the item there. */
function renderPayExtra(){
  var box=clear($("payExtra")),inc=monthCfg().income.filter(function(i){return num(i.amount)>0.004}),ones=curOneOffs().filter(function(o){return o.kind==="in"&&num(o.amount)>0.004});
  if(!inc.length&&!ones.length)return;
  box.appendChild(el("div","small muted","Also coming in"));var ul=el("ul","extras");
  function line(name,where,v,go){var li=el("li"),b=el("button");b.type="button";b.appendChild(el("span","n",name));b.appendChild(el("span","v","+ "+fmt(v)));b.appendChild(el("span","w",where));
    b.addEventListener("click",go);li.appendChild(b);ul.appendChild(li)}
  inc.forEach(function(i){line(i.name||"Income","into "+accName(i.account),num(i.amount),function(){openIncomeItem(i.id)})});
  ones.forEach(function(o){line(o.name||"One-off","into "+accName(o.account)+", one-off",num(o.amount),function(){openOneOffItem(o.id)})});
  box.appendChild(ul)}
function highlight(n){if(!n)return;n.classList.add("hl");setTimeout(function(){n.classList.remove("hl")},1600)}
function openIncomeItem(id){var b=openSettings("sIncome","in_"+safeId(id));if(b){b.tabIndex=-1;try{b.focus({preventScroll:true})}catch(e){}highlight(b)}}
function openOneOffItem(id){openOne=id;openPayDetails();keepScroll(renderOneOffs);var w=$("oo_"+safeId(id));if(!w)return;reveal(w);var h=w.querySelector("button");if(h)try{h.focus({preventScroll:true})}catch(e){}}
/* "This month in detail" (2.7): "Not every month", the one-offs, each account's figures and the month's totals. Closed,
   unless the month on screen has one-offs (something typed for that month, which changes its transfers), until it's
   opened or closed by hand: that choice is kept for the session only (payDetailsOpen, null until then). Anything that
   leads to something inside it (a one-off's link, Reminders' "Open <month>", the tour)
   opens it first, quietly (pdExpect), so only that thing is scrolled to. */
var payDetailsOpen=null,pdExpect=null;
function openPayDetails(){payDetailsOpen=true;var d=$("payDetails");if(!d.open){pdExpect=true;d.open=true}}
$("payDetails").addEventListener("toggle",function(){var d=$("payDetails"),quiet=pdExpect===d.open;pdExpect=null;if(quiet)return;
  payDetailsOpen=d.open;if(d.open)reveal(d)});
/* "Not every month": bills that aren't paid monthly that are due in the month on screen, with a link to all of them.
   When there are some, a line under the transfers says so (This month in detail, just below, lists them). */
function renderNotEvery(){
  var box=clear($("due")),r=notEveryMonth(cfg,monthKey,0),tot=$("dueTotal");tot.textContent=r.due.length>1?fmt(r.dueTotal):"";$("dueTotalLbl").textContent=r.due.length>1?"Total ":"";
  var note=clear($("nmNote"));note.hidden=!r.due.length;
  if(r.due.length)note.textContent="Includes "+plural(r.due.length,"bill")+" that "+(r.due.length===1?"isn't":"aren't")+" monthly: "+fmt(r.dueTotal)+".";
  if(!r.any){box.appendChild(el("div","small muted","Every bill is paid monthly. Bills paid only in some months, like a yearly insurance, show here."));return}
  if(r.due.length){var d=el("div","rows");r.due.forEach(function(b){var row=el("div","row lined"),k=el("span","k");k.appendChild(avatar(b.account));var kt=el("span","kt",b.name);kt.appendChild(el("small",null,"From "+accName(b.account)));k.appendChild(kt);row.appendChild(k);
    row.appendChild(moneyEl(b.amount,"v"));d.appendChild(row)});box.appendChild(d)}
  else box.appendChild(el("div","small muted","Nothing extra this month."));
  var a=el("button","linkbtn","See all bills that aren't monthly");a.id="nmAll";a.addEventListener("click",function(){billQuery="";billFilter="notmonthly";openBill=null;openSettings("sBills")});box.appendChild(a)}
/* ---------- one-offs for a month ---------- */
function oneOffDefaultAccount(){var roots=rootIds(cfg);return roots[0]||(cfg.accounts[0]&&cfg.accounts[0].id)||""}
function renderOneOffs(){
  var box=clear($("oneOffs")),list=curOneOffs(),net=0;
  list.forEach(function(o){net+=(o.kind==="in"?1:-1)*num(o.amount)});
  $("ooSum").textContent=list.length?(net>=0?"+ ":"− ")+fmt(Math.abs(net)):"";
  if(!list.length&&openOne!=="new")box.appendChild(el("div","small muted","Anything you know about for "+mLabel(monthKey)+" that isn't a regular bill: a car service, a birthday, a refund."));
  list.forEach(function(o){box.appendChild(oneOffRow(o))});
  if(openOne==="new")box.appendChild(oneOffNew());
  else{var add=el("button","linkbtn","+ Add a one-off");add.id="addOneOff";add.addEventListener("click",function(){openOne="new";keepScroll(renderOneOffs);reveal($("oneOffNew"));var f=$("oo_name_new");if(f)f.focus()});box.appendChild(add)}
}
function oneOffHead(o){return {name:(o.name||"One-off"),amt:(o.kind==="in"?"+ ":"− ")+fmt(num(o.amount)),when:(o.kind==="in"?"Into ":"From ")+accName(o.account)+(validDate(o.date)?" · "+fmtDate(o.date):"")}}
function oneOffRow(o){
  var wrap=el("div","bill"),head=el("button"),hd=oneOffHead(o);wrap.id="oo_"+safeId(o.id);head.setAttribute("aria-expanded",openOne===o.id?"true":"false");
  var n=el("span",null,hd.name),a=el("span","num",hd.amt),wh=el("span","when",hd.when);head.appendChild(n);head.appendChild(a);head.appendChild(wh);
  head.addEventListener("click",function(){openOne=openOne===o.id?null:o.id;arm=null;keepScroll(renderOneOffs);if(openOne===o.id)reveal($("oo_"+safeId(o.id)))});wrap.appendChild(head);
  if(openOne!==o.id)return wrap;
  var ed=el("div","ed");
  function changed(){var h=oneOffHead(o);n.textContent=h.name;a.textContent=h.amt;wh.textContent=h.when;renderResults();queueMonthSave();var s=$("ooSum");if(s){var net=0;curOneOffs().forEach(function(x){net+=(x.kind==="in"?1:-1)*num(x.amount)});s.textContent=(net>=0?"+ ":"− ")+fmt(Math.abs(net))}}
  oneOffFields(ed,o,safeId(o.id),changed);
  var br=el("div","btnrow"),close=el("button","btn ghost","Done");close.addEventListener("click",function(){openOne=null;keepScroll(renderOneOffs)});br.appendChild(close);
  br.appendChild(confirmBtn("oo"+o.id,"Delete",function(){openOne=null;deleteOneOff(o)}));
  ed.appendChild(br);wrap.appendChild(ed);return wrap}
/* Delete a one-off from the month on screen, with undo (which puts it back in that same month). */
function deleteOneOff(o){var k=monthKey,list=curOneOffs(),ix=-1;list.forEach(function(x,i){if(ix<0&&(x===o||(o.id!=null&&x.id===o.id)))ix=i});if(ix<0)return;
  var gone=list[ix],copy=clone(gone);
  // Open because the month had one-offs: it stays open now that it's being used, rather than closing on the last one.
  if(payDetailsOpen==null&&$("payDetails").open)payDetailsOpen=true;
  var sc0=syncCount;cur.oneOffs=list.filter(function(x){return x!==gone});flushMonth();if(syncCount!==sc0)return;keepScroll(renderPay);updateBadge();
  offerUndo((gone.name||"One-off")+" deleted",function(){
    if(k===monthKey){cur=cur||{};var l=curOneOffs().slice();if(l.some(function(x){return x.id===copy.id}))return;l.splice(Math.min(ix,l.length),0,copy);cur.oneOffs=l;flushMonth();keepScroll(renderPay)}
    else{var d=months[k];if(!d)return;d.oneOffs=arr(d.oneOffs);if(d.oneOffs.some(function(x){return x.id===copy.id}))return;d.oneOffs.splice(Math.min(ix,d.oneOffs.length),0,copy);saveMonths();rerender()}
    updateBadge()},"#oo_"+safeId(gone.id)+" > button")}
function oneOffFields(box,o,id,onChange){
  var g=el("div","grid2");
  g.appendChild(labeled("Type",selectIn([["out","Payment out"],["in","Money in"]],o.kind==="in"?"in":"out",function(v){o.kind=v;onChange()},"oo_kind_"+id)));
  g.appendChild(labeled("Account",selectIn(accountOptions(cfg),o.account,function(v){o.account=v;onChange()},"oo_acct_"+id)));box.appendChild(g);
  var g2=el("div","grid2");
  g2.appendChild(labeled("What for",textIn(o.name||"",function(v){o.name=v;onChange()},"oo_name_"+id)));
  g2.appendChild(labeled("Amount (£)",textIn(o.amount!=null&&o.amount!==""?Number(num(o.amount)).toFixed(2):"",function(v){var r=parseMoney(v,false);if(r.invalid)return;o.amount=r.value||0;onChange()},"oo_amt_"+id,true)));box.appendChild(g2);
  // Native date inputs show the date in the phone's own format; Dovetail only reads their ISO value ("YYYY-MM-DD"), so no
  // label or placeholder ever names a format. (The same goes for the bill and reminder dates.)
  var dt=el("input","inp");dt.type="date";dt.id="oo_date_"+id;dt.value=validDate(o.date)?o.date:"";
  dt.addEventListener("change",function(){if(validDate(dt.value))o.date=dt.value;else delete o.date;onChange();
    if(curOneOffs().indexOf(o)>=0){if(saveT){clearTimeout(saveT);saveT=null}flushMonth()}updateBadge()});
  box.appendChild(labeled("Date (optional; one-offs with a date show on Reminders)",dt));
}
var draftOne=null;
function oneOffNew(){
  var d=el("div","box");d.id="oneOffNew";if(!draftOne)draftOne={kind:"out",name:"",amount:"",account:oneOffDefaultAccount()};
  d.appendChild(el("h3",null,"New one-off for "+mLabel(monthKey)));
  oneOffFields(d,draftOne,"new",function(){});
  var msg=el("div","hint");d.appendChild(msg);
  var br=el("div","btnrow"),add=el("button","btn","Add");add.id="oo_add";add.addEventListener("click",function(){
    var amt=parseMoney($("oo_amt_new").value,false);
    if(amt.invalid||amt.empty||!(amt.value>0)){msg.className="hint err";msg.textContent="Enter an amount like 120.00";return}
    var o={id:uid("o"),kind:draftOne.kind==="in"?"in":"out",name:(draftOne.name||"").trim()||"One-off",amount:amt.value,account:draftOne.account||oneOffDefaultAccount()};if(validDate(draftOne.date))o.date=draftOne.date;
    cur=cur||{};cur.oneOffs=curOneOffs().concat([o]);draftOne=null;openOne=null;flushMonth();keepScroll(renderPay);updateBadge();toast("One-off added")});
  var cn=el("button","btn ghost","Cancel");cn.addEventListener("click",function(){draftOne=null;openOne=null;keepScroll(renderOneOffs)});
  br.appendChild(add);br.appendChild(cn);d.appendChild(br);return d}

function toggleDone(id,amt){
  var focusedTick=!!(document.activeElement&&document.activeElement.classList&&document.activeElement.classList.contains("tick"));
  var p=readPay();cur=cur||{};
  // Pay not typed yet: the estimate goes in the box (the ticks are for these amounts), marked as an estimate
  // (payEstimated), so Analysis doesn't count it as pay that arrived. Typing in the box clears the mark.
  if(p.estimated.length){cur.payEstimated=Object.assign({},cur.payEstimated||{});
    p.estimated.forEach(function(pp){var i=$("pay_"+safeId(pp.id));if(i){i.value=p.vals[pp.id].toFixed(2);cur.payEstimated[pp.id]=true}});
    toast("Using estimated pay for now. Type what arrived when it lands.")}
  cur.done=Object.assign({},cur.done||{});
  var was=cur.done[id]!=null&&cur.done[id]!==false;if(was)delete cur.done[id];else cur.done[id]=r2(amt);
  renderResults();flushMonth();
  var all=document.querySelector("#warnings .alldone");haptic(was?"untick":all?"done":"tick");
  // the list was redrawn: keep focus on this transfer's tick (keyboard and screen-reader users)
  var lis=document.querySelectorAll("#steps li[data-id]");for(var i=0;i<lis.length;i++)if(lis[i].getAttribute("data-id")===id){var tb=lis[i].querySelector(".tick");if(tb&&focusedTick)try{tb.focus({preventScroll:true})}catch(e){}}
}
function queueMonthSave(){if(saveT)clearTimeout(saveT);saveT=setTimeout(function(){saveT=null;flushMonth()},700)}
function flushMonth(){
  if(!cfg.setupDone)return;
  var k=monthKey,p=readPay();
  var typed=cfg.people.some(function(pp){var i=$("pay_"+safeId(pp.id));return i&&i.value.trim()!==""});
  var hasInput=typed||(cur&&cur.done&&Object.keys(cur.done).length)||curOneOffs().length;
  if(!hasInput&&!months[k])return;
  // 2.16 (E6): p.vals is the pay used (planPay), so the saved results leave out an extra payday set aside.
  var r=calc(cfgFor(cfg,k,curOneOffs()),mNum(k),p.vals,curOneOffs()),old=months[k]||{},pay=Object.assign({},old.pay||{}),st={};
  // A pay box that can't be read keeps the figure last saved; ticks and one-offs are still saved.
  cfg.people.forEach(function(pp){if(p.invalid.indexOf(pp.id)<0)pay[pp.id]=fieldVal("pay_"+safeId(pp.id));else if(!(pp.id in pay))pay[pp.id]=null});
  r.steps.forEach(function(s){st[s.id]=r2(s.amt)});
  var body=Object.assign({},old,{month:k,pay:pay,done:(cur&&cur.done)||{},oneOffs:curOneOffs(),results:{steps:st,float:r2(r.flt)},updatedAt:new Date().toISOString()});
  // payEstimated: the people whose saved pay is the estimate filled in by a tick; only while there's a figure to mark.
  var pe={};Object.keys((cur&&cur.payEstimated)||{}).forEach(function(id){if(cur.payEstimated[id]&&pay[id]!=null)pe[id]=true});
  if(Object.keys(pe).length)body.payEstimated=pe;else delete body.payEstimated;
  // 2.16: extra paydays ({personId: {amount, counted?}}), only while there's one.
  var ex=cur&&isObj(cur.extra)?cur.extra:null;if(ex&&Object.keys(ex).length)body.extra=clone(ex);else delete body.extra;
  // 2.17 (13.2, L3): the paydays counted for each person ({personId: 0 to 6}), only while there's one; then the freeze: a
  // box that's just been filled while its person has a recent payday stores the count (and with one more payday than
  // usual opens the extra payday line), and a default set aside follows the pay in the box.
  var pdc=cur&&isObj(cur.paydays)?cur.paydays:null;if(pdc&&Object.keys(pdc).length)body.paydays=clone(pdc);else delete body.paydays;
  body=freezePaydays(cfg,months,k,body,old);
  // cur stays the working copy (an open one-off editor holds its objects); the saved month is an independent copy.
  months[k]=clone(body);cur=body;saveMonths();
}
/* "Share" beside the transfers (2.7): the month on screen's transfers as text (transfersText in export.js), ticks
   included, through the phone's share sheet; in a browser, the browser's own sharing, or copied. In the app with a
   household set up (2.10.1), Share asks first: the transfers as a message, or an update file for the other phone (the
   whole backup, which the other phone opens to bring itself up to date: see offerImport). WhatsApp drops the message
   when a file goes with it, so they're two choices rather than one share (2.10 sent both together). The example
   household sends the text straight away. */
function transfersMessage(){var p=readPay(),r=calc(monthCfg(),mNum(monthKey),p.vals,curOneOffs());
  return {text:transfersText(cfg,monthKey,r,(cur&&cur.done)||{},{estimated:estimatedPeople(p).map(function(x){return x.name||"someone"})}),title:"Dovetail transfers for "+mLabel(monthKey)}}
function shareTransfers(){if(sendsUpdate()){openShareChoice();return}shareTransfersText()}
function openShareChoice(){var col=el("div","sharechoice");
  var a=el("button","btn","Send the transfers as a message");a.type="button";a.id="shareAsText";a.addEventListener("click",function(){closeSheet();shareTransfersText()});
  var b=el("button","btn","Send an update for the other phone");b.type="button";b.id="shareAsFile";b.addEventListener("click",function(){closeSheet();shareUpdateFile()});
  col.appendChild(a);col.appendChild(b);openSheet("Share this month",[col],$("shareTransfers"),{quietClose:true})}
/* The update file, with the transfers as its message too (an email keeps it; WhatsApp doesn't). Anything still waiting is saved first. */
function shareUpdateFile(){var m=transfersMessage();savePending();
  if(!nativeCall(function(){return NATIVE.shareUpdate(backupText(),updateFileName(todayStr()),updateText(m.text),m.title)},false))toast("Couldn't prepare the update file.")}
function shareTransfersText(){var m=transfersMessage(),text=m.text,title=m.title,copy=function(){copyText(text,"Transfers copied")};
  if(NATIVE&&typeof NATIVE.shareText==="function"){if(!nativeCall(function(){return NATIVE.shareText(text,title)},false))copy();return}
  if(navigator.share){try{navigator.share({text:text}).catch(function(e){if(!e||e.name!=="AbortError")copy()})}catch(e){copy()}return}
  copy()}
$("shareTransfers").addEventListener("click",shareTransfers);
function sendsUpdate(){return !!(NATIVE&&typeof NATIVE.shareUpdate==="function"&&backupsAllowed())}
function copyText(t,msg){var done=function(){toast(msg||"Copied")};
  try{navigator.clipboard.writeText(t).then(done,function(){fallbackCopy(t);done()})}catch(e){fallbackCopy(t);done()}}
function fallbackCopy(t){var i=document.createElement("textarea");i.value=t;i.setAttribute("readonly","");i.style.position="fixed";i.style.opacity="0";document.body.appendChild(i);i.select();try{document.execCommand("copy")}catch(e){}i.remove()}
/* "What's new" on the Pay tab, the first time the app opens after an update (cfg.lastVersion is the version last
   opened). A new install, the example and a restore during setup don't show it. Dismissable; it links to nothing. */
var whatsNew=false,whatsNewFrom=null;
/* What's new, by version (2.13): each release adds its lines here, naming any change to an existing household's figures.
   Kept for every version from 2.12, so someone who skipped a release still sees its lines. */
/* What board is, where it first appears (setup and Settings › People; the owner, 22 October 2026). */
var BOARD_IS="Board is a set amount each month towards the household, as a grown-up child living at home might pay.";
var WHATS_NEW={
  "2.12":["An account can be paid for by more than one of you: half each, in proportion to pay, so you each keep the same, or set amounts.",
  "Each share is its own transfer, first in the list, and the top card shows what each of you keeps.",
  "Changing how you manage your money, or a bill? It applies from the month you choose (this month for a bill), and earlier months stay as they were."],
  "2.12.1":["Setup puts shared spending, savings and other income in the account you share, and only asks for amounts it uses.",
  "Someone paying board keeps the rest of their money, so it isn't counted in what the household has left: tick \u201cPays board\u201d in Settings \u203a People.",
  "A joint account that's short is named at the top, with what to do, rather than a top-up from an account with nothing in it."],
  "2.13":["Analysis, setup's last step and the exports now name an account that's short, even when the total left over looks fine, and a top-up never sends more than its account has.",
  "Changing how you manage your money keeps your own accounts, and setup asks only what makes a difference.",
  "Safer backups: one a month is kept for a year, and files using shares, board or a change from a month need 2.13 on the other phone too."],
  "2.14":["Not sure of every bill? Give an account a rough figure for its bills and list them over time: Dovetail shows what's not listed yet. Or paste a list from a spreadsheet or a note, in setup or Settings \u203a Bills.",
  "Setup asks about bills that don't come every month, puts your own accounts' bills a tap away, and takes budgets and savings in the account they're kept in.",
  "Nothing changes in your figures unless you add a rough figure. If you use one, update both phones before sending an update file: the file needs 2.14."],
  "2.14.1":["Board is explained where you first meet it, in setup and Settings \u203a People: a set amount each month towards the household, as a grown-up child living at home might pay. It's also called keep. Nothing changes in your figures."],
  "2.15":["Changing someone's usual pay now applies from this pay month, like a bill, so earlier months keep their shares. Nothing else changes in your figures."],
  "2.16":["Paid weekly, every two weeks or every four weeks? Choose it in Settings \u203a People. Type everything that's arrived since your last transfer day; an extra payday is set aside unless you count it.",
  "Settings \u203a People shows standing orders from each pay that cover every month.",
  "Nothing changes in your figures unless you choose a pattern. If you do, update both phones before sending an update file: the file needs 2.16."],
  "2.16.1":["A payday or transfer day on an England and Wales bank holiday now moves to the working day before, as it does for a weekend. Scotland's and Northern Ireland's holidays aren't included.",
  "So around Christmas, Easter and the May and August bank holidays, Dovetail can open on the next month and send its reminder for the day a few days sooner, and a reminder due then can show under the next month. Your transfers and shares don't change.",
  "Paid on the 6th, moved for weekends? April 2026's day is now Thursday 2 April (6 April was Easter Monday), so that month's savings count in the 2025\u201326 tax year."],
  "2.17":["Paid weekly, every two weeks or every four weeks? Add a recent payday in Settings \u203a People and Dovetail counts your paydays: it opens the extra payday line itself, says when a month has fewer than usual, and shows extra paydays in the months ahead.",
  "Nothing changes in your figures unless you add a payday date. If you do, update both phones before sending an update file: the file needs 2.17."],
  "2.18":["A new first screen for anyone setting up Dovetail: a picture of a finished payday, and what Dovetail never does (no bank login, no internet). Nothing changes in your figures."]};
/* The versions with lines after "from" (the version last opened; missing means before them all) up to "to", newest first. */
function whatsNewVersions(list,from,to){return Object.keys(list).filter(function(v){return list[v].length&&versionBefore(from,v)&&!versionBefore(to,v)})
  .sort(function(a,b){return versionBefore(a,b)?1:versionBefore(b,a)?-1:0})}
/* Each version's lines in a list, under "In 2.12.1" when there's more than one version (or always, for About). */
function whatsNewLists(box,versions,headings){versions.forEach(function(v){if(headings)box.appendChild(el("b",null,"In "+v));
  var ul=el("ul");WHATS_NEW[v].forEach(function(t){ul.appendChild(el("li",null,t))});box.appendChild(ul)})}
/* One notice at most above the hero (2.7), the first there is of: an update file to open (2.10), an automatic backup to restore, What's new, and the
   example household's banner or the "Finish setting up" card. The reminders nudge is a line under the hero instead. */
function renderNotice(){clear($("updateOffer"));clear($("restoreOffer"));clear($("whatsNew"));clear($("exampleBanner"));
  // An update file from this household's other phone (2.10) comes first: it's what was just opened.
  if(importOffer&&importOffer.update)$("updateOffer").appendChild(importOfferCard());
  else if(restoreOffer)renderRestoreOffer();else if(whatsNew&&!cfg.example)renderWhatsNew();else renderExampleBanner();
  $("notice").hidden=!($("updateOffer").firstChild||$("restoreOffer").firstChild||$("whatsNew").firstChild||$("exampleBanner").firstChild)}
function renderWhatsNew(){var box=clear($("whatsNew"));if(!whatsNew||cfg.example)return;
  // Nothing to say (opened after a downgrade, say): the next notice in line instead.
  var vs=whatsNewVersions(WHATS_NEW,whatsNewFrom,VERSION);if(!vs.length){whatsNew=false;renderExampleBanner();return}
  var c=el("div","banner good col");c.setAttribute("role","group");c.setAttribute("aria-label","What's new in Dovetail "+VERSION);c.appendChild(el("b",null,"What's new in "+VERSION));
  // Every version since the one last opened (straight from 2.11, say: 2.12.1's lines, then 2.12's).
  whatsNewLists(c,vs,vs.length>1);
  var r=el("div","btnrow"),b=el("button","btn","Got it");b.id="whatsNewOk";b.addEventListener("click",function(){whatsNew=false;renderNotice();var h=$("payH");if(h){h.tabIndex=-1;try{h.focus()}catch(e){}}});r.appendChild(b);c.appendChild(r);box.appendChild(c)}
function renderExampleBanner(){
  var box=clear($("exampleBanner"));
  if(cfg.example){var c=el("div","banner col");c.appendChild(el("div",null,"You're exploring an example household. Nothing here is real, and nothing is backed up."));
    // Setting up your own is the way on, so it's the main button; it only turns red once tapped, saying what a second tap does.
    var r=el("div","btnrow"),sb=confirmBtn("example","Set up my own household",function(){hideUndo();lsDel(K_CFG);lsDel(K_MON);months={};cfg=normCfg({schema:SCHEMA,appearance:cfg.appearance});startSetup();if(NATIVE){var nb=nativeBackups();if(nb.length)restoreOffer=nb[0]}goTab("setup")},"Tap again: this clears the example",true);
    sb.id="exStart";sb.type="button";r.appendChild(sb);
    var tb=el("button","btn ghost","Show me around");tb.id="exTour";tb.type="button";tb.addEventListener("click",function(){startTour(tb)});r.appendChild(tb);c.appendChild(r);box.appendChild(c);return}
  renderSetupTips(box)}
/* After a new setup: "Finish setting up", what's still missing (setupChecklist in calc.js), each undone item a button to
   the Settings section that adds it and each done one ticked. It goes for good when everything is done or "Hide this" is
   tapped (setupTips is removed). Never for the example or an existing household; a restore keeps what the backup had. */
var TIP_SECTION={pay:"sPeople",payday:"sPayday",bills:"sBills",budgets:"sBudget"};
function renderSetupTips(box){
  if(cfg.setupTips!==true||cfg.example)return;
  var list=setupChecklist(cfg,months),done=list.filter(function(x){return x.done}).length;
  if(done===list.length){delete cfg.setupTips;saveCfg(true);return}
  var c=el("section","card");c.id="setupTips";c.setAttribute("aria-labelledby","tipsH");
  var top=el("div","spread"),h=el("h2",null,"Finish setting up");h.id="tipsH";top.appendChild(h);top.appendChild(el("span","small muted num",done+" of "+list.length+" done"));c.appendChild(top);
  c.appendChild(el("p","small muted tipslead","A few more details make your figures right."));
  var ul=el("ul","checklist");
  list.forEach(function(it){var li=el("li",it.done?"done":""),tk=el("span","tick");tk.setAttribute("aria-hidden","true");tk.innerHTML='<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';li.appendChild(tk);
    if(it.done){var t=el("span","t");t.appendChild(el("span","sr","Done: "));t.appendChild(document.createTextNode(it.label));li.appendChild(t)}
    else{var b=el("button","linkbtn",it.label);b.type="button";b.id="tip_"+it.key;b.addEventListener("click",function(){openSettings(TIP_SECTION[it.key])});li.appendChild(b)}
    ul.appendChild(li)});
  c.appendChild(ul);
  var hide=el("button","linkbtn","Hide this");hide.id="tipsHide";hide.type="button";
  hide.addEventListener("click",function(){delete cfg.setupTips;saveCfg(true);renderNotice();var ph=$("payH");if(ph){ph.tabIndex=-1;try{ph.focus()}catch(e){}}});
  var hr=el("div","btnrow");hr.appendChild(hide);c.appendChild(hr);box.appendChild(c)}

/* ---------- ANALYSIS TAB ----------
   Everything is computed by analysis.js from data already in the app. Charts are inline SVG or simple HTML bars,
   each with a "Show the figures" table; values are never colour-only. */
var SVGNS="http://www.w3.org/2000/svg",openCat=null;
function fmt0(x){return gbp0.format(Math.round(x)).replace("-","−")}
var gbp0=new Intl.NumberFormat("en-GB",{style:"currency",currency:"GBP",maximumFractionDigits:0});
function fmtK(v){var a=Math.abs(v),s=v<0?"−":"";if(a>=1e6)return s+"£"+(a/1e6).toFixed(a>=1e7?0:1)+"m";if(a>=1e3)return s+"£"+(a/1e3).toFixed(a>=1e4?0:1).replace(/\.0$/,"")+"k";return s+"£"+Math.round(a)}
function pct(x){return x==null?"–":(Math.round(x*1000)/10).toFixed(1).replace(/\.0$/,"")+"%"}
function vizColour(i){return "var(--viz-"+(1+(i%8))+")"}
function svgEl(tag,attrs,parent){var e=document.createElementNS(SVGNS,tag);for(var k in attrs)e.setAttribute(k,attrs[k]);if(parent)parent.appendChild(e);return e}
/* The Dovetail mark (2.11): money coming in (blue, amber) brought together and sent on (green), in the chart colours, so
   it follows the theme. The same paths as the app icon (app/src/main/res/drawable/ic_launcher_foreground.xml; a unit
   test checks they match), shown from the middle of its 108-unit canvas. Each stream is clipped to its own half. Always
   beside the name, so screen readers skip it. */
var MARK={a:"M39,33C39,46.64 54,44 54,55V59",b:"M69,33C69,46.64 54,44 54,55V59",clipA:"M0,0H54V54.1H0Z",clipB:"M54,0H108V54.1H54Z",
  shaft:"M54,55.9V75",head:"M45.5,66.5L54,75L62.5,66.5"},markN=0;
function markSvg(cls){var s=svgEl("svg",{viewBox:"31 27 46 52","class":"mark"+(cls?" "+cls:""),"aria-hidden":"true",focusable:"false"}),d=svgEl("defs",null,s),n=++markN;
  var line=function(path,colour,cap,clip){var a={d:path,fill:"none",stroke:colour,"stroke-width":7,"stroke-linecap":cap,"stroke-linejoin":"round"};if(clip)a["clip-path"]="url(#"+clip+")";return svgEl("path",a,s)};
  [["a","clipA","var(--viz-1)"],["b","clipB","var(--viz-4)"]].forEach(function(x){var id="mark"+n+x[0];svgEl("path",{d:MARK[x[1]]},svgEl("clipPath",{id:id},d));line(MARK[x[0]],x[2],"round",id)});
  line(MARK.shaft,"var(--viz-3)","butt");line(MARK.head,"var(--viz-3)","round");return s}
var AN_HELP={anSaved:"saved"};
function anCard(id,title,sub){var c=el("section","card");c.id=id;var h=el("h2",null,title);h.id=id+"H";c.setAttribute("aria-labelledby",h.id);
  if(AN_HELP[id]){var hw=el("div","hh");hw.appendChild(h);hw.appendChild(helpBtn(AN_HELP[id]));c.appendChild(hw)}else c.appendChild(h);if(sub)c.appendChild(el("div","small muted",sub));return c}
/* "Show the figures": a button under a chart that reveals its figures as a table. rows: [[cell, …], …]; first column is text, the rest numbers. */
function tableToggle(card,id,head,rows){
  var b=el("button","linkbtn small","Show the figures"),wrap=el("div","tablewrap");wrap.id=id;wrap.hidden=true;wrap.tabIndex=0;wrap.setAttribute("role","region");wrap.setAttribute("aria-label",(card.querySelector("h2")||{}).textContent+": the figures");b.setAttribute("aria-expanded","false");b.setAttribute("aria-controls",id);
  var t=el("table"),th=el("thead"),tr=el("tr");head.forEach(function(h,i){tr.appendChild(el("th",i?"n":null,h))});th.appendChild(tr);t.appendChild(th);
  var tb=el("tbody");rows.forEach(function(r){var row=el("tr");r.forEach(function(v,i){row.appendChild(el("td",i?"n":null,v))});tb.appendChild(row)});t.appendChild(tb);wrap.appendChild(t);
  b.addEventListener("click",function(){var open=wrap.hidden;wrap.hidden=!open;b.textContent=open?"Hide the figures":"Show the figures";b.setAttribute("aria-expanded",open?"true":"false");if(open)reveal(wrap)});
  card.appendChild(b);card.appendChild(wrap)}
/* Shared chart frame: y axis with clean ticks, hairline grid, x labels, and a tooltip that follows touch, mouse or the
   arrow keys. o: {n, labels, values (for the domain), ariaLabel, tip(i) → [title, line, …], draw(svg, X, Y, slot)} */
var chartN=0;
function chartFrame(box,o){
  var tm=textMul(),fs=Math.round(11*tm*10)/10,W=Math.max(260,Math.floor(box.clientWidth||320)),H=Math.round((o.height||180)*Math.max(1,tm)),L=Math.round(50*tm),R=10,T=14,B=Math.round(24*tm);
  var vals=o.values.filter(function(v){return v!=null&&isFinite(v)}).map(r2);if(!vals.length)vals=[0];
  var lo=Math.min.apply(null,vals.concat(o.zero===false?[]:[0])),hi=Math.max.apply(null,vals.concat(o.zero===false?[]:[0]));
  if(o.zero===false){var padv=(hi-lo)*0.15||Math.abs(hi)*0.05||10;lo-=padv;hi+=padv}
  var ticks=niceTicks(lo,hi,4),y0=ticks[0],y1=ticks[ticks.length-1],slot=(W-L-R)/o.n;
  function X(i){return L+slot*(i+0.5)}function Y(v){return T+(H-T-B)*(1-(v-y0)/((y1-y0)||1))}
  var svg=svgEl("svg",{viewBox:"0 0 "+W+" "+H,role:"img","aria-label":o.ariaLabel,tabindex:"0",focusable:"true","data-cid":"ch"+(++chartN)});
  ticks.forEach(function(v){svgEl("line",{x1:L,x2:W-R,y1:Y(v),y2:Y(v),stroke:v===0?"var(--muted)":"var(--grid)","stroke-width":1},svg);
    var t=svgEl("text",{x:L-8,y:Y(v)+4,"text-anchor":"end","font-size":fs,fill:"var(--muted)","font-family":"Figtree, sans-serif"},svg);t.textContent=fmtK(v)});
  // At narrow widths every other label is shown, always including the month on screen's (o.current), in bold ink.
  var every=o.n>8&&slot<34*tm?2:1,ly=H-B+Math.round(17*tm),ci=o.current!=null&&o.current>=0?o.current:0;
  o.labels.forEach(function(lb,i){if((i-ci)%every)return;var now=i===o.current;
    var t=svgEl("text",{x:X(i),y:ly,"text-anchor":"middle","font-size":fs,fill:now?"var(--ink)":"var(--muted)","font-weight":now?"700":"400","font-family":"Figtree, sans-serif"},svg);if(now)t.setAttribute("data-current","true");t.textContent=lb});
  var hl=svgEl("g",{},svg);o.draw(svg,X,Y,slot,hl);
  box.appendChild(svg);var tip=el("div","tip");tip.hidden=true;tip.setAttribute("aria-hidden","true");box.appendChild(tip);
  var say=el("div","sr");say.setAttribute("aria-live","polite");box.appendChild(say);
  var idx=null,cross=svgEl("line",{x1:0,x2:0,y1:T,y2:H-B,stroke:"var(--muted)","stroke-width":1,visibility:"hidden"},hl);
  function show(i){if(i==null){idx=null;tip.hidden=true;cross.setAttribute("visibility","hidden");return}idx=i;
    var x=X(i);cross.setAttribute("x1",x);cross.setAttribute("x2",x);cross.setAttribute("visibility",o.crosshair?"visible":"hidden");
    var lines=o.tip(i).filter(function(l){return l});clear(tip);lines.forEach(function(line,j){if(j)tip.appendChild(el("br"));tip.appendChild(el(j?"span":"b",null,line))});tip.hidden=false;say.textContent=lines.join(". ");
    var bw=box.clientWidth||W,px=x/W*bw,tw=tip.offsetWidth/2;tip.style.left=Math.max(tw,Math.min(bw-tw,px))+"px";tip.style.top="-8px"}
  function from(ev){var rc=svg.getBoundingClientRect();var x=(ev.clientX-rc.left)/rc.width*W;return Math.max(0,Math.min(o.n-1,Math.floor((x-L)/slot)))}
  svg.addEventListener("pointerdown",function(e){show(from(e))});svg.addEventListener("pointermove",function(e){if(e.pointerType==="mouse"||e.buttons)show(from(e))});
  svg.addEventListener("pointerleave",function(e){if(e.pointerType==="mouse")show(null)});
  svg.addEventListener("keydown",function(e){if(e.key==="ArrowLeft"||e.key==="ArrowRight"){e.preventDefault();var i=idx==null?(e.key==="ArrowLeft"?o.n-1:0):idx+(e.key==="ArrowLeft"?-1:1);show(Math.max(0,Math.min(o.n-1,i)))}else if(e.key==="Escape"&&idx!=null){e.preventDefault();show(null)}});
  svg.addEventListener("focus",function(){if(idx==null)show(0)});svg.addEventListener("blur",function(){show(null)});
  return svg}
/* Hatched fill for projected bars: 45° lines in the bar's colour over a lighter fill of the same colour. One pattern
   per colour per chart; the colours are CSS variables, so light and dark mode both work. */
function hatchFill(svg,colour){var defs=svg.querySelector("defs");if(!defs){defs=svgEl("defs",{});svg.insertBefore(defs,svg.firstChild)}
  var id=svg.getAttribute("data-cid")+"-"+colour.replace(/[^a-z0-9]/gi,"");
  if(!defs.querySelector("#"+id)){var pt=svgEl("pattern",{id:id,patternUnits:"userSpaceOnUse",width:6,height:6,patternTransform:"rotate(45)"},defs);
    svgEl("rect",{width:6,height:6,fill:colour,"fill-opacity":0.22},pt);svgEl("line",{x1:1.5,y1:0,x2:1.5,y2:6,stroke:colour,"stroke-width":2.2},pt)}
  return "url(#"+id+")"}
/* Columns from a zero baseline: 4px rounded at the data end, square at the baseline, at most 24px wide.
   An item with hatch: true is projected and drawn hatched with an outline in its colour. An item with mark (a value)
   gets a short ink line across its bar at that value, wider than the bar so it shows above or inside it. The item with
   current: true (the month on screen) has a 2px ink outline and a bold ink label that's never left out. */
function colPath(x,w,yv,y0){var r=Math.min(4,w/2,Math.abs(y0-yv));if(Math.abs(y0-yv)<0.5)return "";
  if(yv<y0)return "M"+x+" "+y0+"V"+(yv+r)+"Q"+x+" "+yv+" "+(x+r)+" "+yv+"H"+(x+w-r)+"Q"+(x+w)+" "+yv+" "+(x+w)+" "+(yv+r)+"V"+y0+"Z";
  return "M"+x+" "+y0+"V"+(yv-r)+"Q"+x+" "+yv+" "+(x+r)+" "+yv+"H"+(x+w-r)+"Q"+(x+w)+" "+yv+" "+(x+w)+" "+(yv-r)+"V"+y0+"Z"}
function columnChart(box,o){return chartFrame(box,{n:o.items.length,labels:o.items.map(function(x){return x.label}),current:o.items.findIndex(function(x){return x.current}),values:o.items.map(function(x){return x.value}).concat(o.items.filter(function(x){return x.mark!=null}).map(function(x){return x.mark})).concat(o.avg!=null?[o.avg]:[]),
  ariaLabel:o.ariaLabel,height:o.height,tip:o.tip,draw:function(svg,X,Y,slot){var w=Math.max(4,Math.min(24,slot*0.62)),y0=Y(0);
    o.items.forEach(function(it,i){var d=colPath(X(i)-w/2,w,Y(it.value),y0);if(d){var col=it.colour||(it.neg?"var(--bad)":"var(--accent)");
      var pth=it.hatch?svgEl("path",{d:d,fill:hatchFill(svg,col),stroke:col,"stroke-width":1.25,"stroke-linejoin":"round"},svg):svgEl("path",{d:d,fill:col},svg);pth.setAttribute("data-kind",it.hatch?"projected":"actual");
      if(it.current){pth.setAttribute("stroke","var(--ink)");pth.setAttribute("stroke-width","2");pth.setAttribute("stroke-linejoin","round");pth.setAttribute("data-current","true")}}
      if(it.mark!=null){var ym=Y(it.mark),ext=Math.min(5,slot*0.15);svgEl("line",{x1:X(i)-w/2-ext,x2:X(i)+w/2+ext,y1:ym,y2:ym,stroke:"var(--ink)","stroke-width":2.5,"stroke-linecap":"round","data-kind":"predicted"},svg)}});
    if(o.avg!=null){var ya=Y(o.avg);svgEl("line",{x1:X(0)-slot/2,x2:X(o.items.length-1)+slot/2,y1:ya,y2:ya,stroke:"var(--ink)","stroke-width":1.5,"stroke-opacity":0.7},svg)}}})}
function legendList(items){var ul=el("ul","legend");items.forEach(function(it){var li=el("li"),sw=el("i","sw");sw.style.setProperty("--c",it.colour);sw.setAttribute("aria-hidden","true");
  li.appendChild(sw);li.appendChild(el("span",null,it.label));li.appendChild(el("span","v",it.value||""));li.appendChild(el("span","pc",it.pc||""));ul.appendChild(li)});return ul}
/* A key under a chart: [{colour, label, hatch}] */
function keyRow(list){var key=el("div","keyrow");list.forEach(function(k){var sp=el("span"),sw=el("i","sw"+(k.hatch?" hatch":k.line?" line":""));sw.style.setProperty("--c",k.colour);sw.setAttribute("aria-hidden","true");sp.appendChild(sw);sp.appendChild(document.createTextNode(k.label));key.appendChild(sp)});return key}
function actualKeys(list,colour){var out=[];if(list.some(function(x){return x.actual}))out.push({colour:colour,label:"Actual (pay typed in)"});if(list.some(function(x){return !x.actual}))out.push({colour:colour,label:"Estimated",hatch:true});return out}
function monthCell(x){return mShort(x.k)+(x.actual?" (actual)":"")}
function goBills(){billQuery="";billFilter="";openSettings("sBills")}
/* Something for Analysis to show: bills (or, 2.14, a rough figure for them), budgets or savings. */
function hasOutgoings(){return !!(cfg.bills.length||cfg.budgets.length||cfg.savings.length||arr(cfg.estimates).length)}

function renderAnalysis(){
  if(!cfg.setupDone)return;var box=clear($("analysis")),k=monthKey;rsW=$("main").clientWidth;
  if(!hasOutgoings()){var e=el("div","empty");e.appendChild(el("div",null,"Add your bills, spending budgets and savings in Settings to see where your money goes."));
    var b=el("button","btn",cfg.bills.length?"Open Settings":"Add bills");b.style.marginTop="10px";b.addEventListener("click",goBills);e.appendChild(b);box.appendChild(e)}
  [anMonths,anPicture,anCategories,anHistory,anSaved,anPrices,anTopUps].forEach(function(f){var c=f(k);if(c)box.appendChild(c)});
}
/* Month by month: the float for 12 budget months (3 back, the one on screen, 8 ahead). Since 2.9.1 the chart speaks for
   itself: words above it only when a month is short or there's no pay yet. Each bar's reading (tap or arrow keys) and
   the figures (the table) have what goes out and what makes each month differ; the chart's description for screen
   readers still sums it up (this month, the tightest month ahead).
   2.13: a month is short when any account that keeps what's left ends it below zero (projectedFloat). With more than
   one such account the short ones are named ("Sam's account short by £100.00"), since the total left over can hide them;
   with one, the words are as before. The tightest month is the one with the biggest shortfall, then the least left. */
function anMonths(k){
  if(!hasOutgoings())return null;
  var keys=chartMonths(k),r=projectedFloat(cfg,months,k,keys),h=heavyLight(cfg,months,k,keys),c=anCard("anMonths","Month by month");
  var gap=function(x){return sum(x.shortBy,function(s){return s.amount})};
  var ahead=r.filter(function(x){return x.k>=k}),now=ahead[0],shortM=ahead.filter(function(x){return x.short}),low=ahead.reduce(function(a,x){var d=gap(x)-gap(a);return d>0.004||(d>=-0.004&&x.float<a.float)?x:a},ahead[0]);
  var ex=keys.map(function(x){return monthExtras(cfg,months,x)}),why=function(i){return extrasText(ex[i],true)||"Only the monthly bills"};
  var named=function(x){return shortWords(cfg,x.shortBy)},by=function(x){return listAnd(x.shortBy.map(function(s){return accName(s.id)+" by "+fmt(s.amount)}))};
  var shares=shortM.some(function(x){return x.named})&&cfgFor(cfg,k).accounts.some(function(a){return isObj(a.funding)});
  var later=shortM.filter(function(x){return x.k!==k}),noPay=avgIncome(cfg,months,k).total<=0,advice=shares?" Change how the shared costs are split (Settings › Accounts, Paid for by), or trim a bill or a spending budget.":" Move a one-off to another month or trim a spending budget.";
  // Without any pay every month is "short": that's a missing figure, not advice to trim.
  if(noPay||now.short){var verdict=el("div",noPay?"lead":"banner bad");verdict.id="anVerdict";
    verdict.textContent=noPay?"Add each person's pay (or their usual pay in Settings › People) to see what's left each month.":now.named?mLabel(k)+": "+named(now)+"."+advice:mLabel(k)+" is short by "+fmt(-now.float)+"."+advice;
    c.appendChild(verdict)}
  // The same accounts short by the same amounts every month ahead (a share someone can't afford): said once.
  var same=later.length>1&&later.length===ahead.length-1&&later.every(function(x){return x.named&&JSON.stringify(x.shortBy)===JSON.stringify(later[0].shortBy)});
  if(later.length&&!noPay)c.appendChild(el("div","banner bad",(same?(now.short?"Also short":"Short")+" every month from "+mLabel(later[0].k)+" to "+mLabel(later[later.length-1].k)+": "+by(later[0])+" each month."
    :(now.short?"Also short: ":"Short: ")+later.slice(0,3).map(function(x){return x.named?mLabel(x.k)+" ("+by(x)+")":mLabel(x.k)+" by "+fmt(-x.float)}).join(", ")+(later.length>3?" and "+plural(later.length-3,"more month")+" (see the figures)":"")+".")+(now.short?"":advice)));
  // Months with typed pay are solid, with a line at what was predicted before pay was typed; the rest are hatched.
  function vsPredicted(x){if(x.predicted==null)return "";var d=x.float-x.predicted;return Math.abs(d)<0.005?"as predicted":fmt(Math.abs(d))+(d>0?" more":" less")+" than the "+fmt(x.predicted)+" predicted"}
  var cb=el("div","chartbox");c.appendChild(cb);
  columnChart(cb,{items:r.map(function(x){return {label:MS[mNum(x.k)-1],value:x.float,neg:x.short,hatch:!x.actual,mark:x.predicted,current:x.k===k}}),
    ariaLabel:"Left over each month from "+mLabel(keys[0])+" to "+mLabel(keys[keys.length-1])+". "+mLabel(k)+" (this month)"+(now.short&&!now.named?" short by "+fmt(-now.float):" "+fmt(now.float)+" left over"+(now.short?", "+named(now):""))+". Tightest from "+mLabel(k)+": "+mLabel(low.k)+" "+fmt(low.float)+(low.short&&low.named?", "+named(low):"")+(shortM.length?". "+plural(shortM.length,"month")+" short":"")+". Use the arrow keys to read each month.",
    tip:function(i){var x=r[i],o=h.months[i],vp=vsPredicted(x);return [mLabel(x.k)+(x.k===k?" (this month)":"")+": "+fmt(x.float)+(x.short?" ("+(x.named?named(x):"short")+")":""),fmt(o.total)+" going out",why(i),x.actual?"Actual: pay typed in"+(vp?", "+vp:""):"Estimated"]}});
  var keysList=actualKeys(r,"var(--accent)");if(r.some(function(x){return x.predicted!=null}))keysList.push({label:"Predicted",line:true});if(r.some(function(x){return x.short}))keysList.push({colour:"var(--bad)",label:"Short"});c.appendChild(keyRow(keysList));
  tableToggle(c,"anMonthsTable",["Month","Left over","Bills","Budgets","Savings","One-offs out","Going out","What's different"],
    r.map(function(x,i){var o=h.months[i];return [monthCell(x),fmt(x.float)+(x.short?" ("+(x.named?named(x):"short")+")":"")+(x.predicted!=null?" (predicted "+fmt(x.predicted)+")":""),fmt(o.bills),fmt(o.budgets),fmt(o.savings),fmt(o.oneOffs),fmt(o.total),why(i)]}));
  return c}
function anPicture(k){
  var r=monthlyPicture(cfg,months,k),c=anCard("anPicture","The monthly picture");
  var st=el("div","stats"),d=el("div","stat");d.appendChild(el("div","k","Saved from pay"));d.appendChild(el("div","v big",pct(r.savingsRate)));d.style.gridColumn="1 / 3";st.appendChild(d);c.appendChild(st);
  var segs=[{label:"Bills",value:r.bills,colour:"var(--viz-1)"},{label:"Spending budgets",value:r.budgets,colour:"var(--viz-2)"},{label:"Savings",value:r.saving,colour:"var(--viz-3)"},{label:"Average left over",value:r.float,colour:"var(--viz-4)"}];
  var shown=segs.filter(function(s){return s.value>0.004}),whole=Math.max(r.income,sum(shown,function(s){return s.value}));
  if(whole>0){var bar=el("div","stack");bar.setAttribute("role","img");
    bar.setAttribute("aria-label","Of "+fmt(r.income)+" income a month: "+segs.map(function(s){return s.label+" "+fmt(s.value)}).join(", ")+".");
    shown.forEach(function(s){var i=el("i");i.style.flex=String(s.value/whole);i.style.background=s.colour;bar.appendChild(i)});c.appendChild(bar)}
  c.appendChild(legendList(segs.map(function(s){return {label:s.label,colour:s.colour,value:fmt(s.value),pc:r.income>0?pct(s.value/r.income):""}})));
  if(r.income<=0)c.appendChild(el("div","lead","Add each person's pay (or their usual pay in Settings › People) to see percentages."));
  else if(r.float<-0.004)c.appendChild(el("div","lead","On average, more goes out than comes in: about "+fmt(-r.float)+" a month."));
  // 2.13: an account short in the average month is named, not netted into the average left over without a word.
  if(r.income>0&&r.shortBy.length){var asl=el("div","lead","In an average month, "+listAnd(r.shortBy.map(function(s,i){return accName(s.id)+(i?" by ":" is short by ")+fmt(s.amount)}))+". The average left over is after that.");asl.id="anPictureShort";c.appendChild(asl)}
  // Each person's pay (an average of the months typed in, or their usual pay) is in the figures, under Income.
  // 2.16: someone on a pattern: "Kerry's pay (about £1,690.00 a month: £1,560.00 every four weeks)"; 2.17, with a recent
  // payday, the measured average: "Jordan's pay (about £1,837.62 a month: an average of £424.07 a payday over 6 months)".
  var inc=r.incomeDetail,of=function(v){return r.income>0?pct(v/r.income):""},incRows=inc.people.map(function(p){return [incomeLabel(p),fmt(p.avg),of(p.avg)]});
  if(inc.other)incRows.push(["Other income",fmt(inc.other),of(inc.other)]);
  if(inc.board)incRows.push(["Board",fmt(inc.board),of(inc.board)]);
  tableToggle(c,"anPictureTable",["","A month","Of income"],[["Income",fmt(r.income),r.income>0?"100%":""]].concat(incRows,segs.map(function(s){return [s.label,fmt(s.value),of(s.value)]})));
  return c}
function anCategories(){
  var r=byCategory(cfg),c=anCard("anCategories","Where the money goes");
  if(!cfg.bills.length&&!r.unlisted){c.appendChild(el("div","empty","No bills yet. Add them in Settings › Bills."));return c}
  c.appendChild(el("div","lead",fmt(r.annual)+" a year on bills, "+fmt(r.monthly)+" a month."));
  var u=r.unlisted,max=Math.max.apply(null,r.groups.map(function(g){return g.annual}).concat(u?[u.annual]:[]))||1,list=el("div");
  function toggle(row,bl,key){row.addEventListener("click",function(){var open=bl.hidden;openCat=open?key:null;c.querySelectorAll(".catbills").forEach(function(x){x.hidden=true});c.querySelectorAll(".catrow").forEach(function(x){x.setAttribute("aria-expanded","false")});
    bl.hidden=!open;row.setAttribute("aria-expanded",open?"true":"false");if(open)reveal(bl)})}
  // Subscriptions and memberships: a highlighted line at the top that opens the list.
  var sb=subscriptions(cfg);
  if(sb.bills.length){var srow=el("button","catrow subs");srow.id="cat_subs";srow.setAttribute("aria-expanded",openCat==="subs"?"true":"false");srow.setAttribute("aria-controls","catb_subs");
    srow.appendChild(el("span",null,fmt(sb.annual)+" a year goes on subscriptions and memberships"));srow.appendChild(el("span","num",fmt(sb.monthly)+" a month"));
    var sbl=el("div","catbills rows");sbl.id="catb_subs";sbl.hidden=openCat!=="subs";
    sb.bills.forEach(function(b){var d=el("div","row sub");d.appendChild(el("span","k",b.name+" · "+categoryName(b.category)));d.appendChild(el("span","v",fmt(b.annual)+" a year"));sbl.appendChild(d)});
    sbl.appendChild(el("div","small muted","Worth a look now and then: small regular payments add up, and prices often rise at renewal."));
    toggle(srow,sbl,"subs");list.appendChild(srow);list.appendChild(sbl)}
  r.groups.forEach(function(g){var key=g.key||"none",row=el("button","catrow");row.id="cat_"+key;row.setAttribute("aria-expanded",openCat===key?"true":"false");row.setAttribute("aria-controls","catb_"+key);
    row.appendChild(el("span",null,g.name+" ("+g.bills.length+")"));row.appendChild(el("span","num",fmt(g.annual)+" a year"));
    var tr=el("span","track");tr.setAttribute("aria-hidden","true");var bi=el("i");bi.style.width=Math.max(1,g.annual/max*100)+"%";if(!g.key)bi.style.background="var(--muted)";tr.appendChild(bi);row.appendChild(tr);
    // Bills marked as savings are bills here but saving in the monthly picture: say so, or the two "bills" figures look wrong.
    row.appendChild(el("span","sub",fmt(g.monthly)+" a month · "+pct(g.share)+" of bills"+(g.key==="savings"?" · counted as savings in the monthly picture":"")));
    var bl=el("div","catbills rows");bl.id="catb_"+key;bl.hidden=openCat!==key;
    g.bills.forEach(function(b){var d=el("div","row sub");d.appendChild(el("span","k",b.name+(b.perYear<12?" ("+b.perYear+"× a year)":"")));d.appendChild(el("span","v",fmt(b.monthly)+" a month · "+fmt(b.annual)+" a year"));bl.appendChild(d)});
    if(!g.key){var nb=el("button","linkbtn","Give these bills a category in Settings › Bills");nb.addEventListener("click",function(){billQuery="";goBills()});bl.appendChild(nb)}
    toggle(row,bl,key);list.appendChild(row);list.appendChild(bl)});
  // 2.14: bills not listed yet (what rough figures have over the bills listed) aren't a category: their own bar after the
  // categories, hatched as estimated months are, and in the totals and shares.
  if(u){var ur=el("div","catrow figrow");ur.id="cat_unlisted";ur.appendChild(el("span",null,"Not listed yet"));ur.appendChild(el("span","num",fmt(u.annual)+" a year"));
    var ut=el("span","track");ut.setAttribute("aria-hidden","true");var ui=el("i","hatch");ui.style.width=Math.max(1,u.annual/max*100)+"%";ut.appendChild(ui);ur.appendChild(ut);
    ur.appendChild(el("span","sub",fmt(u.monthly)+" a month · "+pct(u.share)+" of bills · from your rough figure"+(u.accounts.length>1?"s":"")+" for "+listAnd(u.accounts.map(function(x){return accName(x.account)}))));list.appendChild(ur)}
  c.appendChild(list);
  tableToggle(c,"anCategoriesTable",["Category","A year","A month","Share"],r.groups.map(function(g){return [g.name,fmt(g.annual),fmt(g.monthly),pct(g.share)]}).concat(u?[["Not listed yet",fmt(u.annual),fmt(u.monthly),pct(u.share)]]:[]));
  return c}
/* Pay and float history: only once there are two months to compare. 2.13: a month short by the one rule is red, and
   with more than one account keeping what's left its reading and the figures name the short ones. */
function anHistory(k){
  var h=payHistory(cfg,months,k);if(h.length<2)return null;
  var c=anCard("anHistory","Pay and what was left"),fb=el("div","chartbox");c.appendChild(fb);
  var inH=h.some(function(x){return x.k===k}),named=function(x){return x.short&&x.named?" ("+shortWords(cfg,x.shortBy)+")":""};
  columnChart(fb,{items:h.map(function(x){return {label:MS[mNum(x.k)-1],value:x.float,neg:x.short,current:x.k===k}}),height:170,
    ariaLabel:"Left over each month from "+mLabel(h[0].k)+" to "+mLabel(h[h.length-1].k)+"."+(inH?" "+mLabel(k)+" (this month) is outlined.":"")+" Use the arrow keys to read each month and its pay.",
    tip:function(i){var x=h[i];return [mLabel(x.k)+(x.k===k?" (this month)":"")+": "+fmt(x.float)+" left over"+named(x)].concat(cfg.people.map(function(p){return (p.name||"Pay")+": "+(x.pay[p.id]==null?"not typed":fmt(x.pay[p.id]))}))}});
  // 2.16: the pay used; an extra payday set aside says so ("£1,480.80 (£370.20 set aside)").
  var aside=function(x,p){var a=x.setAside&&x.setAside[p.id];return a>0.004?" ("+fmt(a)+" set aside)":""};
  tableToggle(c,"anHistoryTable",["Month"].concat(cfg.people.map(function(p){return p.name||"Pay"})).concat(["Left over"]),h.map(function(x){return [mShort(x.k)].concat(cfg.people.map(function(p){return x.pay[p.id]==null?"–":fmt(x.pay[p.id])+aside(x,p)})).concat([fmt(x.float)+named(x)])}));
  return c}
function anSaved(k){
  var r=savedSoFar(cfg,months,k),c=anCard("anSaved","Saved so far");
  if(!r.items.length){c.appendChild(el("div","empty","Add a savings transfer in Settings › Savings transfers, or mark a bill as savings, to see it add up here."));return c}
  if(!r.monthsSaved){c.appendChild(el("div","empty","Tick your savings transfers on the Pay tab each month and they'll add up here."));return c}
  c.appendChild(el("div","lead",fmt(r.total)+" saved since "+mLabel(r.since)+", "+fmt(r.taxYearTotal)+" of it this tax year ("+r.taxYear.label+")."));
  r.items.forEach(function(it){var d=el("div","saveitem"),t=el("div","spread");t.appendChild(el("b",null,it.name));t.appendChild(el("span","num",fmt(it.total)));d.appendChild(t);
    if(it.kind==="transfer"&&!it.monthsSaved)d.appendChild(el("div","small muted","Starts counting from this month."));
    c.appendChild(d)});
  c.appendChild(el("div","small muted","Tax years run 6 April to 5 April"+(payCfg().day?"; each month counts in the tax year of the payday that funds it.":".")));
  // How consistently each transfer was ticked lives in the table: "ticked in 2 of 3 months" from when it started.
  tableToggle(c,"anSavedTable",["","Saved","This tax year","Months"],r.items.map(function(it){return [it.name,fmt(it.total),fmt(it.taxYear),
    it.kind==="bill"?"Direct Debit, "+plural(it.monthsDone,"month"):!it.monthsSaved?"From this month":it.monthsDone+" of "+plural(it.monthsSaved,"month")+(it.since&&it.since!==r.since?" since "+mShort(it.since):"")+" ("+pct(it.consistency)+")"]}));
  return c}
/* Price changes: only once a bill has been renewed in the last 12 months. */
function anPrices(){
  var r=priceChanges(cfg,todayStr());if(!r.renewed)return null;
  var c=anCard("anPrices","Price changes");
  c.appendChild(el("div","lead",r.rate==null?plural(r.renewed,"bill")+" renewed in the last 12 months.":(Math.abs(r.rate)<0.0005?"The "+plural(r.renewed,"bill")+" you renewed in the last 12 months cost the same as before.":"The "+plural(r.renewed,"bill")+" you renewed in the last 12 months "+(r.rate>0?"went up":"went down")+" "+pct(Math.abs(r.rate))+" overall: "+fmt(Math.abs(r.yearlyChange))+" a year "+(r.rate>0?"more":"less")+".")));
  var rows=el("div");r.changes.forEach(function(x){var d=el("div","saveitem"),t=el("div","spread");t.appendChild(el("b",null,x.name));
    t.appendChild(el("span","num",fmt(x.from)+" → "+fmt(x.to)));d.appendChild(t);
    d.appendChild(el("div","small muted","Renewed "+fmtDate(x.on)+(x.pct!=null?": "+(x.pct>0?"up ":"down ")+pct(Math.abs(x.pct)):"")+" ("+fmtS(x.annualTo-x.annualFrom)+" a year)."));rows.appendChild(d)});c.appendChild(rows);
  return c}
/* Accounts that ran short: top-ups, and since 2.13 accounts left short (topUps). One plain line explains each kind that
   happened, then a line or two per account. A pooled household with one account keeping what's left never sees "ended
   the month short" (its short months are Month by month's), only top-ups and any top-up left short. */
function anTopUps(k){
  var r=topUps(cfg,months,k);if(!r.accounts.length)return null;
  var c=anCard("anTopUps","Accounts that ran short"),of=" of the last "+plural(r.monthsLooked,"month")+" you used the app",any=function(f){return r.accounts.some(f)};
  if(any(function(a){return a.count}))c.appendChild(el("div","small muted","When an account doesn't have enough for its own bills, Dovetail moves money back to it from the account it sends to. That's a top-up."));
  if(any(function(a){return a.short.ended}))c.appendChild(el("div","small muted","An account that keeps what's left has nothing to top it up, so when it can't cover what goes out of it, it ends the month short."));
  if(any(function(a){return a.short.part}))c.appendChild(el("div","small muted","A top-up only sends what the account sending it has by then, so it can be made only in part. The rest stays short."));
  if(any(function(a){return a.short.cant}))c.appendChild(el("div","small muted","When the account that would send a top-up has nothing left by then, the top-up can't be made at all."));
  r.accounts.forEach(function(a){var s=a.short;
    // Moving a bill to the account that sends the top-up doesn't help when that account ran out too.
    if(a.count)c.appendChild(el("div","lead",accName(a.account)+" needed topping up in "+a.count+of+", by "+fmt(a.average)+" on average."+(s.part?"":" Moving a bill of about "+fmt(a.average)+" from "+accName(a.account)+" to "+accName(a.from)+" would stop that.")));
    if(s.count)c.appendChild(el("div","lead",accName(a.account)+(s.ended?" ended the month short in ":" was left short in ")+s.count+of+", by "+fmt(s.average)+" on average"+
      (s.ended?".":": "+accName(a.from)+(s.cant&&!s.part?" had nothing to top it up with.":" couldn't top it up in full."))+
      (sharesSet(a.account)?" Raise the set amounts paid into it, or move money into it.":paysShares(a.account)?" Change how the shared costs are split, or move a bill out of it.":" Move money into it, or trim a bill.")))});
  return c}
/* 2.13: whether account id is someone's pay account that pays a share into another account, so a shortfall there means
   changing the split. */
function paysShares(id){var mc=monthCfg();return mc.accounts.some(function(a){return a.id!==id&&fundingPeople(mc,a.id).some(function(p){return p.payAccount===id})})}

/* ---------- REMINDERS ---------- */
var LEADS=[["7","1 week before"],["14","2 weeks before"],["30","1 month before"],["45","6 weeks before"],["60","2 months before"],["90","3 months before"],["180","6 months before"]];
function defaultAction(it){return reminderAction(cfg,it)}
function reminderItems(){return reminderList(cfg,months,todayStr())}
function attentionItems(){return reminderItems().filter(function(i){return i.status!=="later"})}
function logDone(text){cfg.doneLog.unshift({text:text,on:todayStr()});if(cfg.doneLog.length>20)cfg.doneLog.length=20}
function updateBadge(){if(!cfg||!cfg.setupDone)return;var n=attentionItems().length,b=$("dueBadge");b.textContent=n;b.hidden=!n;$("t-due").setAttribute("aria-label","Reminders"+(n?", "+n+" need"+(n===1?"s":"")+" attention":""))}
function renderActionBanner(){
  var box=clear($("actionBanner")),a=attentionItems();updateBadge();if(!a.length)return;
  var over=a.filter(function(i){return i.status==="over"}).length;
  // One line under the hero (2.7): a long list is cut short with "…" rather than wrapping; the tab's badge counts them too.
  var b=el("button","banner nudge"+(over?" bad":""));b.type="button";
  var txt=a.length===1?(a[0].name+(a[0].status==="over"?": date has passed":" "+relDays(a[0].days))):(a.length+" reminders need attention: "+listAnd(a.slice(0,2).map(function(i){return i.name}).concat(a.length>2?["more"]:[])));
  b.appendChild(el("span","t",txt));b.appendChild(el("span","go","View ›"));b.addEventListener("click",function(){goTab("due")});box.appendChild(b);
}
var openRem=null,renewing=null,remSec=null,remHome=null,renewDraft=null,dueAllOpen=false,remMonthHint=true,remFresh=null;
/* 2.13: a reminder just made with "+ Add a reminder" ({id, snap: how it was made}). If it's still untouched when its
   editor closes (Close, another item opened, or leaving the tab), it goes, with no Undo: nothing was lost. */
function dropFreshRem(){var f=remFresh;remFresh=null;if(!f||!cfg)return false;var ix=-1;cfg.reminders.forEach(function(r,i){if(r.id===f.id)ix=i});
  if(ix<0||JSON.stringify(cfg.reminders[ix])!==f.snap)return false;cfg.reminders.splice(ix,1);if(openRem==="r:"+f.id)openRem=null;saveCfg(true);updateBadge();return true}
/* An item can be listed twice (in "Needs attention" and in the month), so a row's id includes its section: "a" (needs
   attention) keeps the plain id, "m" (the month on screen) and "u" (all upcoming) add a prefix. Without a section, the
   one whose editor is open. remHome is the section an editor or renew form was opened from; remSec is where it shows
   now (remHome, or wherever the item is after a month change or a date change). */
function remDomId(key,sec){if(sec===undefined)sec=remSec;return "rem_"+(sec&&sec!=="a"?sec+"_":"")+safeId(key)}
function shortDate(d){var p=d.split("-").map(Number);return p[2]+" "+MS[p[1]-1]}
function renderDue(){
  updateBadge();$("dueToday").textContent="Counted from today, "+fmtDate(todayStr())+".";
  var box=clear($("dueList")),items=reminderItems(),today=todayStr();
  var att=items.filter(function(i){return i.status!=="later"}),mon=remindersInMonth(cfg,months,monthKey,today),up=items.filter(function(i){return i.days>=0});
  // An item in "Needs attention" is a one-line note in the month (no buttons), so the month's own rows are the rest.
  var above={};att.forEach(function(i){above[i.key]=1});var monRows=mon.filter(function(i){return !above[i.key]});
  // The editor (or renew form) shows in one place: the section it was opened from, or else wherever the item now is.
  var openKey=openRem||renewing,has=function(l){return l.some(function(i){return i.key===openKey})},where={a:att,m:monRows,u:up};
  remSec=null;if(openKey){remSec=remHome&&has(where[remHome])?remHome:has(att)?"a":has(mon)?"m":has(up)?"u":null;if(!remSec){openRem=null;renewing=null}}
  if(!openKey||!remSec){remHome=null;renewDraft=null}
  var s1=el("section","card");s1.appendChild(el("h2",null,"Needs attention"));
  if(!att.length){var nx=up[0];s1.appendChild(el("div","banner good",nx?"Nothing needs doing right now. Next up: "+nx.name+" on "+fmtDate(nx.date)+".":"Nothing needs doing right now."))}
  att.forEach(function(it){s1.appendChild(remRow(it,"a"))});box.appendChild(s1);
  // The month on screen: what falls between its payday and the next, which is what that month's money has to cover.
  var w=monthWindow(cfg.payday,monthKey),s2=el("section","card"),h2=el("h2",null,"In "+mLabel(monthKey));h2.id="dueMonthH";s2.id="dueMonth";s2.setAttribute("aria-labelledby","dueMonthH");
  // Until the month has been changed here once, a hint says the month bar above is what this section follows.
  if(remMonthHint){var mh=el("div","remmh"),hint=el("span","small muted remhint"),ar=el("span",null,"\u2039 \u203a ");ar.setAttribute("aria-hidden","true");hint.id="remMonthHint";
    hint.appendChild(ar);hint.appendChild(document.createTextNode("change month above"));mh.appendChild(h2);mh.appendChild(hint);s2.appendChild(mh)}else s2.appendChild(h2);
  s2.appendChild(el("div","small muted",paydayFor(cfg.payday,monthKey)?shortDate(w.from)+" to "+shortDate(w.to)+", between "+dayWord(cfg)+"s":"The calendar month"));
  if(!mon.length)s2.appendChild(el("div","small muted","Nothing due in "+mLabel(monthKey)+"."));
  mon.forEach(function(it){s2.appendChild(above[it.key]?remNote(it):remRow(it,"m"))});box.appendChild(s2);
  if(up.length){// Opened for this redraw only when the open editor is in it; that doesn't count as the user opening it.
    var forced=remSec==="u"&&!dueAllOpen,s3=el("details","card");s3.id="dueAll";s3.open=dueAllOpen||forced;s3.appendChild(el("summary",null,"All upcoming"));var inn3=el("div","inner"),lastM="";
    up.forEach(function(it){var mk=mLabel(it.date.slice(0,7));if(mk!==lastM){inn3.appendChild(el("div","mhead",mk));lastM=mk}inn3.appendChild(remRow(it,"u"))});s3.appendChild(inn3);
    // Opening it on a redraw also fires "toggle"; only a change by the user scrolls it into view.
    s3.addEventListener("toggle",function(){if(forced){forced=false;return}if(s3.open===dueAllOpen)return;dueAllOpen=s3.open;if(s3.open)reveal(s3)});box.appendChild(s3)}
  if(cfg.doneLog.length){var s5=el("details","card");s5.id="doneLog";var sm=el("summary",null,"Recently done");s5.appendChild(sm);var inn=el("div","inner");
    cfg.doneLog.slice(0,10).forEach(function(x){var r=el("div","done-item");r.appendChild(el("span","d",fmtDate(x.on)));r.appendChild(el("span",null,x.text));inn.appendChild(r)});s5.appendChild(inn);
    s5.addEventListener("toggle",function(){if(s5.open)reveal(s5)});box.appendChild(s5)}
  var s4=el("section","card");s4.appendChild(el("h2",null,"Add your own"));
  s4.appendChild(el("div","small muted","Renewal dates for bills are set on each bill (Settings › Bills). Dated one-offs from the Pay tab show here too. Add anything else here, like MOTs, passports or a boiler service."));
  // A new reminder starts in the month on screen when that month is still ahead, otherwise 30 days from today.
  var add=el("button","btn ghost","+ Add a reminder");add.id="remAdd";add.addEventListener("click",function(){dropFreshRem();var r={id:uid("r"),name:"New reminder",date:w.from>todayStr()?w.from:plusDays(30),lead:30,yearly:false};
    cfg.reminders.push(r);saveCfg(true);remFresh={id:r.id,snap:JSON.stringify(r)};openRem="r:"+r.id;renewing=null;remHome=null;renewDraft=null;keepScroll(renderDue);reveal($(remDomId(openRem)));var f=$("rn_"+r.id);if(f){f.focus();f.select()}});
  s4.appendChild(add);box.appendChild(s4);
}
/* An item that's already in "Needs attention", as it shows in the month: one line, no buttons. */
function remNote(it){var d=el("div","remnote small muted",(it.name||"Reminder")+" \u00b7 "+fmtDate(it.date)+" \u00b7 "+relDays(it.days)+" \u2014 listed above");d.id=remDomId(it.key,"m");return d}
function remRow(it,sec){
  var d=el("div","rem "+it.status),top=el("div","spread"),here=remSec===sec;d.id=remDomId(it.key,sec);top.appendChild(el("b",null,it.name));
  if(it.amount!=null&&it.kind!=="rem")top.appendChild(el("span","num",(it.kind==="oneoff"?(it.ref.kind==="in"?"+ ":"− "):"")+fmt(it.amount)));d.appendChild(top);
  var line=el("div","spread small"),lt=el("span","muted",fmtDate(it.date)+" · "+relDays(it.days));line.appendChild(lt);
  var tag=it.status==="over"?el("span","pill bad","Overdue"):it.status==="soon"?el("span","pill due","Due soon"):el("span","pill plain",it.kind==="bill"?"Bill":it.kind==="oneoff"?(it.status==="past"?"One-off, passed":"One-off"):"Reminder");
  line.appendChild(tag);d.appendChild(line);
  if(it.status!=="later"||(openRem===it.key&&here)||it.kind==="oneoff")d.appendChild(el("div","act",it.note||defaultAction(it)));
  var br=el("div","btnrow");
  if(it.kind==="oneoff"){var ob=el("button","btn ghost","Open "+mLabel(it.month));ob.setAttribute("aria-label","Open "+mLabel(it.month)+": "+(String(it.name||"").trim()||"One-off"));ob.addEventListener("click",function(){var k=it.month,id=it.ref.id;afterTab("pay",function(){goMonth(k);openOneOffItem(id)})});br.appendChild(ob);d.appendChild(br);return d}
  var primary=it.kind==="rem"&&!it.yearly?"Done":(it.status==="over"&&it.kind==="bill"?"Update renewal":"Mark as renewed");
  // 2.13: each button's name says which item it's for ("Edit Gym membership"), not just "Edit".
  var rn=String(it.name||"").trim()||"Reminder";
  if(it.status!=="later"){var pb=el("button","btn",primary);pb.setAttribute("aria-label",primary+": "+rn);pb.addEventListener("click",function(){dropFreshRem();renewing=renewing===it.key&&here?null:it.key;remHome=sec;renewDraft=null;openRem=null;keepScroll(renderDue);if(renewing)reveal($(remDomId(it.key)))});br.appendChild(pb)}
  var open=openRem===it.key&&here,eb=el("button","btn ghost",open?"Close":"Edit");eb.setAttribute("aria-expanded",open?"true":"false");eb.setAttribute("aria-label",(open?"Close ":"Edit ")+rn);
  eb.addEventListener("click",function(){var gone=dropFreshRem()&&it.kind==="rem"&&cfg.reminders.indexOf(it.ref)<0;openRem=open||gone?null:it.key;remHome=sec;renewing=null;renewDraft=null;keepScroll(renderDue);if(openRem)reveal($(remDomId(it.key)));
    // Focus stays on this item's Edit or Close after the redraw, or goes to "+ Add a reminder" when an untouched new one went.
    var nb=document.querySelector("#"+remDomId(it.key,sec)+" .btn.ghost[aria-expanded]")||$("remAdd");if(nb)try{nb.focus({preventScroll:true})}catch(e){}});br.appendChild(eb);d.appendChild(br);
  if(renewing===it.key&&here)d.appendChild(renewForm(it));
  if(open)d.appendChild(remEditor(it));
  return d;
}
function renewForm(it){
  var f=el("div","ed"),id=it.key.replace(/[^a-z0-9]/gi,"_");
  if(it.kind==="rem"&&!it.yearly){f.appendChild(el("div","small","Remove this reminder?"));var b=el("button","btn","Yes, it's done");b.addEventListener("click",function(){renewing=null;logDone(it.name+" done");var entry=cfg.doneLog[0];
    removeWithUndo(cfg.reminders,it.ref,(it.name||"Reminder")+" done",function(){saveCfg(true);updateBadge();rerender()},"#"+remDomId(it.key)+" .btn");
    var restore=undoFn;if(restore)undoFn=function(){var ix=cfg.doneLog.indexOf(entry);if(ix>=0)cfg.doneLog.splice(ix,1);restore()}});f.appendChild(b);return f}
  var nd=el("input","inp");nd.type="date";nd.id="nd_"+id; // shown in the phone's format, read as ISO (see oneOffFields)
  // Suggest the next anniversary: a year on from a future date, or the next one after today for a date that has passed
  nd.value=it.days>=0?addYear(it.date):nextFuture(it.date);
  // What's been typed is kept while the form is open, so a redraw (a month change) doesn't reset it.
  var dr=renewDraft&&renewDraft.key===it.key?renewDraft:(renewDraft={key:it.key});if(dr.date!=null)nd.value=dr.date;
  nd.addEventListener("input",function(){dr.date=nd.value});nd.addEventListener("change",function(){dr.date=nd.value});
  var amt=null;
  if(it.kind==="bill"){amt=textIn(dr.amount!=null?dr.amount:Number(it.amount).toFixed(2),function(v){dr.amount=v},"na_"+id,true);f.appendChild(labeled("New amount for each payment (£)",amt))}
  f.appendChild(labeled("Next renewal date",nd));
  var msg=el("div","hint");f.appendChild(msg);
  var sb=el("button","btn","Save");sb.addEventListener("click",function(){var rise="";
    if(!validDate(nd.value)){msg.className="hint err";msg.textContent="Choose the next date.";return}
    var r=amt?parseMoney(amt.value,false):{empty:true};if(r.invalid){msg.className="hint err";msg.textContent="Enter an amount like 142.50";return}
    if(it.kind==="bill"){var b=it.ref,old=num(b.amount),before=itemSnap("bills",b),was0=validDate(b.renews)?b.renews.slice(0,7):null,fsnap=figSnap();if(!r.empty)b.amount=r.value;b.renews=nd.value;
      b.history=arr(b.history);b.history.push({on:todayStr(),date:nd.value,from:old,to:num(b.amount)});if(perYear(b)===1)b.months=[Number(nd.value.slice(5,7))];
      // 2.12: the new price (and month) from the month it renews in, or this pay month if that's later.
      dated("bills",b,before,was0);
      logDone(it.name+" renewed"+(!r.empty&&Math.abs(r.value-old)>0.004?" at "+fmt(r.value)+" (was "+fmt(old)+")":" at the same price")+", next "+fmtDate(nd.value));saveCfg(true);
      // 2.14: a new price inside a rough figure (5.7); one that takes the bills past it is asked about in Settings › Bills.
      cfg.accounts.forEach(function(a){if(estimateJustPassed(fsnap,cfg,a.id))figAsk=a.id});rise=figRise(b,old,fsnap);
      if(figAsk===b.account&&estimatePassed(cfg,b.account))rise=possessive(accName(b.account))+" bills now add up to more than its rough figure: Settings \u203a Bills asks if that's all of them."}
    else{it.ref.date=nd.value;logDone(it.name+" done, next "+fmtDate(nd.value));saveCfg(true)}
    renewing=null;toast("Saved."+(rise?" "+rise:"")+" Next reminder: "+fmtDate(nd.value));keepScroll(renderDue);renderPay()});
  var cb=el("button","btn ghost","Cancel");cb.addEventListener("click",function(){renewing=null;keepScroll(renderDue)});var row=el("div","btnrow");row.appendChild(sb);row.appendChild(cb);f.appendChild(row);
  return f;
}
function remEditor(it){
  var f=el("div","ed"),id=it.key.replace(/[^a-z0-9]/gi,"_"),ref=it.ref;
  if(it.kind==="rem")f.appendChild(labeled("Name",textIn(ref.name,function(v){ref.name=v;clearTimeout(remT);remT=setTimeout(function(){saveCfg(true);updateBadge()},500)},"rn_"+ref.id)));
  // A native date input: shown in the phone's format, read as its ISO value (see oneOffFields).
  var g=el("div","grid2"),dt=el("input","inp");dt.type="date";dt.id="rd_"+id;dt.value=it.date;
  dt.addEventListener("change",function(){if(!validDate(dt.value))return;if(it.kind==="bill")ref.renews=dt.value;else ref.date=dt.value;saveCfg(true);keepScroll(renderDue);reveal($(remDomId(it.key)))});
  g.appendChild(labeled("Date",dt));
  g.appendChild(labeled("Remind me",selectIn(LEADS,String(it.lead),function(v){ref.lead=Number(v);saveCfg(true);keepScroll(renderDue)},"rl_"+id)));f.appendChild(g);
  var nt=textIn(ref.note||"",function(v){if(v.trim())ref.note=v;else delete ref.note;clearTimeout(remT);remT=setTimeout(function(){saveCfg(true)},500)},"rt_"+id);nt.placeholder=defaultAction(it);
  f.appendChild(labeled("What to do (optional)",nt));
  if(it.kind==="rem")f.appendChild(checkIn("Repeats every year",ref.yearly,function(v){ref.yearly=v;saveCfg(true);keepScroll(renderDue)},"ry_"+ref.id));
  var br=el("div","btnrow");
  if(it.kind==="rem")br.appendChild(confirmBtn("rem"+ref.id,"Delete reminder",function(){openRem=null;var to=nextFocus($(remDomId(it.key)),".rem","#dueList",function(n){return "#"+n.id+" .btn"},"#remAdd");removeWithUndo(cfg.reminders,ref,(ref.name||"Reminder")+" deleted",function(){saveCfg(true);updateBadge();rerender()},"#"+remDomId("r:"+ref.id)+" .btn");focusOn(to)||focusOn("#remAdd")}));
  else br.appendChild(confirmBtn("rem"+it.key,"Stop reminding",function(){delete ref.renews;saveCfg(true);openRem=null;keepScroll(renderDue)}));
  f.appendChild(br);
  if(it.kind==="bill")f.appendChild(el("div","small muted","The amount and other details are in Settings › Bills."));
  return f;
}
var remT=null;

/* ---------- SETTINGS ---------- */
var cfgT=null;function queueCfg(){clearTimeout(cfgT);cfgT=setTimeout(function(){saveCfg();afterCfgChange()},600)}
function cfgNow(){clearTimeout(cfgT);saveCfg();afterCfgChange()}
var paySig="";function peopleSig(){return JSON.stringify(cfg.people.map(function(p){return p.pattern?[p.id,p.name,p.pattern]:[p.id,p.name]}))}
function afterCfgChange(){var s=peopleSig();if(s!==paySig){paySig=s;renderPayInputs()}renderPay();updateSums()}
var openBill=null,arm=null,delAcct=null,showBackup=false,restoreText="",restoreArm=false,restoreMsg="";
function labeled(t,input){var f=el("div");var l=el("label","lbl",t);l.htmlFor=input.id;f.appendChild(l);f.appendChild(input);return f}
function textIn(v,on,id,money){var i=el("input","inp"+(money?" num":""));i.id=id;if(money){i.inputMode="decimal";i.autocomplete="off"}i.value=v==null?"":v;i.addEventListener("input",function(){on(i.value)});
  if(money)i.addEventListener("blur",function(){var r=parseMoney(i.value,false);if(!r.empty&&!r.invalid)i.value=r.value.toFixed(2)});return i}
function selectIn(opts,val,on,id){var s=el("select","inp");s.id=id;opts.forEach(function(o){var op=el("option",null,o[1]);op.value=o[0];if(o[0]===val)op.selected=true;s.appendChild(op)});s.addEventListener("change",function(){on(s.value)});return s}
function checkIn(lbl,val,on,id){var l=el("label","check");var c=el("input");c.type="checkbox";c.id=id;c.checked=!!val;c.addEventListener("change",function(){on(c.checked)});l.appendChild(c);l.appendChild(el("span",null,lbl));return l}
function rerender(){if(tab==="analysis")keepScroll(renderAnalysis);else if(tab==="due")keepScroll(renderDue);else if(tab==="settings")keepScroll(renderSettings);else if(tab==="setup")keepScroll(renderSetup);else keepScroll(renderPay)}
/* A button that needs a second tap. armed: what it says after the first tap. calm: a main (green) button until that
   first tap, red only once armed (otherwise red throughout). */
function confirmBtn(key,label,onGo,armed,calm){var on=arm===key,b=el("button","btn"+(calm&&!on?"":" danger"),on?armed||"Tap again to confirm":label);b.setAttribute("data-confirm",key);
  b.addEventListener("click",function(){if(arm===key){arm=null;onGo()}else{arm=key;rerender();
    var nb=document.querySelector('[data-confirm="'+(window.CSS&&CSS.escape?CSS.escape(key):key)+'"]');if(nb)nb.focus()}});return b}
function openSettings(id,inner){goTab("settings");var d=$(id);if(!d)return null;d.open=true;var t=inner?$(inner):null;reveal(t||d);return t}
function money2(v){return Number(num(v)).toFixed(2)}
function updateSums(){
  var pc=cfg.payday||{};$("sumPayday").textContent=!pc.day?"Not set":pc.day==="last"?"Last working day":ordinal(Number(pc.day));
  // 2.16: the card's title is "Transfer day" once anyone is on a pattern.
  var sp=$("sPayday").querySelector("summary").firstChild;if(sp&&sp.nodeType===3)sp.nodeValue=dayWord(cfg,true);
  $("sumPeople").textContent=plural(cfg.people.length,"person","people");$("sumAccounts").textContent=plural(cfg.accounts.length,"account");
  $("sumBills").textContent=plural(cfg.bills.length,"bill");$("sumIncome").textContent=cfg.income.length?fmt(cfg.income.reduce(function(t,i){return t+num(i.amount)},0)):"None";
  $("sumLook").textContent=optName(THEMES,cfg.appearance.theme)+" · "+optName(TEXTS,cfg.appearance.textSize);
  $("sumNotify").textContent=cfg.notify.on?"On, "+cfg.notify.time:"Off";
  $("sumBudget").textContent=fmt(cfg.budgets.reduce(function(t,b){return t+num(b.amount)},0));$("sumSavings").textContent=fmt(cfg.savings.reduce(function(t,s){return t+num(s.amount)},0))}
/* 2.16.1: the Payday note's last sentence (payperiods.md 13.1, H4): which bank holidays move a payday or transfer day. */
var HOLIDAYS_KNOWN="It knows England and Wales bank holidays, not Scotland's, Northern Ireland's or one-off ones.";
/* 2.16: once anyone is on a pattern this is the transfer day (dayWord), and it can't be unset (5.3.2): there's no "Not set". */
var DAY_OPTS=(function(){var o=[];for(var i=1;i<=31;i++)o.push([String(i),ordinal(i)+" of the month"]);o.push(["last","Last working day of the month"]);return o})();
function renderPaydaySet(){
  var box=clear($("setPayday")),pc=cfg.payday,pat=hasPatterns(cfg);
  box.appendChild(el("div","small muted",pat?"The day each month you make the transfers. Pay that's arrived since the last one counts towards the next.":"Tell Dovetail when your pay arrives. It then opens on the right pay month and shows when your next payday is."));
  var opts=(pat&&pc.day?[]:[["",pat?"Choose a day":"Not set"]]).concat(DAY_OPTS);
  box.appendChild(labeled(dayWord(cfg,true),selectIn(opts,pc.day!=null?String(pc.day):"",function(v){if(!v)delete pc.day;else pc.day=v==="last"?"last":Number(v);cfgNow();keepScroll(renderPaydaySet);focusOn("#pay_day")},"pay_day")));
  if(pc.day&&pc.day!=="last")box.appendChild(checkIn(pat?"If it falls on a weekend or bank holiday, do it on the working day before":"If it falls on a weekend or bank holiday, we're paid the working day before",pc.weekend!==false,function(v){pc.weekend=v;cfgNow();keepScroll(renderPaydaySet);focusOn("#pay_wk")},"pay_wk"));
  if(pc.day){var nx=nextPayday(payCfg());
    if(nx)box.appendChild(el("div","banner good",pat?"Next transfer day: "+DAYS[dow(nx.date)]+" "+fmtDate(nx.date)+" ("+relDays(daysUntil(nx.date))+"). It's for "+mLabel(nx.month)+".":"Next payday: "+DAYS[dow(nx.date)]+" "+fmtDate(nx.date)+" ("+relDays(daysUntil(nx.date))+"). It pays for "+mLabel(nx.month)+"."));
    box.appendChild(el("div","small muted",pat?"From 10 days before a transfer day, Dovetail opens on the month it's for. "+HOLIDAYS_KNOWN:"From 10 days before a payday, Dovetail opens on the month that pay is for. "+HOLIDAYS_KNOWN))}
}
function renderPayLine(){
  // 2.16: "Transfer day: Fri 30 Oct 2026 (in 8 days)" once anyone is on a pattern (dayWord).
  var box=clear($("payLine")),pd=paydayFor(payCfg(),monthKey),pat=hasPatterns(cfg);
  if(!pd){var b=el("button","linkbtn",pat?"Set your transfer day":"Set your payday so Dovetail opens on the right month");b.addEventListener("click",function(){openSettings("sPayday")});box.appendChild(b);return}
  var n=daysUntil(pd);box.textContent=(pat?(n===0?"Transfer day is today: ":"Transfer day: "):n>0?"Payday: ":n===0?"Payday is today: ":"Paid on ")+DAYS[dow(pd)]+" "+fmtDate(pd)+(n!==0?" ("+relDays(n)+")":"");

}
function segRadios(name,legend,opts,val,on){var fs=el("fieldset","seg");fs.appendChild(el("legend","lbl",legend));var row=el("div","segrow");
  opts.forEach(function(o){var id=name+"_"+o[0],l=el("label"),r=el("input");r.type="radio";r.name=name;r.id=id;r.value=o[0];r.checked=o[0]===val;
    r.addEventListener("change",function(){if(r.checked)on(o[0])});l.htmlFor=id;l.appendChild(r);l.appendChild(el("span",null,o[1]));row.appendChild(l)});
  fs.appendChild(row);return fs}
var THEMES=[["system","Follow phone"],["light","Light"],["dark","Dark"]],TEXTS=[["small","Smaller"],["normal","Normal"],["large","Larger"]];
function optName(list,v){for(var i=0;i<list.length;i++)if(list[i][0]===v)return list[i][1];return list[0][1]}
function renderLookSet(){var box=clear($("setLook")),ap=cfg.appearance;
  box.appendChild(segRadios("look_theme","Theme",THEMES,ap.theme,function(v){ap.theme=v;saveCfg(true);applyAppearance();updateSums()}));
  box.appendChild(segRadios("look_text","Text size",TEXTS,ap.textSize,function(v){ap.textSize=v;saveCfg(true);applyAppearance();updateSums();reveal($("sLook"))}));
  box.appendChild(el("div","small muted","Follow phone uses your phone's light or dark mode. These choices are saved with your settings, so they come back with a backup."))}
/* Settings › Reminders & notifications (only in the Android app). On/off is the app's (it needs the phone's permission);
   the time and the amounts choice are saved in the settings. */
function renderNotifySet(){
  var det=$("sNotify");if(!notifyNative()){det.hidden=true;return}det.hidden=false;
  var refocus=document.activeElement&&document.activeElement.id==="notify_on";
  var box=clear($("setNotify")),nt=cfg.notify,on=nativeNotifyOn();
  if(!notifyBusy&&nt.on!==on){nt.on=on;saveCfg(true)}
  box.appendChild(el("div","small muted","Dovetail can remind you the day before "+dayWord(cfg)+", when a bill renewal or one of your reminders becomes due soon and on the day itself, and the day before a dated one-off. The notifications come from this phone; nothing is sent anywhere."));
  var l=checkIn("Notify me about reminders",on,function(v){if(notifyBusy){sw.checked=!v;return}notifyBusy=true;notifyRefused=false;renderNotifySet();nativeCall(function(){NATIVE.setNotificationsEnabled(v)})},"notify_on"),sw=l.querySelector("input");
  if(notifyBusy)sw.setAttribute("aria-disabled","true");box.appendChild(l);
  if(notifyBusy)box.appendChild(el("div","small muted","Waiting for your phone…"));
  else if(notifyRefused)box.appendChild(el("div","banner","Notifications are blocked for Dovetail on this phone. To use them, allow notifications for Dovetail in your phone's Settings › Apps › Dovetail › Notifications, then turn this on again."));
  var tm=el("input","inp");tm.type="time";tm.id="notify_time";tm.step="900";tm.min="06:00";tm.max="22:00";tm.value=nt.time;
  tm.addEventListener("change",function(){if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(tm.value))return;nt.time=notifyTime(tm.value);tm.value=nt.time;saveCfg(true);flushSchedule();updateSums()});
  box.appendChild(labeled("Time of day (between 06:00 and 22:00)",tm));
  box.appendChild(checkIn("Show amounts in notifications",nt.amounts,function(v){nt.amounts=v;saveCfg(true);flushSchedule()},"notify_amounts"));
  box.appendChild(el("div","small muted","Notifications can show on the lock screen, so amounts are left out unless you turn this on."+(payCfg().day?"":" Set your "+dayWord(cfg)+" in Settings › "+dayWord(cfg,true)+" to get a reminder the day before.")));
  if(refocus){var nsw=$("notify_on");if(nsw)try{nsw.focus()}catch(e){}}}
function renderLockSet(){
  var det=$("sLock");if(!NATIVE){det.hidden=true;return}det.hidden=false;
  var refocus=document.activeElement&&document.activeElement.id==="lock_on";
  var box=clear($("setLock")),on=!!nativeCall(function(){return NATIVE.lockEnabled()},false),avail=!!nativeCall(function(){return NATIVE.lockAvailable()},false);
  $("sumLock").textContent=on?"On":"Off";
  box.appendChild(el("div","small muted","Ask for your fingerprint, face or phone PIN when you open Dovetail. It locks again after a minute away. While it's on, Dovetail is hidden in the recent-apps screen and screenshots are blocked."));
  var l=checkIn("Lock Dovetail with fingerprint, face or screen lock",on,function(v){if(lockBusy){cb.checked=!v;return}lockBusy=true;renderLockSet();nativeCall(function(){NATIVE.setLockEnabled(v)})},"lock_on");
  var cb=l.querySelector("input");if(!avail&&!on)cb.disabled=true;else if(lockBusy)cb.setAttribute("aria-disabled","true");box.appendChild(l);
  if(lockBusy)box.appendChild(el("div","small muted","Confirm with your fingerprint, face or PIN…"));
  else if(!avail)box.appendChild(el("div","banner",on?"Your phone has no screen lock at the moment, so Dovetail opens without asking. Set one up in your phone's settings.":"Set up a fingerprint, face unlock or screen lock in your phone's settings first."));
  if(refocus&&!cb.disabled)try{cb.focus()}catch(e){}
}
function renderSettings(){renderPeopleSet();renderAccountsSet();renderBillsSet();renderIncomeSet();renderBudgetSet();renderSavingsSet();renderPaydaySet();renderHelpSet();renderLookSet();renderNotifySet();renderLockSet();renderBackupSet();updateSums();
  renderAbout()}
/* About, plus app details for reporting a problem: version and device facts only, never names or amounts. */
function appDetails(){var ua=navigator.userAgent||"",cv=(/Chrome\/([\d.]+)/.exec(ua)||[])[1]||"unknown",av=(/Android ([\d.]+)/.exec(ua)||[])[1];
  var errs=errLog.slice(-5).map(function(e){return "  "+e.at+" "+(e.v||"")+" "+e.kind+(e.where?" at "+e.where:"")+": "+e.msg});
  return ["Dovetail "+VERSION+" (data version "+((cfg&&cfg.schema)||SCHEMA)+")",(NATIVE?"Android app":"Browser")+(av?", Android "+av:"")+", WebView/Chrome "+cv,
    "Screen "+window.innerWidth+"×"+window.innerHeight+" at "+(window.devicePixelRatio||1)+"x"+(function(){try{return window.matchMedia("(prefers-color-scheme: dark)").matches?", dark mode":""}catch(e){return ""}})(),
    cfg?"Household: "+plural(cfg.people.length,"person","people")+", "+plural(cfg.accounts.length,"account")+", "+plural(cfg.bills.length,"bill")+", "+plural(usedMonths(months||{},"9999-12").length,"saved month")+(cfg.example?" (example)":""):"Household: couldn't be opened (recovery screen)",
    "Opened on "+todayStr()].concat((function(){var a=asideInfo();return a?["Set-aside data from a recovery: "+(a.when||"unknown time")+", "+Math.round(a.size/1024)+" KB"]:[]})()).concat(errs.length?["Recent errors:"].concat(errs):["No recent errors"]).join("\n")}
/* "Send feedback": in the app, the bridge opens the email app (Android says so if there's no email app; if the bridge
   refuses the request, which it shouldn't, the address is copied). In a browser it's a mailto link, refreshed when it's
   used so the details are current. */
function feedbackButton(id){var b;
  if(NATIVE){b=el("button","btn","Send feedback");b.type="button";b.addEventListener("click",function(){var m=feedbackMail(appDetails(),VERSION);
    if(!nativeCall(function(){return NATIVE.sendFeedback(m.subject,m.body)},false))copyText(m.to,"Couldn't open an email app, so the address is copied: "+m.to)})}
  else{b=el("a","btn","Send feedback");b.href=feedbackMail(appDetails(),VERSION).mailto;b.addEventListener("click",function(){b.href=feedbackMail(appDetails(),VERSION).mailto})}
  b.id=id;return b}
function renderAbout(){var box=clear($("about"));
  var brand=el("div","about-brand");brand.appendChild(markSvg());brand.appendChild(el("b",null,"Dovetail"));box.appendChild(brand);
  box.appendChild(el("div",null,"Dovetail version "+VERSION+". Your figures are stored on this phone and the app has no internet access."+(NATIVE?" Automatic backups are kept on this phone too.":"")+" Back up in Settings › Backup, export & restore before changing phones."));
  box.appendChild(el("div",null,"Found a problem or have an idea? \u201cSend feedback\u201d opens your email app with the app details filled in: the version and your phone's screen size, never your names or amounts. Or write to "+FEEDBACK_EMAIL+"."));
  var b=el("button","btn ghost","Copy app details");b.id="copyDetails";b.addEventListener("click",function(){copyText(appDetails(),"App details copied")});var r=el("div","btnrow");r.appendChild(feedbackButton("sendFeedback"));r.appendChild(b);box.appendChild(r);
  box.appendChild(el("div",null,"Dovetail is free software under the GNU General Public License, version 3 or later."));
  // What changed: the What's new lines of the last three versions, newest first, so lines dismissed with "Got it" can be read again.
  var wc=el("details","changed-v");wc.id="whatChanged";wc.appendChild(el("summary",null,"What changed"));
  whatsNewLists(wc,whatsNewVersions(WHATS_NEW,null,VERSION).slice(0,3),true);wc.appendChild(el("div",null,"Earlier versions aren't listed here."));box.appendChild(wc)}
/* people */
/* 2.16: "How often they're paid" (Settings › People and setup's step 2). */
var EVERY_OPTS=[["","Every month"],["28","Every four weeks"],["14","Every two weeks"],["7","Every week"]];
/* "About £1,690.00 a month over a year." */
function aboutWords(p){return "About "+fmt(usualMonthly(p))+" a month over a year."}
function renderPeopleSet(){
  var box=clear($("setPeople"));box.appendChild(el("div","small muted","Everyone whose take-home pay goes into the household. You type each person's pay on the Pay tab each month."));
  var orders=hasPatterns(cfg)?standingOrders(cfg,months,thisMonth()):{};
  cfg.people.forEach(function(p,i){var d=el("div","box"),g=el("div","grid2"),sid=safeId(p.id),before=personSnap(p),note,ab=null,t=patternOf(p);d.id="person_"+sid;
    g.appendChild(labeled("Name",textIn(p.name,function(v){p.name=v;queueCfg()},"pp_n_"+sid)));
    // 2.15: with earlier months saved, a change to usual pay applies from this pay month; the line under it says so.
    // 2.16: for someone on a pattern the field is pay each time, dated the same way (usual pay is worked out from it).
    g.appendChild(labeled(t?"Take-home pay each time (£)":"Usual take-home pay (£)",textIn(t?money2(t.each):p.usualPay?money2(p.usualPay):"",function(v){var r=parseMoney(v,false);if(r.invalid)return;
      if(t){if(!(r.value>0)||r.value>PAY_EACH_MAX)return;p.pattern=Object.assign({},p.pattern,{each:r2(r.value)});p.usualPay=usualMonthly(p);if(ab)sayLater(ab,aboutWords(p))}else p.usualPay=r.value||0;
      datedPay(p,before);fillDatedNote(note,"people",p,redraw);queueCfg()},"pp_u_"+sid,true)));d.appendChild(g);
    function redraw(){keepScroll(renderPeopleSet)}
    note=datedNote("people",p,"pp_d_"+sid,redraw,"pp_u_"+sid);d.appendChild(note);
    var fs=selectIn(EVERY_OPTS,t?String(t.every):"",function(v){changeEvery(p,v?Number(v):null,fs)},"pp_f_"+sid);d.appendChild(labeled("How often they're paid",fs));
    if(t){ab=el("div","small muted",aboutWords(p));ab.id="pp_m_"+sid;ab.setAttribute("aria-live","polite");d.appendChild(ab);
      // 2.17 (13.2, L4, L15): a recent payday, written straight to the pattern (never dated: it's a correction, not a change
      // of pay). Clearing it removes the first pay (since) too. Under it, when the next payday is.
      var nl=el("div","small");nl.id="pp_next_"+sid;nl.setAttribute("aria-live","polite");
      d.appendChild(paydayField("pp_on_"+sid,t.on,function(v,bad){if(bad)return;var o=Object.assign({},p.pattern);if(v)o.on=v;else{delete o.on;delete o.since}
        if(o.on===p.pattern.on&&o.since===p.pattern.since)return;p.pattern=o;cfgNow();fillNextPayday(nl,p)}));
      fillNextPayday(nl,p);d.appendChild(nl)}
    d.appendChild(labeled("Paid into",selectIn(accountOptions(cfg,cfg.accounts.filter(function(x){return x.closedFrom&&x.id!==p.payAccount}).map(function(x){return x.id})),p.payAccount,function(v){p.payAccount=v;cfgNow();keepScroll(renderSettings)},"pp_a_"+safeId(p.id))));
    // 2.16 (5.3.6): standing orders from each pay that cover every month, or why there's no figure (a move of what's left).
    var so=t&&orders[p.id];
    if(so&&so.orders.length){var sl=el("div","small");sl.id="pp_so_"+sid;sl.appendChild(el("b",null,"Standing orders that cover every month: "));
      sl.appendChild(document.createTextNode(so.orders.map(orderWords).join("; ")+". Once they're set up, tick these transfers each month when they've gone."));d.appendChild(sl)}
    else if(so&&so.moveTo){var ml=el("div","small",possessive(p.name||"Their")+" pay goes on to "+accName(so.moveTo)+" in one transfer on your transfer day, so there's no fixed amount for a standing order. To pay "+accName(so.moveTo)+" from each pay instead, make it send what's left to "+accName(p.payAccount)+" in Settings › Accounts: Dovetail then tops it up, and shows a standing order that covers it.");ml.id="pp_so_"+sid;d.appendChild(ml)}
    if(!t)d.appendChild(el("div","small muted","Usual pay is used until you type the pay that actually arrived."));
    // 2.12.1: someone paying board keeps the rest of their money: their account isn't in the household's left over.
    // Offered when it counts: their account is their own, keeps what's left, and nobody else pays into it.
    var bid="pp_b_"+safeId(p.id),counts=!!boarderAccounts(Object.assign({},cfg,{people:cfg.people.map(function(q){return q===p?Object.assign({},q,{boarder:true}):q})}))[p.payAccount];
    if(cfg.people.length>1&&(p.boarder||(i>0&&counts))){var bc=checkIn("Pays board, and keeps the rest of their money",p.boarder===true,function(v){if(v)p.boarder=true;else delete p.boarder;cfgNow();keepScroll(renderSettings);var e=$(bid);if(e)try{e.focus({preventScroll:true})}catch(x){}},bid);d.appendChild(bc);
      var bh=el("div","small muted",BOARD_IS+" "+(counts?"Their board is set in Settings \u203a Accounts \u203a Paid for by. What's left in their own account isn't counted in what the household has left.":"This only counts when their pay goes into an account of their own that keeps what's left and nobody else pays into."));bh.id=bid+"_h";d.appendChild(bh);bc.querySelector("input").setAttribute("aria-describedby",bh.id)}
    if(cfg.people.length>1){var br=el("div","btnrow");br.appendChild(confirmBtn("person"+p.id,"Remove "+(p.name||"person"),function(){cfg.people.splice(i,1);cfgNow();keepScroll(renderSettings)}));d.appendChild(br)}
    box.appendChild(d)});
  var add=el("button","linkbtn","+ Add a person");add.addEventListener("click",function(){var np={id:uid("p"),name:"",payAccount:(cfg.accounts[0]||{}).id,usualPay:0};cfg.people.push(np);cfgNow();keepScroll(renderPeopleSet);var f=$("pp_n_"+safeId(np.id));if(f){reveal($("person_"+safeId(np.id)));f.focus()}});box.appendChild(add);
}
/* 2.17: "Next payday: Fri 6 Nov, then every week." under a recent payday (it shows up a date typed as a holiday-moved
   one), or nothing without a date. */
function fillNextPayday(n,p){clear(n);var t=datedPattern(p),nx=t?nextPaydayOf(t,todayStr()):null;n.hidden=!nx;if(!nx)return;
  n.appendChild(document.createTextNode("Next payday: "));n.appendChild(shortDates(nx));n.appendChild(document.createTextNode(", then every "+PAY_EVERY[t.every].word+"."))}
/* 2.17 (13.2, L15): dates as the screen shows them, short ("Fri 30 Oct" for one day, a string; for a list "30 Oct, 6 and
   13 Nov"), hidden from screen readers and followed by the full dates in a .sr span ("Friday 30 October"; "30 October, 6
   and 13 November"). */
function shortDates(x){var one=typeof x==="string",f=document.createDocumentFragment(),a=el("span",null,one?shortDay(x):datesWords(x));a.setAttribute("aria-hidden","true");
  f.appendChild(a);f.appendChild(el("span","sr",one?dayDate(x):datesWordsFull(x)));return f}
/* 2.17 (13.2, L5): after a change of how often person pid is paid (settings before it: cBefore), each saved month whose
   interval for them changed loses its count and an untouched extra payday, and is counted again with the new pattern. */
function refreezeEvery(cBefore,pid){if(saveT){clearTimeout(saveT);saveT=null;flushMonth()}var ks=intervalChangedMonths(cBefore,cfg,months,pid);if(!ks.length)return;months=refreezeInterval(cfg,months,pid,ks,cBefore);saveMonths();
  if(ks.indexOf(monthKey)>=0){cur=months[monthKey]?clone(months[monthKey]):null;xFresh()}}
/* 2.16: a guess at pay each time for every days from what someone's paid now (their pay over a year, spread). */
function guessEach(p,every){var t=patternOf(p),m=t?usualMonthly(p):num(p.usualPay);return every?r2(m*12/PAY_EVERY[every].year):r2(m)}
/* 2.16 (5.3.7, E8, E13): "How often they're paid" changed to every (7, 14 or 28, or null for every month). With months
   saved before this pay month, or a pattern chosen with no transfer day set, a sheet asks for the pay (and the transfer
   day) and the change applies from the month the app opens on; otherwise the fields just change. */
function changeEvery(p,every,sel){var t=patternOf(p);if((t?t.every:null)===every)return;
  if(datesEdits()||(every&&!payCfg().day)||!(guessEach(p,every)>0)&&every){openPayChange(p,every,sel);return}
  var cBefore=clone(cfg);if(every){p.pattern={every:every,each:guessEach(p,every)};p.usualPay=usualMonthly(p)}else delete p.pattern;
  refreezeEvery(cBefore,p.id);cfgNow();keepScroll(renderSettings);focusOn("#pp_f_"+safeId(p.id))}
/* The sheet "{Name}'s pay from now on": pay each time (or usual pay, back to every month), "From {month}" with earlier
   months saved, and the transfer day when none is set. Change applies it; Cancel or closing leaves everything as it was. */
function openPayChange(p,every,sel){var sid=safeId(p.id),hist=datesEdits(),needDay=!!every&&!payCfg().day,k=thisMonth(),g=guessEach(p,every),nodes=[],day="",wk=true;
  var pin=textIn(g>0?money2(g):"",function(){},"ppc_pay",true);pin.placeholder="0.00";nodes.push(labeled(every?"Take-home pay each time (£)":"Usual take-home pay (£)",pin));
  if(hist){var fr=el("p","small","From "+mLabel(k)+".");fr.id="ppc_from";nodes.push(fr)}
  if(hist&&every)nodes.push(el("p","small muted","Paid a week in hand? The first month will have fewer paydays, so type what arrived."));
  // 2.17 (13.2, L7): the first pay on the new pattern (optional) becomes its recent payday (on) and first pay (since). When
  // that pay is for a month after the one the app opens on, the change waits until Dovetail moves on to it.
  var fpd=null,wait=null;if(every){fpd=el("input","inp");fpd.type="date";fpd.id="ppc_on";fpd.min="2000-01-01";fpd.max="2099-12-31";
    var fh=el("div","small muted","As it usually falls, not one moved for a bank holiday.");fh.id="ppc_on_h";fpd.setAttribute("aria-describedby",fh.id);
    nodes.push(labeled("When's the first pay on the new pattern?",fpd));nodes.push(fh);wait=el("p","small");wait.id="ppc_wait";wait.hidden=true;wait.setAttribute("aria-live","polite");nodes.push(wait)}
  if(needDay){var dw=el("div");nodes.push(dw);(function drawDay(){clear(dw);dw.appendChild(labeled("Transfer day",selectIn([["","Choose a day"]].concat(DAY_OPTS),day,function(v){day=v;drawDay();focusOn("#ppc_day")},"ppc_day")));
    if(day&&day!=="last")dw.appendChild(checkIn("If it falls on a weekend or bank holiday, do it on the working day before",wk,function(v){wk=v},"ppc_wk"))})()}
  var msg=el("div","hint err");msg.id="ppc_msg";msg.setAttribute("aria-live","polite");nodes.push(msg);
  var br=el("div","btnrow"),go=el("button","btn","Change");go.type="button";go.id="ppc_go";var cn=el("button","btn ghost","Cancel");cn.type="button";cn.id="ppc_cancel";
  // L7: the transfer day the change would use (the one chosen here when none is set), and the first pay's month against it.
  function newPc(){return needDay?(day?setupPayday({day:day,weekend:wk}):null):payCfg()}
  function startLater(){var v=fpd&&fpd.value,pc=newPc();if(!fpd||!paydayDateOk(v)||!pc)return null;
    var f=firstPayChange(Object.assign({},cfg,{payday:pc}),p.id,every,v);return f&&f.k>defaultMonth(pc)?f:null}
  function checkStart(){if(!fpd)return;var l=startLater();wait.hidden=!l;go.disabled=!!l;wait.textContent=l?l.text:"";
    if(l)go.setAttribute("aria-describedby","ppc_wait");else go.removeAttribute("aria-describedby")}
  if(fpd){fpd.addEventListener("change",checkStart);fpd.addEventListener("blur",checkStart);if(needDay)dw.addEventListener("change",checkStart)}
  go.addEventListener("click",function(){if(startLater())return;var r=parseMoney(pin.value,false),bad=every?(r.invalid||r.empty||!(r.value>0)||r.value>PAY_EACH_MAX):r.invalid;
    pin.classList.toggle("bad",bad);if(bad){pin.setAttribute("aria-invalid","true");msg.textContent=every?"Type pay as an amount, like 420.00.":"Type pay as an amount, like 1850.00.";pin.focus();return}
    if(needDay&&!day){msg.textContent="Choose a transfer day.";focusOn("#ppc_day");return}
    var on=fpd&&fpd.value;if(paydayPart(fpd)){msg.textContent=PAYDAY_PART;fpd.focus();return}if(on&&!paydayDateOk(on)){msg.textContent=PAYDAY_BAD;fpd.focus();return}
    var cBefore=clone(cfg),before=personSnap(p);if(every){p.pattern={every:every,each:r2(r.value)};if(on){p.pattern.on=on;p.pattern.since=on}p.usualPay=usualMonthly(p)}else{delete p.pattern;p.usualPay=r.empty?0:r2(r.value)}
    datedPay(p,before);if(needDay){cfg.payday=cfg.payday||{};cfg.payday.day=day==="last"?"last":Number(day);if(day!=="last")cfg.payday.weekend=wk}
    refreezeEvery(cBefore,p.id);cfgNow();closeSheet()});
  cn.addEventListener("click",function(){closeSheet()});br.appendChild(go);br.appendChild(cn);nodes.push(br);
  openSheet(possessive(p.name||"Their")+" pay from now on",nodes,sel,{quietClose:true,onClose:function(){keepScroll(renderSettings)}})}
/* accounts */
function itemsOn(id){
return {bills:cfg.bills.filter(function(b){return b.account===id}).length,income:cfg.income.filter(function(x){return x.account===id}).length,
  budgets:cfg.budgets.filter(function(x){return x.account===id}).length,savings:cfg.savings.filter(function(x){return x.fromAccount===id}).length,people:cfg.people.filter(function(x){return x.payAccount===id}).length,
  estimates:arr(cfg.estimates).filter(function(x){return x.account===id}).length}}
function renderAccountsSet(){
  var box=clear($("setAccounts"));
  // Changing how the household manages its money (2.12) takes the whole card until it's done or cancelled.
  if(setup&&setup.change){var cb=el("div","su-change");cb.id="chBox";box.appendChild(cb);renderSetup();return}
  box.appendChild(el("div","small muted","The bank accounts your money moves between. Each payday, pay lands in an account, which pays its own bills first. What's left moves on to the account you choose under \u201cWhat's left moves to\u201d. The account that keeps what's left holds your left over: your money for the month. An account can also be paid for by several people, under \u201cPaid for by\u201d."));
  if(cfg.people.length)box.appendChild(moneyBox());
  var live=Object.assign({},cfg,{accounts:cfg.accounts.filter(function(a){return !a.closedFrom})});
  var fb=el("div","box flowbox"),fh=el("h3",null,"How money moves between them");fh.id="acFlowH";fb.appendChild(fh);fb.appendChild(flowDiagram(live,"acFlowH"));box.appendChild(fb);
  cfg.accounts.forEach(function(a){box.appendChild(acctEditor(a))});
  var add=el("button","linkbtn","+ Add an account");add.addEventListener("click",function(){var roots=rootIds(cfg).filter(function(id){return !accById(cfg,id).closedFrom}),na={id:uid("a"),name:"",colour:COLOURS[cfg.accounts.length%COLOURS.length][0],leftoverTo:roots[0]||null};cfg.accounts.push(na);cfgNow();keepScroll(renderSettings);var f=$("ac_n_"+safeId(na.id));if(f){reveal($("acct_"+safeId(na.id)));f.focus()}});box.appendChild(add);
}
function acctEditor(a){
  var d=el("div","box"),sid=safeId(a.id);d.id="acct_"+sid;
  if(a.closedFrom){var cn=el("div","pill plain","Closed from "+mLabel(a.closedFrom));cn.id="ac_closed_"+sid;d.appendChild(cn)}
  var g=el("div","grid2");
  g.appendChild(labeled("Name",textIn(a.name,function(v){a.name=v;queueCfg()},"ac_n_"+sid)));
  g.appendChild(labeled("Colour",selectIn(COLOURS,a.colour||"grey",function(v){a.colour=v;cfgNow();keepScroll(renderAccountsSet)},"ac_c_"+sid)));d.appendChild(g);
  // What's left can't go to itself or to an account that already sends its money here (that would be a loop).
  var bad=[a.id].concat(descendants(cfg,a.id)),cur0=parentId(cfg,a.id);
  // Closed accounts (2.12) aren't offered, unless it's the one already chosen.
  cfg.accounts.forEach(function(x){if(x.closedFrom&&x.id!==cur0&&bad.indexOf(x.id)<0)bad.push(x.id)});
  var opts=[["","Keeps what's left (your left over)"]].concat(accountOptions(cfg,bad));
  d.appendChild(labeled("What's left moves to",selectIn(opts,parentId(cfg,a.id)||"",function(v){a.leftoverTo=v||null;cfgNow();keepScroll(renderSettings)},"ac_l_"+sid)));
  if(cfg.people.length&&!a.closedFrom)d.appendChild(acctFunding(a));
  var n=itemsOn(a.id),parts=[];if(n.people)parts.push(plural(n.people,"person's pay","people's pay"));if(n.bills)parts.push(plural(n.bills,"bill"));if(n.income)parts.push(plural(n.income,"income"," incomes"));if(n.budgets)parts.push(plural(n.budgets,"budget"));if(n.savings)parts.push(plural(n.savings,"savings transfer"));if(n.estimates)parts.push("its rough figure");
  d.appendChild(el("div","small muted",parts.length?"Uses: "+parts.join(", ")+".":"Nothing uses this account yet."));
  if(cfg.accounts.filter(function(x){return !x.closedFrom}).length>1&&!a.closedFrom){
    if(delAcct===a.id){var mv=el("div","box");mv.style.background="var(--surface)";
      var others=accountOptions(cfg,[a.id].concat(cfg.accounts.filter(function(x){return x.closedFrom}).map(function(x){return x.id}))),target=others[0]&&others[0][0],closes=closesInstead(a.id);
      if(closes)mv.appendChild(el("div","small","It closes from "+mLabel(thisMonth())+". Earlier months keep it."));
      mv.appendChild(el("div","small",parts.length?(closes?"From then, move everything that uses ":"Move everything that uses ")+(a.name||"this account")+" to:":"Nothing uses this account, so nothing needs to move."));
      if(parts.length&&target)mv.appendChild(labeled("Move to",selectIn(others,target,function(v){target=v},"ac_mv_"+sid)));
      var br2=el("div","btnrow"),go=el("button","btn danger",(closes?"Close ":"Delete ")+(a.name||"account"));go.id="ac_del_go_"+sid;
      go.addEventListener("click",function(){deleteAccount(a.id,target)});
      var cn=el("button","btn ghost","Cancel");cn.addEventListener("click",function(){delAcct=null;keepScroll(renderAccountsSet)});br2.appendChild(go);br2.appendChild(cn);mv.appendChild(br2);d.appendChild(mv)}
    else{var br=el("div","btnrow"),db=el("button","btn danger","Delete account…");db.addEventListener("click",function(){delAcct=a.id;keepScroll(renderAccountsSet);reveal($("acct_"+sid))});br.appendChild(db);d.appendChild(br)}}
  return d}
/* 2.12: "Paid for by" on an account: the people who pay into it from their pay accounts, and how they split what it
   needs (funding; see calc.js). Closed unless someone pays into it, or it was opened this session. */
var RULE_OPTIONS=[["equal","Equal shares (half each for two)"],["pay","In proportion to usual pay"],["afterOwn","In proportion to what's left after their own bills"],["sameLeft","So they each keep the same"],["set","Set amounts"]],fundOpen={};
function acctFunding(a){var sid=safeId(a.id),f=isObj(a.funding)?a.funding:null,set=f&&isObj(f.set)?f.set:{},ppl=fundingPeople(cfg,a.id);
  var det=el("details","fund");det.id="acf_"+sid;det.open=fundOpen[a.id]!=null?fundOpen[a.id]:!!f;det.addEventListener("toggle",function(){fundOpen[a.id]=det.open});
  // 2.13: the summary names everyone ticked, as they're ticked (the warning below says when someone would pay twice).
  var ticked=f?f.people.map(function(pid){return personById(cfg,pid)}).filter(Boolean):[],who=ppl.length>=ticked.length?ppl:ticked;
  var sm=el("summary");sm.appendChild(el("b",null,"Paid for by"));sm.appendChild(el("span","small muted",who.length?fundingWords(f,who,"it",a.id):"Nobody pays into it directly."));det.appendChild(sm);
  var body=el("div","fund-in");det.appendChild(body);
  body.appendChild(el("p","small muted","People who pay into this account from their own pay each month. Shares are worked out from what the account needs, after what reaches it above."));
  function save(nf,focusId){if(nf&&nf.people.length)a.funding=normFunding(nf,cfg)||undefined;else delete a.funding;if(a.funding===undefined)delete a.funding;
    fundOpen[a.id]=true;cfgNow();keepScroll(renderSettings);var e=focusId&&$(focusId);if(e)try{e.focus({preventScroll:true})}catch(x){}}
  var nf=function(){return f?clone(f):{people:[],rule:"equal"}};
  cfg.people.forEach(function(p,i){var on=!!(f&&f.people.indexOf(p.id)>=0),id="ac_fp_"+sid+"_"+i;
    body.appendChild(checkIn(personName(p,i)+" pays into it",on,function(v){var x=nf(),ids=x.people;
      if(v&&ids.indexOf(p.id)<0)ids.push(p.id);if(!v){x.people=ids.filter(function(q){return q!==p.id});if(x.set)delete x.set[p.id]}
      x.people=cfg.people.map(function(q){return q.id}).filter(function(q){return x.people.indexOf(q)>=0});save(x,id)},id))});
  if(f){body.appendChild(labeled("How they split it",selectIn(RULE_OPTIONS,f.rule,function(v){var x=nf();x.rule=v;save(x,"ac_fr_"+sid)},"ac_fr_"+sid)));
    f.people.forEach(function(pid){var p=personById(cfg,pid);if(!p)return;var i=cfg.people.indexOf(p),nm=personName(p,i),v=set[pid],kind=v?(v.pct!=null?"pct":"amount"):(f.rule==="set"?"amount":"share");
      var opts=(f.rule==="set"?[]:[["share","A share, as above"]]).concat([["amount","A set amount"],["pct","A percentage of their pay"]]);
      var row=el("div","fund-row");row.appendChild(labeled(nm+" pays",selectIn(opts,kind,function(k){var x=nf();x.set=x.set||{};
        if(k==="share")delete x.set[pid];else x.set[pid]=k==="pct"?{pct:0}:{amount:0};save(x,"ac_fk_"+sid+"_"+i)},"ac_fk_"+sid+"_"+i)));
      if(kind!=="share"){var cur0=v?(kind==="pct"?v.pct:v.amount):0,inp=textIn(cur0?String(kind==="pct"?cur0:Number(cur0).toFixed(2)):"",function(t){
          var r=parseMoney(kind==="pct"?String(t).replace("%",""):t,false),val=r.empty?0:r.value,ok=!r.invalid&&(kind!=="pct"||val<=100);
          inp.classList.toggle("bad",!ok&&!r.empty);if(!ok&&!r.empty)inp.setAttribute("aria-invalid","true");else inp.removeAttribute("aria-invalid");if(!ok)return;a.funding.set=a.funding.set||{};a.funding.set[pid]=kind==="pct"?{pct:val}:{amount:r2(val)};queueCfg()},"ac_fv_"+sid+"_"+i,true);
        inp.placeholder=kind==="pct"?"0":"0.00";row.appendChild(labeled(kind==="pct"?"Percentage of "+possessive(nm)+" pay (%)":"Amount a month (\u00a3)",inp))}
      body.appendChild(row)});
    var pr=fundingProblem(cfg,a.id);if(pr){var pb=el("div","banner bad",pr+(/pay twice\.$/.test(pr)?" Untick them, or change where their account's money goes.":""));pb.id="ac_fprob_"+sid;body.appendChild(pb)}}
  return det}
/* 2.12: whether "Delete account" closes the account from this pay month instead: with months saved before it, when
   something has ever used the account, and no change of style starts this month or later. */
function closesInstead(id){var k=thisMonth();if(!datesEdits()||arr(cfg.flows).some(function(e){return e.from>=k}))return false;return accountEverUsed(id)}
/* Whether anything has ever used an account: an item (now, earlier or deleted), someone's pay, another account's
   leftover (now or in an earlier arrangement), a one-off, or a tick in a saved month. */
function accountEverUsed(id){if(usedAccounts(cfg,oneOffAccounts())[id])return true;
  if(cfg.accounts.some(function(x){return x.leftoverTo===id}))return true;
  if(arr(cfg.flows).some(function(e){var w=e.was;return Object.keys(w.pay).some(function(p){return w.pay[p]===id})||Object.keys(w.accounts).some(function(x){return w.accounts[x].leftoverTo===id})}))return true;
  return Object.keys(months).some(function(k){var d=months[k];return d&&isObj(d.done)&&Object.keys(d.done).some(function(s){return s.split(/[:>]/).indexOf(id)>0})})}
function deleteAccount(id,target){
  var a=accById(cfg,id);if(!a||!accById(cfg,target)||target===id||accById(cfg,target).closedFrom)return;
  // 2.12: with months saved before this pay month (and no change of style still to come), the account closes from this
  // pay month instead: earlier months keep it, with its bills and the pay that went into it.
  var k=thisMonth();if(closesInstead(id)){var up0=parentId(cfg,id),next={accounts:[],pay:{}};
    cfg.accounts.forEach(function(x){if(x.closedFrom||x.id===id)return;var n={id:x.id,name:x.name,colour:x.colour,leftoverTo:x.leftoverTo===id?(up0&&up0!==x.id?up0:null):parentId(cfg,x.id)};if(x.funding)n.funding=clone(x.funding);next.accounts.push(n)});
    cfg.people.forEach(function(p){next.pay[p.id]=p.payAccount===id?target:p.payAccount});var mv={};mv[id]=target;
    cfg=applyChange(cfg,k,next,mv,oneOffAccounts());
    Object.keys(months).forEach(function(m){if(m>=k)arr(months[m]&&months[m].oneOffs).forEach(function(o){if(o&&o.account===id)o.account=target})});
    if(cur&&monthKey>=k)arr(cur.oneOffs).forEach(function(o){if(o.account===id)o.account=target});
    saveMonths();delAcct=null;cfgNow();renderPayInputs();keepScroll(renderSettings);toast((a.name||"Account")+" closed from "+mLabel(k)+". Earlier months keep it.");return}
  cfg.bills.forEach(function(b){if(b.account===id)b.account=target});cfg.income.forEach(function(x){if(x.account===id)x.account=target});
  cfg.budgets.forEach(function(x){if(x.account===id)x.account=target});cfg.savings.forEach(function(x){if(x.fromAccount===id)x.fromAccount=target});
  cfg.people.forEach(function(x){if(x.payAccount===id)x.payAccount=target});
  // 2.12: earlier values and deleted items that name it go to the same account (the account is gone from every month).
  ITEM_LISTS.forEach(function(l){allItems(cfg,l[0]).forEach(function(x){if(x[l[1]]===id)x[l[1]]=target;arr(x.was).forEach(function(w){if(w&&w[l[1]]===id)w[l[1]]=target})})});
  // accounts that sent their leftover here now send it where this one did
  var up=parentId(cfg,id);cfg.accounts.forEach(function(x){if(x.leftoverTo===id)x.leftoverTo=up&&up!==x.id?up:null});
  cfg.accounts=cfg.accounts.filter(function(x){return x.id!==id});
  Object.keys(months).forEach(function(k){arr(months[k]&&months[k].oneOffs).forEach(function(o){if(o&&o.account===id)o.account=target})});
  if(cur)arr(cur.oneOffs).forEach(function(o){if(o.account===id)o.account=target});
  saveMonths();delAcct=null;cfgNow();keepScroll(renderSettings);toast((a.name||"Account")+" deleted")}
/* ---------- the rough figure after setup (2.14, docs/onboarding.md 5.6 to 5.8) ----------
   An account's rough figure (cfg.estimates) is shown as what's listed and what's "not listed yet": on the Pay tab under
   the transfer into the account, on its card, in Bills by account, and in Settings › Bills, which has Paste a list,
   Change the figure and That's all of them for it. Questions come once, at the moment they matter: when the listed bills
   go past the figure ("Is that all of them?", estimateJustPassed), and when a bill inside it is deleted ("Lower Joint's
   figure by £30 too?", estimateDeleteOffer). Every change is a dated edit once months are saved before this pay month
   (setEstimate, endEstimates, as bills are). The session's state, never saved: figEdit (the account whose figure is being
   typed), figAsk (the account to ask "Is that all of them?" about), figOffer ({account, amount, figure, name}: the delete
   offer) and figMsg ({account, text, change}: the last thing said, with a Change link when change is true). */
var figEdit=null,figAsk=null,figOffer=null,figMsg=null;
function figEst(id){return arr(cfg.estimates).filter(function(e){return e.account===id})[0]||null}
/* The questions appear in Settings › Bills while focus is elsewhere (on the next bill, say): said in a live region too,
   once the Undo bar has had its say. */
var figLiveT=null;function figSay(t){var r=$("figLive");if(!r){r=el("div","sr");r.id="figLive";r.setAttribute("aria-live","polite");document.body.appendChild(r)}
  clearTimeout(figLiveT);r.textContent="";figLiveT=setTimeout(function(){r.textContent=t},250)}
/* The settings' figures and bills as they are now, to compare after a change (what estimateParts reads). */
function figSnap(){return {estimates:clone(arr(cfg.estimates)),bills:cfg.bills.map(function(b){return {id:b.id,account:b.account,amount:b.amount,months:arr(b.months).slice()}})}}
/* New figures from setEstimate or endEstimates (which return new settings): only the figures and endings are taken, so
   everything else on screen keeps pointing at the settings it has. */
function applyFig(next){["estimates","ended"].forEach(function(k){if(next[k]===undefined)delete cfg[k];else cfg[k]=next[k]})}
/* After the bills changed (snap: figSnap() from before): an account whose listed bills have just gone past its figure is
   the one to ask about. Its figure lines are redrawn in place, so focus stays where it is. Returns that account, or null. */
function figAfter(snap){var ask=null;cfg.accounts.forEach(function(a){if(estimateJustPassed(snap,cfg,a.id))ask=a.id});if(ask){figAsk=ask;figOffer=null;figMsg=null;var p=estimateParts(cfg,ask);
    figSay("Your bills now add up to "+fmt(p.listed)+", more than the "+fmt(p.figure)+" you put for "+accName(ask)+". Is that all of them? The question is under "+accName(ask)+".")}
  cfg.accounts.forEach(function(a){refreshFig(a.id)});return ask}
/* "Energy now £140. Joint's transfer doesn't change: it comes out of the £380 not listed yet." when a bill inside a figure
   goes up and the bills are still within it (5.7). "" otherwise. */
function figRise(b,old,snap){var p0=estimateParts(snap,b.account),p1=estimateParts(cfg,b.account),now=num(b.amount);
  return now>old+0.004&&inFigure(b)&&p0.has&&p0.unlisted>0.004&&!p1.passed?(b.name||"Bill")+" now "+fmt(now)+". "+possessive(accName(b.account))+" transfer doesn't change: it comes out of the "+fmt(p0.unlisted)+" not listed yet.":""}
/* "Joint: £1,120.00 listed · £380.00 not listed yet (your figure £1,500.00)", with a thin bar (what's listed, of the figure). */
function figWords(id,p){var n=accName(id);return n+": "+fmt(p.listed)+" listed"+(p.passed?", more than your figure of "+fmt(p.figure):" · "+fmt(p.unlisted)+" not listed yet (your figure "+fmt(p.figure)+")")}
function figLine(id,p,domId){var d=el("div","figsum");var t=el("p","small",figWords(id,p));if(domId){d.id=domId;t.id=domId+"_t"}d.appendChild(t);
  var bar=el("div","figbar");bar.setAttribute("aria-hidden","true");var i=el("i");i.style.width=Math.max(2,Math.min(100,p.figure>0?p.listed/p.figure*100:100))+"%";bar.appendChild(i);d.appendChild(bar);return d}
/* The good news when a figure ends (5.7), from working the month out before and after (estimateEndEffect), since shares
   split the change: "All of Joint's bills are in. Your transfers for Joint are exact now. Alex's share goes down by £100
   a month and Sam's by £100." */
function figGoodNews(id,e){var nm=accName(id),t="All of "+possessive(nm)+" bills are in. Your transfers for "+nm+" are exact now.";
  var down=e.people.filter(function(p){return p.change<-0.004});
  if(down.length)return t+" "+listAnd(down.map(function(p,i){return possessive(p.name)+(i?" by "+fmt(-p.change):" share goes down by "+fmt(-p.change)+" a month")}))+".";
  var into=e.steps.filter(function(s){return s.to===id&&s.change<-0.004}),sum=into.reduce(function(x,s){return x+s.change},0);
  if(into.length)return t+" What goes into "+nm+" goes down by "+fmt(-sum)+" a month.";
  return e.float>0.004?t+" That's "+fmt(e.float)+" more left over in "+mLabel(thisMonth())+".":t}
function figSave(){var sc0=syncCount;saveCfg(true);if(syncCount!==sc0)return false;afterCfgChange();return true}
/* A figure set from this pay month (setEstimate), or ended ("That's all of them", with Undo and the good news). */
function figSet(id,v,msg){applyFig(setEstimate(cfg,id,v,thisMonth(),datesEdits()));figEdit=null;figAsk=null;figOffer=null;figMsg=msg?{account:id,text:msg,change:true}:null;if(!figSave())return;keepScroll(renderBillsList)}
/* The figures and endings as they are now, to put back (Undo). */
function figBefore(){return {estimates:cfg.estimates===undefined?undefined:clone(cfg.estimates),ended:cfg.ended===undefined?undefined:clone(cfg.ended)}}
/* also: an Undo to run with this one (a bill's delete, when the figure ends because of it); focusSel: where Undo goes then. */
function figEnd(id,also,focusSel){var nm=accName(id),k=thisMonth(),before=figBefore(),eff=estimateEndEffect(cfg,months,k,id);
  applyFig(endEstimates(cfg,id,k,datesEdits()));figEdit=null;figAsk=null;figOffer=null;figMsg={account:id,text:figGoodNews(id,eff)};if(!figSave())return;keepScroll(renderBillsList);
  var m=$("bf_"+safeId(id)+"_msg");if(m){m.tabIndex=-1;try{m.focus({preventScroll:true})}catch(x){}}
  offerUndo(possessive(nm)+" rough figure ended"+(datesEdits()?" from "+mLabel(k):""),function(){applyFig(before);figMsg=null;if(also)also();else{figSave();rerender()}},also&&focusSel?focusSel:"#bf_"+safeId(id)+"_end")}
/* What Settings › Bills shows for account id (in place of its "bf_" block): the line and bar, what adding bills does, the
   questions, the editor and the buttons. Empty and hidden for an account with nothing to show. */
function figBlock(id){var sid=safeId(id),d=el("div","figbox"),p=estimateParts(cfg,id),nm=accName(id),pre="bf_"+sid;d.id=pre;d.setAttribute("role","group");d.setAttribute("aria-label","Rough figure for "+possessive(nm)+" bills");
  function btn(t,cls,bid,on,label){var b=el("button",cls,t);b.type="button";b.id=pre+"_"+bid;if(label)b.setAttribute("aria-label",label);b.addEventListener("click",on);return b}
  if(figMsg&&figMsg.account===id){var m=el("div","banner good col");m.id=pre+"_msg";m.setAttribute("role","status");m.appendChild(el("div",null,figMsg.text));
    if(figMsg.change&&p.has){var mr=el("div","btnrow");mr.appendChild(btn("Change","linkbtn","msgc",function(){figMsg=null;figEdit=id;refreshFig(id);focusOn("#"+pre+"_amt")},"Change "+possessive(nm)+" figure"));m.appendChild(mr)}d.appendChild(m)}
  if(figOffer&&figOffer.account===id){var o=el("div","banner col"),ot=el("div",null,figOffer.name+" deleted. Lower "+possessive(nm)+" figure by "+fmt(figOffer.amount)+" too?");o.id=pre+"_offer";ot.id=pre+"_offer_t";
    o.setAttribute("role","group");o.setAttribute("aria-labelledby",ot.id);o.appendChild(ot);var orow=el("div","btnrow");
    // The delete's Undo would put the bill back but leave the figure lowered: "Lower it" offers one Undo for both.
    orow.appendChild(btn("Lower it","btn","lower",function(){var f=figOffer,v=r2(f.figure-f.amount),del=$("undoBar").hidden?null:undoFn,back=figBefore(),bsel=f.bill?"#bill_"+safeId(f.bill)+" > button":null;
      if(v<=0){figEnd(id,del,bsel);return}figSet(id,v,possessive(nm)+" figure is now "+fmt(v)+".");focusOn("#"+pre+"_msgc");
      offerUndo(f.name+" deleted and "+possessive(nm)+" figure lowered to "+fmt(v),function(){applyFig(back);figMsg=null;if(del)del();else{figSave();rerender()}},del&&bsel?bsel:"#"+pre+"_change")}));
    orow.appendChild(btn("Keep it","btn ghost","keep",function(){figOffer=null;refreshFig(id);focusOn("#"+pre+"_change")||focusOn("#billAdd_"+sid)}));o.appendChild(orow);d.appendChild(o)}
  if(p.has){d.appendChild(figLine(id,p,pre+"_line"));
    if(p.passed&&figAsk===id){var q=el("div","banner col"),qt=el("div",null,"Your bills now add up to "+fmt(p.listed)+", more than the "+fmt(p.figure)+" you put. Is that all of them?");q.id=pre+"_q";qt.id=pre+"_q_t";
      q.setAttribute("role","group");q.setAttribute("aria-labelledby",qt.id);q.appendChild(qt);var qr=el("div","btnrow");
      qr.appendChild(btn("That's all of them","btn","qall",function(){figEnd(id)}));
      qr.appendChild(btn("There are more","btn ghost","qmore",function(){var v=estimateRoundUp(p.listed);figSet(id,v,possessive(nm)+" figure is now "+fmt(v)+".");focusOn("#"+pre+"_msgc")}));q.appendChild(qr);d.appendChild(q)}
    if(!p.passed)d.appendChild(el("p","small muted","Adding bills won't change your transfers until they go past your figure."));
    // A change of style since can make this an account a figure isn't offered on (5.9): it still counts.
    var why=estimateBlock(cfg,id);
    if(why==="board")d.appendChild(el("p","small","Their own money isn't part of the household's figures."));
    else if(why)d.appendChild(el("p","small","With the way you share costs now, list your own bills here so the shares are fair. The figure still counts until you tap That's all of them."));
    d.appendChild(el("p","small muted","If "+nm+" ran short before payday, the figure may be low."))}
  if(figEdit===id){var ed=el("div","figedit"),inp=textIn(p.has?money2(p.figure):"",function(){},pre+"_amt",true),msg=el("div","hint");inp.placeholder="0.00";msg.id=pre+"_amsg";msg.setAttribute("aria-live","polite");
    ed.appendChild(labeled("Rough figure for "+possessive(nm)+" bills each month (£)",inp));
    if(!p.has)ed.appendChild(el("p","small muted","Count what leaves "+nm+" by itself: direct debits, standing orders and subscriptions. Count Council Tax as monthly, and list bills that come only a few times a year. Round up if you're unsure."));
    ed.appendChild(msg);var er=el("div","btnrow");
    var save=function(){var r=parseMoney(inp.value,false),listed=estimateParts({bills:cfg.bills,estimates:[{account:id,amount:0}]},id).listed;
      if(r.empty||r.invalid||!(r.value>0)){msg.className="hint err";msg.textContent="Type an amount a month, like 1500.00.";inp.focus();return}
      if(!p.has&&r.value<=listed){msg.className="hint err";msg.textContent="The bills listed for "+nm+" already come to "+fmt(listed)+", so a figure that size wouldn't add anything.";inp.focus();return}
      figSet(id,r2(r.value),null);toast(possessive(nm)+" figure is now "+fmt(r2(r.value))+".");focusOn("#"+pre+"_change")};
    inp.addEventListener("keydown",function(e){if(e.key==="Enter"){e.preventDefault();save()}});
    er.appendChild(btn("Save","btn","save",save));
    er.appendChild(btn("Cancel","btn ghost","cancel",function(){figEdit=null;refreshFig(id);focusOn(p.has?"#"+pre+"_change":"#"+pre+"_new")}));ed.appendChild(er);d.appendChild(ed)}
  if(p.has){var e=figEst(id);if(e)d.appendChild(datedNote("estimates",e,pre+"_d",function(){refreshFig(id);afterCfgChange()},pre+"_change"));
    var br=el("div","btnrow figbtns");
    br.appendChild(btn("Paste a list","btn ghost","paste",function(){pasteSt={text:"",res:null,rows:[],acct:id};keepScroll(renderBillsSet);reveal($("pl"));focusOn("#pl_text")},"Paste a list of "+possessive(nm)+" bills"));
    if(figEdit!==id)br.appendChild(btn("Change the figure","btn ghost","change",function(){figEdit=id;figMsg=null;refreshFig(id);focusOn("#"+pre+"_amt")},"Change the figure for "+possessive(nm)+" bills"));
    br.appendChild(btn("That's all of them","btn ghost","end",function(){figEnd(id)},"That's all of "+possessive(nm)+" bills"));d.appendChild(br)}
  if(!d.firstChild)d.hidden=true;return d}
function refreshFig(id){var old=$("bf_"+safeId(id));if(old)old.parentNode.replaceChild(figBlock(id),old)}
/* Settings › Bills › Paste a list (next to Quick add, and from an account's figure). */
var pasteSt=null;
function settingsPaste(){var accts=accountOptions(cfg,cfg.accounts.filter(function(a){return a.closedFrom}).map(function(a){return a.id}));
  return pasteBox(pasteSt,{idp:"pl",accts:accts,def:pasteSt.acct&&accById(cfg,pasteSt.acct)?pasteSt.acct:defaultBillAccount(cfg),existing:cfg.bills,heading:"h3",
    redraw:function(f){keepScroll(renderBillsSet);focusOn("#"+f)},onClose:function(){pasteSt=null;keepScroll(renderBillsSet);focusOn("#pasteBtn")},
    onAdd:function(list){var snap=figSnap();list.forEach(function(x){var b={id:uid("b"),name:x.name,amount:x.amount,account:x.account,months:x.months};applyCategorySuggestion(b);cfg.bills.push(startsNow(b))});
      pasteSt=null;if(!figSave())return;figAfter(snap);keepScroll(renderBillsSet);updateBadge();toast("Added "+plural(list.length,"bill"));focusOn("#pasteBtn")}})}
/* bills */
var billQuery="",billFilter="",quickRows=null;
function renderBillsSet(){
  var box=clear($("setBills")),tools=el("div","billtools");
  var q=el("input","inp");q.type="search";q.id="billSearch";q.placeholder="Search bills";q.autocomplete="off";q.setAttribute("aria-label","Search bills by name or category");q.value=billQuery;
  q.addEventListener("input",function(){billQuery=q.value;keepScroll(renderBillsList)});tools.appendChild(q);
  var qa=el("button","btn ghost",quickRows?"Close quick add":"Quick add");qa.id="quickAddBtn";qa.setAttribute("aria-expanded",quickRows?"true":"false");
  qa.addEventListener("click",function(){quickRows=quickRows?null:newQuickRows(3,defaultBillAccount(cfg));keepScroll(renderBillsSet);if(quickRows){reveal($("qa_box"));var f=$("qa_n_0");if(f)f.focus()}});
  tools.appendChild(qa);
  // 2.14: Paste a list, next to Quick add (5.4).
  var pb=el("button","btn ghost",pasteSt?"Close the list":"Paste a list");pb.id="pasteBtn";pb.type="button";pb.setAttribute("aria-expanded",pasteSt?"true":"false");
  pb.addEventListener("click",function(){pasteSt=pasteSt?null:{text:"",res:null,rows:[],acct:null};keepScroll(renderBillsSet);if(pasteSt){reveal($("pl"));focusOn("#pl_text")}else focusOn("#pasteBtn")});
  tools.appendChild(pb);box.appendChild(tools);
  var fc=el("div","fchips"),nm=el("button","fchip","Not monthly");nm.id="billNotMonthly";nm.type="button";nm.setAttribute("aria-pressed",billFilter==="notmonthly"?"true":"false");
  nm.addEventListener("click",function(){billFilter=billFilter?"":"notmonthly";nm.setAttribute("aria-pressed",billFilter?"true":"false");keepScroll(renderBillsList)});fc.appendChild(nm);box.appendChild(fc);
  if(quickRows)box.appendChild(quickAddBox(quickRows,accountOptions(cfg),"qa",{title:"Quick add bills",intro:"One row per bill. They're added as paid every month; open a bill afterwards to change its months or renewal date.",
    addLabel:"Add these",onAdd:function(list){var snap=figSnap();list.forEach(function(nb){cfg.bills.push(startsNow(nb))});quickRows=null;saveCfg(true);afterCfgChange();figAfter(snap);keepScroll(renderBillsSet);updateBadge();toast("Added "+plural(list.length,"bill"))}}));
  if(pasteSt)box.appendChild(settingsPaste());
  var list=el("div");list.id="billList";list.className="tab";list.style.gap="10px";box.appendChild(list);renderBillsList();
}
function billMatches(b,q){if(billFilter==="notmonthly"&&perYear(b)>=12)return false;return !q||String(b.name||"").toLowerCase().indexOf(q)>=0||(b.category&&categoryName(b.category).toLowerCase().indexOf(q)>=0)}
function renderBillsList(){
  var box=$("billList");if(!box)return;clear(box);var q=billQuery.trim().toLowerCase(),shown=0,narrowed=!!(q||billFilter);
  cfg.accounts.forEach(function(a){var bills=cfg.bills.filter(function(b){return b.account===a.id&&billMatches(b,q)});if(narrowed&&!bills.length)return;
    var h=el("div","accthead");h.appendChild(acctTag(a.id));if(bills.length)h.appendChild(el("span","num small muted",fmt(bills.reduce(function(t,b){return t+monthlyEquivalent(b)},0))+" a month"));box.appendChild(h);
    // 2.14: the account's rough figure, if it has one (figBlock).
    if(!narrowed)box.appendChild(figBlock(a.id));
    bills.forEach(function(b){shown++;box.appendChild(billEditor(b))});
    if(!narrowed){var add=el("button","linkbtn","+ Add a bill paid from "+(a.name||"this account"));add.id="billAdd_"+safeId(a.id);add.addEventListener("click",function(){var nb=startsNow({id:uid("b"),name:"New bill",amount:0,account:a.id,months:[]});cfg.bills.push(nb);openBill=nb.id;cfgNow();keepScroll(renderBillsList);reveal($("bill_"+safeId(nb.id)));var f=$("bn_"+nb.id);if(f){f.focus();f.select()}});box.appendChild(add);
      // 2.14: a rough figure for the rest of an account's bills can be added here too (not on a closed account, or where 5.9 says no).
      if(!a.closedFrom&&!estimateParts(cfg,a.id).has&&figEdit!==a.id&&!estimateBlock(cfg,a.id)){var nf=el("button","linkbtn small figadd","Not sure you've got them all? Add a rough figure");nf.type="button";nf.id="bf_"+safeId(a.id)+"_new";
        nf.setAttribute("aria-label","Not sure you've got all of "+possessive(a.name||"this account")+" bills? Add a rough figure for the rest");
        nf.addEventListener("click",function(){figEdit=a.id;figMsg=null;refreshFig(a.id);nf.hidden=true;focusOn("#bf_"+safeId(a.id)+"_amt")});box.appendChild(nf)}}});
  var orphans=cfg.bills.filter(function(b){return !accById(cfg,b.account)&&billMatches(b,q)});
  if(orphans.length){box.appendChild(el("div","accthead","Not linked to an account"));orphans.forEach(function(b){shown++;box.appendChild(billEditor(b))})}
  if(narrowed&&!shown)box.appendChild(el("div","empty",q?"No bills match “"+billQuery.trim()+"”"+(billFilter?" among the bills that aren't monthly.":"."):"Every bill is paid monthly."));
}
function billWhen(b){return whenText(b)+(b.category?" · "+categoryName(b.category):"")+(validDate(b.renews)?" · renews "+fmtDate(b.renews):"")}
function costText(b){return perYear(b)===12?"":fmt(annualCost(b))+" a year · "+fmt(monthlyEquivalent(b))+" a month equivalent"}
function billEditor(b){
  var wrap=el("div","bill"),head=el("button"),sid=safeId(b.id);wrap.id="bill_"+sid;head.setAttribute("aria-expanded",openBill===b.id?"true":"false");
  var hn=el("span",null,b.name),hv=el("span","num",fmt(num(b.amount))),hw=el("span","when",billWhen(b));head.appendChild(hn);head.appendChild(hv);head.appendChild(hw);
  // 2.13: focus survives the redraw: into the name box when opened from the keyboard (a tap would pop up the phone's
  // keyboard, so a tap keeps it on the bill), back on the bill when closed.
  head.addEventListener("click",function(e){openBill=openBill===b.id?null:b.id;arm=null;keepScroll(renderBillsList);if(openBill===b.id)reveal($("bill_"+sid));
    var f=openBill===b.id&&e.detail===0?$("bn_"+b.id):document.querySelector("#bill_"+sid+" > button");if(f)try{f.focus({preventScroll:true})}catch(x){}});wrap.appendChild(head);
  if(openBill!==b.id)return wrap;
  var ed=el("div","ed"),g=el("div","grid2"),cost=el("div","small muted",costText(b)),catSel,catHint,before=itemSnap("bills",b),note;cost.id="bc_"+b.id;
  // Escape closes the bill, back on its name.
  ed.addEventListener("keydown",function(e){if(e.key!=="Escape"||e.defaultPrevented)return;e.preventDefault();openBill=null;arm=null;keepScroll(renderBillsList);var h=document.querySelector("#bill_"+sid+" > button");if(h)try{h.focus({preventScroll:true})}catch(x){}});
  function edited(){dated("bills",b,before);if(note)fillDatedNote(note,"bills",b,rerenderBill)}
  function rerenderBill(){keepScroll(renderBillsList)}
  function refreshCat(){catSel.value=b.category||"";catHint.textContent=b.categoryAuto?"Suggested from the name. Change it if it's wrong.":"";hw.textContent=billWhen(b);
    var ls=$("bl_"+b.id);if(ls&&b.lead==null&&!validDate(b.renews))ls.value=String(defaultLead(b))}
  g.appendChild(labeled("Name",textIn(b.name,function(v){b.name=v;hn.textContent=v;applyCategorySuggestion(b);refreshCat();queueCfg()},"bn_"+b.id)));
  var amtIn=textIn(money2(b.amount),function(v){var r=parseMoney(v,false);if(r.invalid)return;b.amount=r.value||0;hv.textContent=fmt(b.amount);cost.textContent=costText(b);edited();queueCfg();refreshFig(b.account)},"ba_"+b.id,true);
  // 2.14: once the amount is in, a bill inside a rough figure that went up says the transfer doesn't change, and listed bills
  // that have just gone past the figure ask "Is that all of them?" (figAfter).
  var amt0=null;amtIn.addEventListener("focus",function(){amt0={amount:num(b.amount),snap:figSnap()}});
  amtIn.addEventListener("change",function(){var a0=amt0;amt0=null;if(!a0||Math.abs(num(b.amount)-a0.amount)<0.005)return;clearTimeout(cfgT);cfgT=null;if(!figSave())return;
    if(figAfter(a0.snap))return;var t=figRise(b,a0.amount,a0.snap);if(t)toast(t)});
  g.appendChild(labeled("Amount each payment (£)",amtIn));ed.appendChild(g);
  ed.appendChild(cost);note=datedNote("bills",b,"bd_"+b.id,rerenderBill,"ba_"+b.id);ed.appendChild(note);
  var g2=el("div","grid2");
  g2.appendChild(labeled("Paid from",selectIn(accountOptions(cfg),b.account,function(v){var snap=figSnap();b.account=v;edited();cfgNow();figAfter(snap);keepScroll(renderBillsList);reveal($("bill_"+sid))},"bs_"+b.id)));
  catSel=selectIn([["","Not categorised"]].concat(CATEGORIES),b.category||"",function(v){setCategory(b,v,thisMonth());refreshCat();cfgNow();var sv=$("bsv_"+b.id);if(sv)sv.checked=!!b.savings},"bcat_"+b.id);
  g2.appendChild(labeled("Category",catSel));ed.appendChild(g2);
  catHint=el("div","small muted");catHint.id="bch_"+b.id;ed.appendChild(catHint);
  // A native date input: shown in the phone's format, read as its ISO value (see oneOffFields).
  var rg=el("div","grid2"),rd=el("input","inp");rd.type="date";rd.id="br_"+b.id;rd.value=validDate(b.renews)?b.renews:"";
  // The first time a renewal date is set, "Remind me" starts at the bill's default (defaultLead: a week for a monthly
  // subscription or membership, otherwise a month), unless one was already chosen. A stored choice is never changed.
  rd.addEventListener("change",function(){var first=!validDate(b.renews);if(rd.value)b.renews=rd.value;else delete b.renews;
    if(first&&validDate(b.renews)&&b.lead==null){b.lead=defaultLead(b);var ls=$("bl_"+b.id);if(ls)ls.value=String(b.lead)}hw.textContent=billWhen(b);cfgNow();updateBadge()});
  rg.appendChild(labeled("Renews or contract ends",rd));
  // A bill with a renewal date and no choice made reminds a month before (as always); one without a date shows the
  // default it will get.
  rg.appendChild(labeled("Remind me",selectIn(LEADS,String(b.lead!=null?b.lead:validDate(b.renews)?30:defaultLead(b)),function(v){b.lead=Number(v);cfgNow();updateBadge()},"bl_"+b.id)));ed.appendChild(rg);
  var mw=el("div");mw.appendChild(el("span","lbl","Months it's paid"));var mg=el("div","months");
  for(var mi=1;mi<=12;mi++){(function(mm){var on=b.months.length>0&&b.months.length<12&&b.months.indexOf(mm)>=0;var bt=el("button","mbtn",MS[mm-1]);bt.setAttribute("aria-pressed",on||!b.months.length||b.months.length>=12?"true":"false");bt.setAttribute("aria-label",MN[mm-1]);
    bt.addEventListener("click",function(){var cm=(!b.months.length||b.months.length>=12)?[1,2,3,4,5,6,7,8,9,10,11,12]:b.months.slice();var ix=cm.indexOf(mm);if(ix>=0)cm.splice(ix,1);else cm.push(mm);
      if(!cm.length){toast("A bill needs at least one month");return}var snap=figSnap();b.months=cm.length>=12?[]:cm.sort(function(x,y){return x-y});edited();cfgNow();figAfter(snap);keepScroll(renderBillsList)});mg.appendChild(bt)})(mi)}
  mw.appendChild(mg);var ev=el("button","linkbtn","Every month");ev.addEventListener("click",function(){var snap=figSnap();b.months=[];edited();cfgNow();figAfter(snap);keepScroll(renderBillsList)});mw.appendChild(ev);ed.appendChild(mw);
  ed.appendChild(checkIn("This is savings, not a bill (for example, a Junior ISA)",b.savings,function(v){setSavingsFlag(b,v,thisMonth());refreshCat();cfgNow()},"bsv_"+b.id));
  var br=el("div","btnrow");br.appendChild(confirmBtn("bill"+b.id,"Delete bill",function(){openBill=null;var to=nextFocus(wrap,".bill","#billList",function(n){return "#"+n.id+" > button"},"#billAdd_"+safeId(b.account));
    // 2.14: deleting a bill inside a rough figure puts it back into "not listed yet": offer to lower the figure too (5.7).
    var offer=estimateDeleteOffer(cfg,b);if(offer){figOffer={account:offer.account,amount:offer.amount,figure:offer.figure,name:b.name||"Bill",bill:b.id};figAsk=null;figMsg=null}
    removeItem("bills",b,(b.name||"Bill")+" deleted",function(){if(figOffer&&cfg.bills.some(function(x){return x.id===b.id}))figOffer=null;saveCfg(true);afterCfgChange();updateBadge();rerender()},"#bill_"+sid+" > button");focusOn(to);
    if(offer&&figOffer)figSay("Lower "+possessive(accName(offer.account))+" figure by "+fmt(offer.amount)+" too? Lower it or Keep it, under "+accName(offer.account)+".")}));ed.appendChild(br);
  wrap.appendChild(ed);refreshCat();return wrap;
}
/* Quick add: a compact table for entering several bills at once (Settings › Bills). */
function newQuickRows(n,acct){var out=[];for(var i=0;i<n;i++)out.push({name:"",amount:"",account:acct||""});return out}
function rowUsed(r){return String(r.name||"").trim()!==""||String(r.amount||"").trim()!==""}
/* Quick add's bills: all of them, or none while any row has a problem. */
function readQuickRows(rows,ids){rows.forEach(function(r){if(ids&&ids.indexOf(r.account)<0)r.account=ids[0]||""});var res=readRows(rows);
  var bills=res.items.map(function(x){var b={id:uid("b"),name:x.name,amount:x.amount,account:x.r.account,months:x.months};applyCategorySuggestion(b);return b});
  return {bills:res.errors.length?[]:bills,errors:res.errors}}
/* One row of a quick list: name and amount, then as asked the account (o.acct: [[id, name]…]), how often a bill is paid
   (o.freq, setup only) and Remove. Shared by Settings › Bills › Quick add and setup's bills, budgets and savings.
   o: {id(field) → the element id, noun and n ("Bill", 1) for labels, group (a label for the whole row), namePh,
   acctLabel, acctShown (a visible label instead of aria-label), onEnter, onRemove (no Remove button without it), onFreq,
   onName and onAmount (as they're typed)}. */
var FREQS=[["monthly","Every month"],["yearly","Once a year"],["some","Some months"]];
function quickRow(r,o){var row=el("div","qa-row"),N=o.noun+" "+o.n;
  if(o.group){row.setAttribute("role","group");row.setAttribute("aria-label",o.group)}
  var n=el("input","inp");n.id=o.id("n");n.value=r.name;n.placeholder=o.namePh||o.noun+" name";n.autocomplete="off";n.setAttribute("aria-label",N+" name");n.addEventListener("input",function(){r.name=n.value;if(o.onName)o.onName()});
  var mb=el("input","inp num");mb.id=o.id("a");mb.value=r.amount;mb.placeholder="£";mb.inputMode="decimal";mb.autocomplete="off";mb.setAttribute("aria-label",N+" amount in pounds");mb.setAttribute("enterkeyhint","next");
  mb.addEventListener("input",function(){r.amount=mb.value;if(o.onAmount)o.onAmount()});mb.addEventListener("keydown",function(e){if(e.key==="Enter"){e.preventDefault();o.onEnter()}});
  row.appendChild(n);row.appendChild(mb);
  if(o.acct){var sel=selectIn(o.acct,r.account,function(v){r.account=v;if(o.onAcct)o.onAcct(v)},o.id("s"));
    if(o.acctShown){var al=labeled(o.acctLabel,sel);if(o.freq)al.className="qa-full";row.appendChild(al)}else{sel.setAttribute("aria-label",N+" "+o.acctLabel.toLowerCase());row.appendChild(sel)}}
  if(o.freq)row.appendChild(labeled("How often",selectIn(FREQS,r.freq||"monthly",function(v){r.freq=v;o.onFreq()},o.id("f"))));
  if(o.onRemove){var x=el("button","btn ghost","Remove");x.setAttribute("aria-label","Remove "+N.toLowerCase());x.addEventListener("click",o.onRemove);row.appendChild(x)}
  if(o.freq&&r.freq==="yearly"){var mo=[["","Choose a month"]].concat(MN.map(function(m,i){return [String(i+1),m]}));
    var mf=labeled("Paid in",selectIn(mo,r.month!=null?String(r.month):"",function(v){r.month=v},o.id("m")));mf.className="qa-full";row.appendChild(mf)}
  if(o.freq&&r.freq==="some"){var mw=el("div","qa-full"),gid=o.id("m");mw.setAttribute("role","group");mw.setAttribute("aria-labelledby",gid+"_l");mw.id=gid;
    var ml=el("span","lbl","Months it's paid");ml.id=gid+"_l";mw.appendChild(ml);var mg=el("div","months");if(!Array.isArray(r.picked))r.picked=[];
    for(var mi=1;mi<=12;mi++)(function(mm){var bt=el("button","mbtn",MS[mm-1]);bt.type="button";bt.id=gid+"_"+mm;bt.setAttribute("aria-label",MN[mm-1]);bt.setAttribute("aria-pressed",r.picked.indexOf(mm)>=0?"true":"false");
      bt.addEventListener("click",function(){var ix=r.picked.indexOf(mm);if(ix>=0)r.picked.splice(ix,1);else r.picked.push(mm);bt.setAttribute("aria-pressed",ix>=0?"false":"true")});mg.appendChild(bt)})(mi);
    mw.appendChild(mg);row.appendChild(mw)}
  return row}
function quickAddBox(rows,acctOpts,idp,o){
  var box=el("div","box");box.id=idp+"_box";if(o.title){var h=el("h3",null,o.title);box.appendChild(h)}
  if(o.intro)box.appendChild(el("div","small muted",o.intro));
  var ids=acctOpts.map(function(a){return a[0]}),list=el("div","qa-rows"),msg=el("div","hint");msg.id=idp+"_msg";msg.setAttribute("aria-live","polite");
  rows.forEach(function(r){if(ids.indexOf(r.account)<0)r.account=ids[0]||""});
  var hdr=el("div","qa-head");hdr.setAttribute("aria-hidden","true");hdr.appendChild(el("span",null,"Bill name"));hdr.appendChild(el("span",null,"Amount (£)"));box.appendChild(hdr);
  function addRow(focus){var last=rows[rows.length-1];rows.push({name:"",amount:"",account:last?last.account:(acctOpts[0]||[""])[0]});draw();if(focus){var f=$(idp+"_n_"+(rows.length-1));if(f){f.focus();reveal(f.closest(".qa-row"))}}}
  function draw(){clear(list);rows.forEach(function(r,i){list.appendChild(quickRow(r,{id:function(f){return idp+"_"+f+"_"+i},noun:"Bill",n:i+1,acct:acctOpts,acctLabel:"Paid from",
    onEnter:function(){if(i===rows.length-1)addRow(true);else{var f=$(idp+"_n_"+(i+1));if(f)f.focus()}},
    onRemove:function(){rows.splice(i,1);if(!rows.length)rows.push({name:"",amount:"",account:r.account});draw();var f=$(idp+"_n_"+Math.min(i,rows.length-1));if(f)f.focus()}}))})}
  draw();box.appendChild(list);
  var more=el("button","linkbtn","+ Add a row");more.id=idp+"_more";more.addEventListener("click",function(){addRow(true)});box.appendChild(more);
  box.appendChild(msg);
  var br=el("div","btnrow");
  (o.extraButtons||[]).forEach(function(b){br.appendChild(b)});
  if(o.addLabel){var go=el("button","btn",o.addLabel);go.id=o.addId||idp+"_add";go.addEventListener("click",function(){var res=readQuickRows(rows,ids);
    list.querySelectorAll(".inp").forEach(function(e){e.classList.remove("bad");e.removeAttribute("aria-invalid")});
    if(res.errors.length){res.errors.forEach(function(er,j){var e=$(idp+(er.f==="name"?"_n_":"_a_")+er.i);if(e){e.classList.add("bad");e.setAttribute("aria-invalid","true");if(!j)e.focus()}});msg.className="hint err";msg.textContent="Each bill needs a name and an amount like 42.50.";return}
    if(!res.bills.length&&!o.allowEmpty){msg.className="hint err";msg.textContent="Type at least one bill first.";return}
    o.onAdd(res.bills)});br.appendChild(go)}
  box.appendChild(br);return box}
/* ---------- Paste a list (2.14, docs/onboarding.md 5.4) ----------
   A plain text box: the list is pasted in (so no clipboard permission), read by parseBillLines (calc.js), and what it found
   shows as bill rows to check before adding, as Quick add's rows do: one that matches a bill already there is unticked,
   a large amount is flagged, a yearly bill with no month asks for it, and an account named in the list is matched to the
   household's (one it doesn't know falls back to the default and is flagged). Lines it couldn't read are shown as they
   were pasted. Used by setup's bills step and Settings › Bills. st: {text, res, rows}, kept while the box is open. o: {idp,
   card (a card of its own, else a box), heading, accts [[id, name]…], def (the account for bills without one), existing
   [{name, amount}] (for duplicates), redraw(focusId), onClose, onAdd(list of {name, amount, account, months, freq, month,
   picked})}. */
var PASTE_WHY={"two amounts":"two amounts, so it isn't clear which is the bill","no amount":"no amount","no name":"no name","couldn't read":"couldn't be read"};
/* The household's account a pasted account name means: the same name (ignoring "account", "'s" and punctuation), or the one
   account whose name contains it or is contained in it. null when there's no such account, or more than one. */
function pasteMatch(text,accts){var n=function(x){return String(x||"").toLowerCase().replace(/['’]s\b/g,"").replace(/\baccount\b/g," ").replace(/[^a-z0-9]+/g," ").trim()},t=n(text);if(!t)return null;
  var ex=accts.filter(function(a){return n(a[1])===t});if(ex.length===1)return ex[0][0];
  var part=accts.filter(function(a){var m=n(a[1]);return m&&(m.indexOf(t)>=0||t.indexOf(m)>=0)});return part.length===1?part[0][0]:null}
/* What parseBillLines found, as rows to check: how often from its months (a yearly bill with no month, or a quarterly one
   with none, asks: ask), ticked unless it's a duplicate. */
function pasteRows(res,accts,def){return res.items.map(function(it){var acct=it.account?pasteMatch(it.account,accts):null,m=arr(it.months);
  var r={name:it.name,amount:Number(it.amount).toFixed(2),account:acct||def,on:!it.duplicate,freq:"monthly",month:"",picked:[],dup:!!it.duplicate,large:!!it.large,other:it.account&&!acct?String(it.account):null};
  if(it.yearly){r.freq="yearly";r.ask=true}else if(m.length===1){r.freq="yearly";r.month=String(m[0])}else if(m.length>1&&m.length<12){r.freq="some";r.picked=m.slice()}else if(it.quarterly){r.freq="some";r.ask=true}
  return r})}
/* "Found 18 bills, £1,642.30 a month. 2 lines need a look." (a bill once a year counts as a twelfth; a line needs a look when
   it couldn't be read, or its bill is large, has no month yet or names an account Dovetail doesn't know). */
function pasteSummary(st){var items=st.res.items,mo=items.reduce(function(t,it){var m=arr(it.months).length;return t+it.amount*(it.yearly?1:it.quarterly&&!m?4:m||12)/12},0);
  var look=st.res.unread.length+st.rows.filter(function(r){return r.large||r.ask||r.other}).length;
  return (items.length?"Found "+plural(items.length,"bill")+", "+fmt(mo)+" a month.":"No bills found.")+(look?" "+plural(look,"line")+(look===1?" needs":" need")+" a look.":"")}
function pasteBox(st,o){var box=el(o.card?"section":"div",o.card?"card su-paste":"box su-paste"),hid=o.idp+"_h",h=el(o.heading||"h3",null,"Paste a list");box.id=o.idp;h.id=hid;
  if(!o.card)box.setAttribute("role","group");box.setAttribute("aria-labelledby",hid);box.appendChild(h);
  var ip=el("p","small muted","Copy your bills from a spreadsheet or a note and paste them here, one bill per line, like “Streaming £8.75” or “Council Tax, 168, Joint”. Add “yearly” or a month to a bill that doesn't come every month.");ip.id=o.idp+"_i";box.appendChild(ip);
  var ta=el("textarea","inp");ta.id=o.idp+"_text";ta.value=st.text||"";ta.rows=5;ta.spellcheck=false;ta.setAttribute("autocomplete","off");ta.setAttribute("aria-describedby",ip.id);ta.addEventListener("input",function(){st.text=ta.value});
  box.appendChild(labeled("Your list",ta));
  var msg=el("div","hint");msg.id=o.idp+"_msg";msg.setAttribute("aria-live","polite");
  var br=el("div","btnrow"),rd=el("button","btn"+(st.res?" ghost":""),st.res?"Read it again":"Read the list");rd.type="button";rd.id=o.idp+"_read";
  rd.addEventListener("click",function(){if(!String(st.text||"").trim()){msg.className="hint err";msg.textContent="Paste your list into the box first.";ta.focus();return}
    st.res=parseBillLines(st.text,o.existing);st.rows=pasteRows(st.res,o.accts,o.def);o.redraw(o.idp+"_sum")});
  var cl=el("button","btn ghost","Cancel");cl.type="button";cl.id=o.idp+"_close";cl.addEventListener("click",o.onClose);br.appendChild(rd);br.appendChild(cl);box.appendChild(br);
  if(!st.res){box.appendChild(msg);return box}
  var sp=el("p","su-pastesum",pasteSummary(st));sp.id=o.idp+"_sum";sp.tabIndex=-1;box.appendChild(sp);
  var nm=function(id){var a=o.accts.filter(function(x){return x[0]===id})[0];return a?a[1]:""};
  if(st.rows.length){var hdr=el("div","qa-head");hdr.setAttribute("aria-hidden","true");hdr.appendChild(el("span",null,"Bill name"));hdr.appendChild(el("span",null,"Amount (£)"));box.appendChild(hdr);
    var list=el("div","qa-rows");st.rows.forEach(function(r,i){var id=function(f){return o.idp+"_"+i+"_"+f};
      var row=quickRow(r,{id:id,noun:"Bill",n:i+1,group:"Bill "+(i+1)+" of "+st.rows.length,freq:true,acct:o.accts.length>1?o.accts:null,acctLabel:"Paid from",acctShown:true,
        onFreq:function(){o.redraw(id("f"))},onEnter:function(){var nx=$(id("f"));if(nx)nx.focus()}});
      var ck=checkIn("Add this bill",r.on,function(v){r.on=v},id("on"));ck.classList.add("qa-full");row.insertBefore(ck,row.firstChild);
      var why=[];if(r.dup)why.push("Already in your bills, so it isn't ticked.");if(r.large)why.push("A large amount: check it's a bill, not a balance.");
      if(r.other)why.push("“"+r.other+"” isn't one of your accounts, so it's paid from "+nm(r.account)+" for now.");
      if(r.ask)why.push(r.freq==="yearly"?"Once a year: choose the month.":"Every quarter: pick its months.");
      if(why.length){var nt=el("p","small qa-full su-pastewhy",why.join(" "));nt.id=id("why");row.appendChild(nt);ck.querySelector("input").setAttribute("aria-describedby",nt.id)}
      list.appendChild(row)});box.appendChild(list)}
  if(st.res.unread.length){var uh=el("p","small su-unreadh","Lines that couldn't be read, as you pasted them:");uh.id=o.idp+"_uh";box.appendChild(uh);var ul=el("ul","small su-unread");ul.setAttribute("aria-labelledby",uh.id);
    st.res.unread.forEach(function(u){var li=el("li");li.appendChild(el("span","su-raw",u.text));li.appendChild(document.createTextNode(" (line "+u.line+": "+(PASTE_WHY[u.reason]||u.reason)+")"));ul.appendChild(li)});box.appendChild(ul)}
  if(st.res.truncated)box.appendChild(el("p","small muted","That's a long list: only the start of it was read."));
  box.appendChild(msg);
  if(st.rows.length){var ar=el("div","btnrow"),ad=el("button","btn","Add the ticked bills");ad.type="button";ad.id=o.idp+"_add";
    ad.addEventListener("click",function(){var on=st.rows.filter(function(r){return r.on}),res=readRows(on);
      box.querySelectorAll(".bad").forEach(function(e){e.classList.remove("bad");e.removeAttribute("aria-invalid")});
      if(!on.length){msg.className="hint err";msg.textContent="Tick at least one bill to add.";return}
      if(res.errors.length){res.errors.forEach(function(e,j){var e2=$(o.idp+"_"+st.rows.indexOf(on[e.i])+"_"+(e.f==="name"?"n":e.f==="amount"?"a":"m"));if(e2){e2.classList.add("bad");e2.setAttribute("aria-invalid","true");if(!j){var f=e2.matches("input,select")?e2:e2.querySelector("button");if(f)f.focus()}}});
        msg.className="hint err";msg.textContent="Each ticked bill needs a name and an amount like 42.50, and its month or months if it doesn't come every month.";return}
      var ids=o.accts.map(function(a){return a[0]});
      o.onAdd(res.items.map(function(x){return {name:x.name,amount:x.amount,account:ids.indexOf(x.r.account)>=0?x.r.account:o.def,months:x.months,freq:x.r.freq,month:x.r.month,picked:x.r.picked}}))});
    ar.appendChild(ad);box.appendChild(ar)}
  return box}
/* simple lists: other income, spending budgets, savings transfers */
function listSet(o){
  var box=clear($(o.box));box.appendChild(el("div","small muted",o.intro));
  cfg[o.key].forEach(function(it,i){var d=el("div","box"),g=el("div","grid2"),sid=safeId(it.id),before=itemSnap(o.key,it),note;d.id=o.pfx+"_"+sid;
    function edited(){dated(o.key,it,before);if(note)fillDatedNote(note,o.key,it,redraw)}
    function redraw(){keepScroll(function(){listSet(o)})}
    g.appendChild(labeled("Name",textIn(it.name,function(v){it.name=v;queueCfg()},o.pfx+"_n_"+sid)));
    g.appendChild(labeled("Amount (£)",textIn(money2(it.amount),function(v){var r=parseMoney(v,false);if(r.invalid)return;it.amount=r.value||0;edited();queueCfg()},o.pfx+"_a_"+sid,true)));d.appendChild(g);
    d.appendChild(labeled(o.acctLabel,selectIn(accountOptions(cfg),it[o.acctField],function(v){it[o.acctField]=v;edited();cfgNow()},o.pfx+"_s_"+sid)));
    note=datedNote(o.key,it,o.pfx+"_d_"+sid,redraw,o.pfx+"_a_"+sid);d.appendChild(note);
    var br=el("div","btnrow");br.appendChild(confirmBtn(o.pfx+it.id,"Remove",function(){var to=nextFocus(d,"> .box","#"+o.box,function(n){return "#"+o.pfx+"_n_"+n.id.slice(o.pfx.length+1)},"#"+o.pfx+"_add");
      removeItem(o.key,it,(it.name||o.noun)+" removed",function(){saveCfg(true);afterCfgChange();rerender()},"#"+o.pfx+"_n_"+sid);focusOn(to)}));d.appendChild(br);box.appendChild(d)});
  var add=el("button","linkbtn",o.addText);add.id=o.pfx+"_add";add.addEventListener("click",function(){var n=startsNow({id:uid(o.pfx),name:"",amount:0});n[o.acctField]=o.defAcct();if(o.key==="savings")n.since=thisMonth();cfg[o.key].push(n);cfgNow();keepScroll(function(){listSet(o)});
    var f=$(o.pfx+"_n_"+safeId(n.id));if(f){reveal($(o.pfx+"_"+safeId(n.id)));f.focus()}});box.appendChild(add)}
function renderIncomeSet(){listSet({box:"setIncome",noun:"Income",key:"income",pfx:"in",acctField:"account",acctLabel:"Paid into",addText:"+ Add income",defAcct:oneOffDefaultAccount,
  intro:"Pay is entered each month on the Pay tab. Add anything else that arrives regularly every month here, like Child Benefit or a regular contribution."})}
function renderBudgetSet(){listSet({box:"setBudget",noun:"Budget",key:"budgets",pfx:"bu",acctField:"account",acctLabel:"Spent from",addText:"+ Add a budget",defAcct:oneOffDefaultAccount,
  intro:"Money set aside each month for everyday spending, like food shopping or fuel."})}
function renderSavingsSet(){listSet({box:"setSavings",noun:"Savings transfer",key:"savings",pfx:"sv",acctField:"fromAccount",acctLabel:"Sent from",addText:"+ Add a savings transfer",defAcct:oneOffDefaultAccount,
  intro:"Money you move to savings or investments each payday, before it gets spent. Each one is a transfer on the Pay tab."})}
/* backup */
function importButton(label,id){var b=el("button","btn ghost",label||"Import a backup file…");b.id=id||"importFile";b.addEventListener("click",importFile);return b}
/* Exports: a Markdown report for reading or for an AI assistant, and two CSV files for a spreadsheet. */
function exportFiles(kind){var t=todayStr();if(kind==="md")return [{name:"dovetail-analysis-"+t+".md",mime:"text/markdown",text:exportMarkdown(cfg,months,t,{version:VERSION})}];
  var x=exportCsv(cfg,months,t);return [{name:x.bills.name,mime:"text/csv",text:x.bills.text},{name:x.months.name,mime:"text/csv",text:x.months.text}]}
function download(f){try{var a=document.createElement("a"),u=URL.createObjectURL(new Blob([f.text],{type:f.mime+";charset=utf-8"}));a.href=u;a.download=f.name;document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(u)},4000);return true}catch(e){return false}}
function shareExport(kind){var files=exportFiles(kind);
  if(NATIVE&&typeof NATIVE.shareFiles==="function"){if(!nativeCall(function(){return NATIVE.shareFiles(JSON.stringify(files))},false))toast("Couldn't prepare the file to share");return}
  files.forEach(download);toast(files.length>1?"Downloaded "+files.length+" files":"Downloaded "+files[0].name)}
function exportBox(box){box.appendChild(el("h3",null,"Export for analysis"));
  box.appendChild(el("div","small muted","A report of your settings, saved months and Analysis figures, written so an AI assistant (or a person) can make sense of it, or a spreadsheet version. Nothing leaves your phone unless you share it."));
  var r=el("div","btnrow"),md=el("button","btn",NATIVE?"Share for analysis":"Download report");md.id="exportMd";md.addEventListener("click",function(){shareExport("md")});
  var cp=el("button","btn ghost","Copy report");cp.id="exportCopy";cp.addEventListener("click",function(){copyText(exportFiles("md")[0].text,"Report copied. Paste it into your AI assistant or a note.")});
  var cs=el("button","btn ghost",NATIVE?"Share spreadsheet (CSV)":"Download spreadsheet (CSV)");cs.id="exportCsv";cs.addEventListener("click",function(){shareExport("csv")});
  r.appendChild(md);r.appendChild(cp);r.appendChild(cs);box.appendChild(r)}
function renderBackupSet(){
  var box=clear($("setBackup"));if(importOffer&&!importOffer.update)box.appendChild(importOfferCard());
  if(NATIVE){
    box.appendChild(el("h3",null,"Automatic backups"));
    box.appendChild(el("div","small muted","Dovetail saves a backup on this phone whenever you change something. It keeps the last 10 changes, one from each of the last 14 days and one from each of the last 12 months. A backup made just before a restore, an update or a new version of Dovetail is kept for 30 days."));
    var list=nativeBackups();
    if(!list.length)box.appendChild(el("div","small muted","No automatic backups yet. One is made the next time you change anything."));
    list.forEach(function(b){var row=el("div","spread");row.style.cssText="padding:6px 0;border-bottom:1px solid var(--line)";
      var lab=el("div");lab.appendChild(el("div",null,backupWhen(b)));lab.appendChild(el("div","small muted",Math.max(1,Math.round(num(b.bytes)/1024))+" KB"+(b.kept?" · saved before a restore or update, kept 30 days":"")));row.appendChild(lab);
      row.appendChild(confirmBtn("nb:"+b.name,"Restore",function(){restoreNative(b.name)}));box.appendChild(row)});
    box.appendChild(el("h3",null,"Share or open a backup file"));
    var sr=el("div","btnrow"),sh=el("button","btn","Share backup file…");sh.id="shareBackup";
    sh.addEventListener("click",function(){var d=todayStr();var ok=nativeCall(function(){return NATIVE.share(backupText(),"dovetail-backup-"+d+".json")},false);if(!ok)toast("Couldn't prepare the backup file")});
    sr.appendChild(sh);sr.appendChild(importButton());box.appendChild(sr);
    box.appendChild(el("div","small muted","Save the file to Drive, email it to yourself or keep it in Files. To put Dovetail on another phone, share the backup file to it (WhatsApp, Quick Share, email) and open the file there. It's a copy: changes made on one phone don't reach the other. Share on the Pay tab can send the file too (\u201cSend an update for the other phone\u201d), with the month's transfers, to bring the other phone up to date."));
  }else{box.appendChild(el("h3",null,"Open a backup file"));var br0=el("div","btnrow");br0.appendChild(importButton());box.appendChild(br0)}
  exportBox(box);
  box.appendChild(el("h3",null,"Copy and paste"));
  box.appendChild(el("div","small muted","Your figures live on this phone. Copy a backup now and then (paste it into a note or an email to yourself) so you can restore it after reinstalling or on a new phone."));
  var bb=el("div","btnrow"),sb=el("button","btn ghost",showBackup?"Hide backup":"Show backup");sb.addEventListener("click",function(){showBackup=!showBackup;keepScroll(renderBackupSet)});bb.appendChild(sb);
  var cb=el("button","btn","Copy backup");cb.addEventListener("click",function(){copyText(backupText(),"Backup copied. Paste it somewhere safe.")});bb.appendChild(cb);box.appendChild(bb);
  if(showBackup){var ta=el("textarea","inp");ta.id="backupOut";ta.readOnly=true;ta.value=backupText();ta.setAttribute("aria-label","Backup text");box.appendChild(ta)}
  restoreBox(box);
  // Data set aside by the recovery screen ("Dovetail couldn't open"): copy it out, or let it go.
  var aside=asideInfo();if(aside){box.appendChild(el("h3",null,"Set-aside data"));
    box.appendChild(el("div","small muted","Figures that couldn't be opened were set aside"+(aside.when?" on "+aside.when:"")+" ("+Math.round(aside.size/1024)+" KB). Copy them to keep or send, or remove them."));
    var ar=el("div","btnrow"),ac=el("button","btn ghost","Copy set-aside data");ac.id="asideCopy";ac.addEventListener("click",function(){copyText(rawGet(K_BROKEN)||"","Set-aside data copied")});
    var ad=el("button","btn ghost","Remove it");ad.id="asideDrop";ad.addEventListener("click",function(){try{localStorage.removeItem(K_BROKEN)}catch(e){}renderBackupSet();toast("Set-aside data removed")});
    ar.appendChild(ac);ar.appendChild(ad);box.appendChild(ar)}
  if(wealthRaw!=null&&!cfg.example)wealthBox(box);
  // Start again: only on the phone, where the current figures can be kept as a backup first; never for the example.
  if(NATIVE&&typeof NATIVE.keepBackup==="function"&&!cfg.example){box.appendChild(el("h3",null,"Start again"));
    box.appendChild(el("div","small muted","Set Dovetail up from scratch. Your current figures are saved as a backup on this phone first, kept for 30 days, and setup will offer to bring them back."));
    var sa=confirmBtn("startAgain","Start again",startAgain,"Tap again to start again");sa.id="startAgain";var sr=el("div","btnrow");sr.appendChild(sa);box.appendChild(sr)}
}
/* 2.13, one-off: the old Wealth tab's data (payday.wealth.v1), which every backup still carries. "Save … then remove it"
   shares it as a file of its own (a download in a browser); then a two-tap confirm keeps a backup of everything (with
   it) and removes it. If that backup can't be saved nothing is removed. The settings remember it (wealthRemoved), so
   nothing brings it back by itself: not an update file from the other phone, an opened file, a pasted backup or the
   recovery screen (wealthGone). */
var wealthSaved=false;
function wealthBox(box){box.appendChild(el("h3",null,"Old Wealth data"));
  box.appendChild(el("div","small muted","Backups and update files include figures from the old Wealth tab: balances from version 1, not shown anywhere since 2.0."));
  var r=el("div","btnrow"),s=el("button","btn ghost","Save the old Wealth data as a file, then remove it");s.id="wealthSave";
  s.addEventListener("click",function(){var f=wealthFile(wealthRaw,todayStr(),new Date().toISOString());
    var ok=NATIVE&&typeof NATIVE.shareFiles==="function"?nativeCall(function(){return NATIVE.shareFiles(JSON.stringify([f]))},false):download(f);
    if(!ok){toast("Couldn't prepare the file. Nothing was removed.");return}
    wealthSaved=true;keepScroll(renderBackupSet);var d=$("wealthDrop");if(d)try{d.focus()}catch(e){}if(!NATIVE)toast("Downloaded "+f.name)});
  r.appendChild(s);box.appendChild(r);if(!wealthSaved)return;
  box.appendChild(el("div","small muted","Once the file is somewhere safe, remove the data from Dovetail."+(NATIVE?" A backup with it is kept on this phone for 30 days first; once removed, no backup or update puts it back.":"")));
  var r2=el("div","btnrow"),d=confirmBtn("wealthDrop","Remove the old Wealth data",dropWealth,"Tap again to remove it");d.id="wealthDrop";r2.appendChild(d);box.appendChild(r2)}
function dropWealth(){savePending();if(!keepCurrent()){toast("Couldn't save a backup, so nothing was removed.");return}
  lsDel(K_W);if(rawGet(K_W)!=null){toast("Couldn't remove the old Wealth data.");return}
  cfg.wealthRemoved=true;saveCfg(true);
  wealthRaw=null;wealthSaved=false;queueNativeBackup();keepScroll(renderBackupSet);toast("The old Wealth data has been removed.");
  // The section has gone: focus goes back to the section's heading rather than being lost.
  var sm=document.querySelector("#sBackup summary");if(sm)try{sm.focus({preventScroll:true})}catch(e){}}
/* Settings › Backup, export & restore › Start again. Anything still waiting to be saved is saved, then the figures are
   kept as a backup on the phone; if that fails nothing changes. Reminders for the old figures are cleared, the months
   are removed and the settings are cut down to this phone's own (appearance, notifications and whether the old Wealth
   data was removed), never touching the old Wealth data, and setup starts, offering to bring the backup back. App lock, notifications on or off, the notification
   time and the appearance stay as they are, even if the app is closed before setup finishes: settings without
   setupDone open setup, with that appearance, and the newest automatic backup offered (boot). */
function startAgain(){
  try{if(saveT){clearTimeout(saveT);saveT=null;flushMonth()}if(cfgT||remT){clearTimeout(cfgT);clearTimeout(remT);cfgT=remT=null;saveCfg(true);afterCfgChange()}}catch(e){}
  if(nativeCall(function(){return NATIVE.keepBackup(backupText())},false)!==true){toast("Couldn't save a backup, so nothing was changed.");return}
  clearTimeout(nbT);nbT=null;clearTimeout(schT);schT=null;
  if(notifyNative())nativeCall(function(){NATIVE.setNotificationSchedule(JSON.stringify({version:1,time:cfg.notify.time,amounts:!!cfg.notify.amounts,entries:[]}))});
  var mine={schema:SCHEMA,appearance:clone(cfg.appearance),notify:clone(cfg.notify)};if(cfg.wealthRemoved)mine.wealthRemoved=true;
  lsDel(K_CFG);lsDel(K_MON);cfg=normCfg(mine);months={};cur=null;lsSet(K_CFG,mine,true);
  openBill=null;openOne=null;openRem=null;renewing=null;quickRows=null;billQuery="";billFilter="";importOffer=null;showBackup=false;restoreText="";restoreArm=false;restoreMsg="";arm=null;delAcct=null;whatsNew=false;paySig="";hideUndo();
  var nb=nativeBackups(),kept=nb.filter(function(b){return b.kept})[0]||nb[0];restoreOffer=kept?Object.assign({again:true},kept):null;
  startSetup();goTab("setup");var h=$("suTitle");if(h)try{h.focus()}catch(e){}}
function restoreBox(box,label){
  var ti=el("textarea","inp");ti.id="backupIn";ti.placeholder='Paste a backup here: {"app":"payday-transfers", …}';ti.value=restoreText;ti.addEventListener("input",function(){restoreText=ti.value;restoreArm=false});
  box.appendChild(labeled(label||"Restore from a backup",ti));
  var rb=el("button","btn danger",restoreArm?"Tap again to replace everything":"Restore");rb.id="restoreBtn";rb.addEventListener("click",doRestore);var r2b=el("div","btnrow");r2b.appendChild(rb);box.appendChild(r2b);
  var m=el("div","hint"+(restoreMsg&&restoreMsg.indexOf("restored")<0?" err":""),restoreMsg);m.id="restoreMsg";box.appendChild(m)}
/* Every backup and update file (Copy, Share, automatic, kept): version 5, or 6 with needs when the settings need 2.13 (backupJson). */
function backupText(){return backupJson(cfg,months,wealthRaw,new Date().toISOString())}
/* Why this page can't open file d ("newer", or "needs:2.14"), or null. */
function fileRefusal(d){var r=backupRefusal(d,BACKUP_VERSION,VERSION);return r===null||r==="newer"?r:"needs:"+r}
/* 2.13: whether a restore of settings c2 must leave out the file's old Wealth data, because it was removed: this phone
   has none, and its settings (mine) or the file's say it was removed. Sets or clears c2.wealthRemoved to match. */
function wealthGone(c2,mine,phoneW){var gone=phoneW==null&&(!!(mine&&mine.wealthRemoved===true)||c2.wealthRemoved===true);
  if(gone)c2.wealthRemoved=true;else delete c2.wealthRemoved;return gone}
/* Restoring runs the same upgrade as opening the app, so backups from any earlier version still work. */
function applyBackup(data,fromFile){
  var no=fileRefusal(data);if(no)return no;
  var c2,m2,wm,rep=[];try{c2=normCfg(data.config,rep);m2=normMonths(data.months,rep);wm=data.wealth!=null?clone(data.wealth):wealthRaw}catch(e){logError("restore",e&&e.message);return "bad"}
  // Notification settings belong to this phone (its permission, its lock screen), so a restore never changes them.
  // Appearance comes back with a restore, but not from a file opened from someone else's phone, nor from a backup
  // made before 2.2 (which has none).
  if(cfg&&cfg.notify)c2.notify=clone(cfg.notify);
  if(cfg&&cfg.appearance&&(fromFile||!data.config||data.config.appearance==null))c2.appearance=clone(cfg.appearance);
  try{migrate(c2,m2,wm);defaultMonth(c2.payday)}catch(e){logError("restore",e&&e.message);return "bad"}if(!c2.accounts.length)return "empty";
  // The old Wealth data on this phone is never replaced; a backup's copy is only kept when the phone has none and it
  // wasn't removed (wealthGone).
  var gone=wealthGone(c2,cfg,wealthRaw),w2=wealthRaw!=null?wealthRaw:gone?null:wm;
  if(!lsSet(K_CFG,c2,true)||!lsSet(K_MON,m2,true)||(wealthRaw==null&&w2!=null&&!lsSet(K_W,w2)))return false;
  cfg=c2;months=m2;wealthRaw=w2;openBill=null;openOne=null;setup=null;paySig="";quickRows=null;billQuery="";billFilter="";importOffer=null;hideUndo();restoreReport=rep;return true}
/* What the last restore couldn't use (normCfg and normMonths' report). restoredText adds it to the message once, as one
   sentence, and puts the same sentence in the error log (it has no names or amounts). */
var restoreReport=[];
function restoredText(base){var s=reportSentence(restoreReport);restoreReport=[];if(!s)return base;logError("restore",s);return base.replace(/\.$/,"")+". "+s}
/* Just before a restore or an opened file replaces everything: an automatic backup that's kept for 30 days. */
function keepCurrent(){if(!backupsAllowed())return true;clearTimeout(nbT);nbT=null;
  // true unless the kept backup couldn't be written (with no keepBackup, saveBackup skips a copy it already has: still kept).
  return nativeCall(function(){if(typeof NATIVE.keepBackup==="function")return NATIVE.keepBackup(backupText())===true;NATIVE.saveBackup(backupText());return true},false)}
/* The settings, months and Wealth data exactly as they are stored (not as normCfg left them), as a kept backup: on the
   first open of a new version, before anything is written over them. sc: the stored settings, read. */
function keepRaw(sc){if(!backupsAllowed())return true;var w=wealthRaw!=null?rawGet(K_W):null,ms={};try{ms=JSON.parse(rawGet(K_MON)||"{}")}catch(e){ms={}}
  // 2.17 (13.2, L14): the months too, since a one-off that uses an earlier month's extra payday needs 2.17.
  var v=backupVersionFor(sc,ms);
  var t='{"app":"payday-transfers","version":'+v+(v>5?',"needs":'+JSON.stringify(backupNeedsFor(sc,ms)):"")+',"savedAt":'+JSON.stringify(new Date().toISOString())+
    ',"config":'+rawGet(K_CFG)+',"months":'+(rawGet(K_MON)||"{}")+(w?',"wealth":'+w:"")+"}";
  return nativeCall(function(){if(typeof NATIVE.keepBackup==="function")return NATIVE.keepBackup(t)===true;NATIVE.saveBackup(t);return true},false)}
function restoreError(r){return String(r).indexOf("needs:")===0?"This file needs Dovetail "+String(r).slice(6)+" or later. Update the app first.":r==="newer"?"This backup was made by a newer version of Dovetail. Update the app first.":r==="empty"?"This backup has no accounts in it.":r==="bad"?"That backup couldn't be opened, so nothing was changed.":"Couldn't save the backup on this phone."}
function parseBackup(text){try{var d=JSON.parse(text);return d&&d.config&&Array.isArray(d.config.bills)?d:null}catch(e){return null}}
function afterRestore(msg){applyAppearance();queueSchedule();if(cfg.lastVersion!==VERSION){cfg.lastVersion=VERSION;saveCfg(true)}monthKey=defaultMonth(payCfg());if(tab==="setup"||location.hash==="#setup"){try{history.replaceState(null,"","#pay")}catch(e){}}route();paySig=peopleSig();goMonth(monthKey);if(tab==="settings")renderSettings();toast(msg||"Backup restored")}
function restoreNative(name){var d=parseBackup(nativeCall(function(){return NATIVE.readBackup(name)},""));
  if(!d){toast("That backup couldn't be read");return false}
  // From Settings › Backup the household is kept first, and nothing changes if that fails; setup's offer has nothing to keep.
  var was=restoreOffer;if(backupsAllowed())savePending();if(!keepCurrent()){toast("Couldn't save a backup, so nothing was changed.");return false}
  restoreOffer=null;var res=applyBackup(d);if(res!==true){restoreOffer=was;toast(restoreError(res));return false}
  afterRestore(restoredText("Backup restored"));queueNativeBackup();return true}
/* ---------- recovery: when the page can't open at all ----------
   Shown instead of the app when the saved settings can't be read, or opening them throws. Nothing is changed until
   the user chooses: restoring a backup or starting again first sets the data that was there aside (payday.broken.v1,
   one copy) and then reloads the page, so the app opens the normal way. Without this, a damaged save would be a white
   screen every time, with Settings › Restore out of reach. */
var K_BROKEN="payday.broken.v1",recovering=false,recoverArm=false;
function setAside(){try{var b={at:new Date().toISOString(),config:rawGet(K_CFG),months:rawGet(K_MON)},t=JSON.stringify(b);localStorage.setItem(K_BROKEN,t);return rawGet(K_BROKEN)===t}catch(e){return false}}
var ASIDE_FAILED="Couldn't set the old data aside on this phone, so nothing was changed.";
/* What was set aside, if anything: when, and how big. Settings › Backup can copy it out. */
function asideInfo(){var a=lsGet(K_BROKEN);if(!a||typeof a!=="object")return null;var d=new Date(a.at),ok=!isNaN(d.getTime());
  return {when:ok?whenSaved(a.at):"",size:((a.config||"").length+(a.months||"").length)}}
var recoverErr=null;
function showRecovery(why,err){recovering=true;if(err)recoverErr=err;err=recoverErr;
  if(!recoverArm){if(why==="corrupt")logError("boot","The saved settings or months couldn't be read");else if(err)logError("boot",err&&err.message||err,err&&err.stack?String(err.stack).split("\n")[1]:"")}
  try{document.querySelectorAll("#main .wrap > *").forEach(function(n){n.hidden=true});$("tabbar").hidden=true;$("monthBar").hidden=true}catch(e){}
  var wrap=document.querySelector("#main .wrap"),box=$("recovery")||el("section","card");box.id="recovery";box.setAttribute("aria-labelledby","recoveryH");clear(box);box.hidden=false;
  var h=el("h1",null,"Dovetail couldn't open");h.id="recoveryH";h.tabIndex=-1;box.appendChild(h);
  box.appendChild(el("div",null,why==="corrupt"?"The figures saved on this phone can't be read. Nothing has been changed: they're still there, and so are the automatic backups.":"Something went wrong while opening your figures. Nothing has been changed."));
  box.appendChild(el("div",null,"Restore a backup to carry on. What's on the phone now is set aside, not deleted: Settings › Backup can copy it out later."));
  var nb=nativeBackups().slice(0,3);
  if(nb.length){var l=el("div","btnrow");nb.forEach(function(b,i){var rb=el("button","btn"+(i?" ghost":""),"Restore backup from "+backupWhen(b)+(b.kept?" (kept before a restore or update)":""));rb.id="recover_"+i;
    rb.addEventListener("click",function(){recoverWith(nativeCall(function(){return NATIVE.readBackup(b.name)},""))});l.appendChild(rb)});box.appendChild(l)}
  var r=el("div","btnrow"),f=el("button","btn ghost","Open a backup file");f.id="recoverFile";f.addEventListener("click",importFile);r.appendChild(f);
  var a=el("button","btn danger",recoverArm?"Tap again to start again":"Start again without a backup");a.id="recoverFresh";
  a.addEventListener("click",function(){if(!recoverArm){recoverArm=true;showRecovery(why);try{$("recoverFresh").focus()}catch(e){}return}if(!setAside()){toast(ASIDE_FAILED);return}lsDel(K_CFG);lsDel(K_MON);location.reload()});r.appendChild(a);
  var c=el("button","btn ghost","Copy app details");c.id="recoverCopy";c.addEventListener("click",function(){copyText(appDetails(),"App details copied")});r.appendChild(c);
  var fb=feedbackButton("recoverFeedback");fb.className="btn ghost";r.appendChild(fb);box.appendChild(r);
  box.appendChild(el("div","hint","Need help? Use \u201cSend feedback\u201d, or write to "+FEEDBACK_EMAIL+"."));
  if(recoverArm)box.appendChild(el("div","hint","Starting again opens the setup screens with nothing filled in. What was on this phone is set aside, and the automatic backups stay."));
  if(err&&err.message)box.appendChild(el("div","hint","Error: "+String(err.message).slice(0,200)));
  if(!$("recovery"))wrap.appendChild(box);try{h.focus()}catch(e){}}
/* A backup chosen on the recovery screen: checked and upgraded on copies first; only then is it saved and the page reloaded. */
function recoverWith(text){var d=parseBackup(String(text||""));if(!d){toast("That backup couldn't be read");return}
  var no=fileRefusal(d);if(no){toast(restoreError(no));return}
  var gone,c2,m2,w2,rep=[];try{c2=normCfg(d.config,rep);gone=wealthGone(c2,lsGet(K_CFG),lsGet(K_W));m2=normMonths(d.months,rep);w2=d.wealth!=null?clone(d.wealth):lsGet(K_W);migrate(c2,m2,w2);defaultMonth(c2.payday);c2.notify=normCfg({}).notify}catch(e){logError("recover",e&&e.message);toast("That backup couldn't be opened, so nothing was changed.");return}
  if(!c2.accounts.length){toast(restoreError("empty"));return}
  if(!setAside()){toast(ASIDE_FAILED);return}if(!lsSet(K_CFG,c2,true)||!lsSet(K_MON,m2,true)){toast("Couldn't save the backup on this phone.");return}
  if(!gone&&lsGet(K_W)==null&&d.wealth!=null)lsSet(K_W,clone(d.wealth));
  // The page reloads: what couldn't be used is said once it has opened (boot).
  restoreReport=rep;var s=restoredText("Backup restored.");if(s!=="Backup restored.")try{sessionStorage.setItem(K_NOTE,s)}catch(e){}
  location.reload()}
/* A message to show once the page has reloaded (after the recovery screen restored a backup). */
var K_NOTE="payday.note";
function renderRestoreOffer(target){
  var box=clear(target||$("restoreOffer"));if(!restoreOffer)return;
  var c=el("div","banner col");
  // After "Start again": the figures that were there a moment ago.
  if(restoreOffer.again){c.appendChild(el("b",null,"Bring back what you had before?"));c.appendChild(el("div",null,"Your figures from "+backupWhen(restoreOffer)+" are saved on this phone."))}
  else c.appendChild(el("div",null,"Found an automatic backup from "+backupWhen(restoreOffer)+". Restore your bills, months and settings from it?"));
  var r=el("div","btnrow"),y=el("button","btn","Restore backup"),n=el("button","btn ghost","Start fresh");
  y.addEventListener("click",function(){restoreNative(restoreOffer.name)});
  // In setup the redraw removes the focused button (and brings the welcome's picture back): focus goes to the title.
  n.addEventListener("click",function(){restoreOffer=null;rerender();toast("Starting fresh. Your old backups are still in Settings");var h=target&&$("suTitle");if(h)try{h.focus()}catch(e){}});
  r.appendChild(y);r.appendChild(n);c.appendChild(r);box.appendChild(c)}
/* ---------- opening a backup file (shared from another phone, or picked with "Import a backup file…") ----------
   The file's content is checked first, then the same confirmation as restoring a pasted backup is shown, with a summary
   of what's in the file. Nothing changes until "Replace with this backup" is tapped. A file from this household's other
   phone (2.10) gets a shorter confirmation on the Pay tab instead, with "Update". */
var importOffer=null,MAX_IMPORT=2*1024*1024,pickedFile=false;
var IMPORT_FAIL={toobig:"That file is too big to be a Dovetail backup (over 2 MB). Nothing was changed.",notbackup:"That file isn't a Dovetail backup, so nothing was changed.",
  unreadable:"Couldn't read that file. Nothing was changed.",nopicker:"This phone has no file picker to choose a file with."};
function importFailed(reason){pickedFile=false;if(reason==="cancelled")return;toast(IMPORT_FAIL[reason]||IMPORT_FAIL.unreadable)}
function whenSaved(iso){var d=new Date(iso);if(!iso||isNaN(d.getTime()))return "";return fmtDate(d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate()))+", "+pad(d.getHours())+":"+pad(d.getMinutes())}
/* A backup's settings and months after the same upgrade a restore runs (on copies; nothing is saved), or null. */
function backupCopy(data){try{var c2=normCfg(data.config),m2=normMonths(data.months);migrate(c2,m2,data.wealth!=null?clone(data.wealth):null);return {c:c2,m:m2}}catch(e){return null}}
/* What a backup holds (b: its backupCopy, if already made). */
function backupSummary(data,b){b=b||backupCopy(data);if(!b)return "";try{var c2=b.c,m2=b.m;
  var names=c2.people.map(function(p){return p.name}).filter(Boolean),saved=whenSaved(data.savedAt);
  return (saved?"Saved "+saved+". ":"")+plural(c2.people.length,"person","people")+(names.length?" ("+names.join(", ")+")":"")+", "+plural(c2.accounts.length,"account")+", "+plural(c2.bills.length,"bill")+", "+plural(usedMonths(m2,"9999-12").length,"saved month")+"."}catch(e){return ""}}
function offerImport(text){
  // A file picked with "Import a backup file…" is a restore chosen on purpose: always the full confirmation.
  var picked=pickedFile;pickedFile=false;
  if(text.length>MAX_IMPORT){importFailed("toobig");return}
  if(recovering){recoverWith(text);return}
  var data=parseBackup(text);if(!data||data.app!=="payday-transfers"){importFailed("notbackup");return}
  var no=fileRefusal(data);if(no){toast(restoreError(no));return}
  // A file from this household's other phone (2.10: an update sent with Share, or a backup file) is the same household
  // brought up to date: a short confirmation at the top of the Pay tab. Any other backup gets the full one in Settings.
  var b=backupCopy(data),update=!!(b&&!picked&&cfg.setupDone&&!cfg.example&&sameHousehold(cfg,b.c));
  importOffer={data:data,summary:backupSummary(data,b),msg:"",update:update,newerHere:update&&changedSince(months,data.savedAt)};
  if(update){var show=function(){afterTab("pay",function(){renderNotice();focusImportOffer()})};
    // The tour or a help sheet would cover the card (and each has a history entry of its own): closed first.
    if(tour||sheetOpen){endTour(false,true);closeSheet();setTimeout(show,400)}else show();return}
  clear($("updateOffer"));
  if(!cfg.setupDone){if(setup)setup.step=1;goTab("setup");keepScroll(renderSetup)}else{openSettings("sBackup");keepScroll(renderBackupSet)}
  focusImportOffer()}
function focusImportOffer(){var card=document.querySelector(importOffer&&importOffer.update?"#updateOffer #importOffer":"#importOffer");reveal(card);var t=card&&card.querySelector("b");if(t){t.tabIndex=-1;try{t.focus({preventScroll:true})}catch(e){}}}
function focusPayH(){var h=$("payH");if(h){h.tabIndex=-1;try{h.focus()}catch(e){}}}
function importOfferCard(){var up=importOffer.update,replaces=cfg.setupDone&&!cfg.example,c=el("div","banner col");c.id="importOffer";c.setAttribute("role","group");c.setAttribute("aria-label",up?"Update from a Dovetail file":"Open a Dovetail backup");
  if(up){var saved=whenSaved(importOffer.data.savedAt);c.appendChild(el("b",null,"Update from this file?"));
    c.appendChild(el("div",null,(saved?"Saved "+saved+". ":"")+"This replaces the figures on this phone"+(NATIVE?"; what's here now is kept in the automatic backups for 30 days.":".")));
    // An older file (scrolled back to in the chat, say) would undo ticks or pay made here since: said plainly.
    if(importOffer.newerHere){var w=el("div",null,"This phone has changes made after this file was saved. They'll be replaced.");w.id="updateOlder";c.appendChild(w)}}
  else{c.appendChild(el("b",null,"Open this Dovetail backup?"));if(importOffer.summary)c.appendChild(el("div",null,importOffer.summary));
    if(replaces)c.appendChild(el("div",null,"This replaces all people, accounts, bills and saved months on this phone."+(NATIVE?" What's on this phone now is kept in the automatic backups for 30 days.":"")))}
  var r=el("div","btnrow"),y=el("button","btn"+(replaces&&(!up||importOffer.newerHere)?" danger":""),up?"Update":replaces?"Replace with this backup":"Restore this backup");y.id="importYes";
  y.addEventListener("click",function(){var d=importOffer.data;savePending();
    if(!keepCurrent()){toast("Couldn't save a backup, so nothing was changed.");return}restoreOffer=null;var res=applyBackup(d,true);
    if(res!==true){importOffer.msg=restoreError(res);rerender();return}importOffer=null;afterRestore(restoredText(up?"Updated":"Backup restored"));goTab("pay");queueNativeBackup();if(up)focusPayH()});
  var n=el("button","btn ghost","Cancel");n.id="importNo";n.addEventListener("click",function(){importOffer=null;rerender();toast("Nothing was changed");if(up)focusPayH();
    // 2.18: in setup the redraw removes the focused button (and brings the welcome's picture back): focus goes to the title.
    else{var h=$("tab-setup")&&!$("tab-setup").hidden&&$("suTitle");if(h)try{h.focus()}catch(e){}}});
  r.appendChild(y);r.appendChild(n);c.appendChild(r);if(importOffer.msg){var em=el("div","hint err",importOffer.msg);em.setAttribute("role","alert");c.appendChild(em)}return c}
/* Browsers (and testing): the same import through a file input. In the app the system file picker is used. */
function pickFileInBrowser(){var i=el("input");i.type="file";i.accept=".json,application/json,text/plain";i.style.display="none";document.body.appendChild(i);
  i.addEventListener("change",function(){var f=i.files&&i.files[0];i.remove();if(!f)return;if(f.size>MAX_IMPORT){importFailed("toobig");return}
    var rd=new FileReader();rd.onload=function(){offerImport(String(rd.result||"").replace(/^\uFEFF/,""))};rd.onerror=function(){importFailed("unreadable")};rd.readAsText(f)});
  i.click()}
function importFile(){pickedFile=true;if(NATIVE&&typeof NATIVE.pickBackupFile==="function")nativeCall(function(){NATIVE.pickBackupFile()});else pickFileInBrowser()}
function doRestore(){
  if(restoreText.length>MAX_IMPORT){restoreMsg=IMPORT_FAIL.toobig;restoreArm=false;rerender();return}
  var data;try{data=JSON.parse(restoreText)}catch(e){restoreMsg="That doesn't look like a backup. Paste the whole text you copied, including the curly brackets.";restoreArm=false;rerender();return}
  if(!data||!data.config||!Array.isArray(data.config.bills)||(data.app!=null&&data.app!=="payday-transfers")){restoreMsg="That text isn't a Dovetail backup.";restoreArm=false;rerender();return}
  var no=fileRefusal(data);if(no){restoreMsg=restoreError(no);restoreArm=false;rerender();return}
  // 2.13: what's in it, as for an opened file, before the second tap.
  if(!restoreArm&&cfg.setupDone){restoreArm=true;var sum=backupSummary(data);restoreMsg=(sum?sum+" ":"")+"This replaces all people, accounts, bills and saved months on this phone.";rerender();return}
  savePending();if(!keepCurrent()){restoreMsg="Couldn't save a backup, so nothing was changed.";restoreArm=false;rerender();return}
  restoreOffer=null;var res=applyBackup(data);
  if(res!==true){restoreMsg=restoreError(res);restoreArm=false;rerender();return}
  restoreText="";restoreArm=false;restoreMsg=restoredText("Backup restored.");afterRestore(restoreMsg==="Backup restored."?null:restoreMsg);queueNativeBackup();
}

/* ---------- FIRST-RUN SETUP ----------
   Seven steps: welcome, pay, payday, accounts, bills, spending and saving, and a preview of the first payday. Nothing is
   saved until setup finishes: "Looks right, start" on the last step, or "Finish later" (or "Skip setup for now") on any
   other, which keeps whatever has been entered and fills in the rest (finishSetup). The Pay tab then shows a "Finish
   setting up" card for what's still missing. Back keeps everything typed; "Skip this step" (payday, bills, spending and
   saving) moves on and leaves that step out, until Next is pressed on it again. */
/* Step numbers (2.18, docs/welcome.md 5.5): code, tests and the simulation keep the internal numbers 1–7 (s.step, goStep,
   walkSetup(p, n), check names such as "setup step 4", the sim:ui reports). The welcome (step 1) is a doorway with no
   counter, so what people read counts six steps from pay: "Step 1 of 6" is s.step 2. Anything a user reads uses the
   displayed number (s.step - 1) or the step's name. */
var setup=null,SETUP_STEPS=7;
var SETUP_TITLES=["Payday, without the guesswork","Your pay","Your payday","Your accounts","Your bills","Spending and saving","Your first payday"];
function startSetup(){setup={step:1,people:[{id:uid("p"),name:"",pay:"",payAccount:null}],income:[],sameDay:null,payday:{day:"",weekend:true},skip:{},
  shape:null,style:null,pool:null,ans:{fun:null,funAmt:{},rule:null,set:{},two:"no",payer:null,gets:{},getsAmt:{},board:{},boardAmt:{}},applied:null,
  pending:null,edited:false,accounts:[],bills:{},billOpen:{},budgets:[],savings:[],payWarned:false,bad:[],msg:"",note:false,focusBad:false,
  // 2.14: rough figures for accounts' bills (as typed, by account), which figure boxes are open, what's moved in now (the
  // check, never saved) and whether its question was answered, accounts with "No bills from here", the open group of
  // suggestions in each section, the paste box ({text, res, rows} while open) and the bills help.
  figures:{},figOpen:{},figIn:{},figAsked:{},noBills:{},chipGrp:{},paste:null,findOpen:false}}
/* The words for the four starting points in the accounts step, for one person and for more. */
var SHAPE_TEXT={
  one:{joint:["My account","Pay goes into one account. Bills and spending come out of it."],
    own:["A bills account and a spending account","Pay goes into a bills account. What's left after the bills moves to a spending account."],
    split:["My pay account, a bills account and a spending account","Pay goes into your own account, then to a bills account. What's left after the bills moves to a spending account."],
    other:["Something else","Start with one account and build it yourself."]},
  more:{joint:["One joint account","All pay goes into one account. Bills and spending come out of it."],
    own:["Our own accounts, then a joint one","Pay goes into your own accounts. What's left after your own bills moves to a joint account."],
    split:["Separate accounts for bills and spending","Pay goes into your own accounts, then to a joint bills account. What's left after the bills moves to a joint spending account."],
    other:["Something else","Start with one account and build it yourself."]}};
/* Suggestions in the bills and spending steps (tap one to fill in a row). 2.14 (docs/onboarding.md 5.5): about 25 common
   bills in groups (g), each with its usual frequency. top: shown straight away in a bills account's section (rent or
   mortgage counts as one of the six most common); own: the few shown first in someone's own account (5.10); the rest open
   a group at a time with one tap. Council Tax is usually paid April to January; a TV Licence and car insurance once a year. */
var BILL_GROUPS=[["home","Home"],["phones","Phones"],["transport","Transport"],["children","Children"],["debt","Debt"],["subs","Subscriptions"],["insurance","Insurance"]];
var BILL_SUGGESTIONS=[["Rent",{g:"home",top:1}],["Mortgage",{g:"home",top:1}],["Council Tax",{g:"home",top:1,freq:"some",picked:[4,5,6,7,8,9,10,11,12,1]}],["Energy",{g:"home",top:1}],
  ["Water",{g:"home",top:1}],["Broadband",{g:"home",top:1}],["TV Licence",{g:"home",top:1,freq:"yearly"}],["Home insurance",{g:"home"}],["Boiler cover",{g:"home"}],
  ["Mobile phone",{g:"phones",own:1}],["Landline",{g:"phones"}],
  ["Car finance",{g:"transport",own:1}],["Car insurance",{g:"transport",own:1,freq:"yearly"}],["Vehicle tax",{g:"transport"}],["Breakdown cover",{g:"transport",freq:"yearly"}],
  ["Childcare",{g:"children"}],["School meals",{g:"children"}],["Loan",{g:"debt"}],["Credit card",{g:"debt"}],
  ["Streaming",{g:"subs"}],["Music",{g:"subs"}],["Gym",{g:"subs",own:1}],["Membership",{g:"subs"}],["Life insurance",{g:"insurance"}],["Pet insurance",{g:"insurance"}]];
/* 2.14 (5.3): the card at the end of the bills step, for bills that don't come every month: [chip, the bill's name, its
   frequency]. Council Tax isn't here: the rough figure counts it as monthly. */
var NM_SUGGESTIONS=[["Car insurance","Car insurance","yearly"],["TV Licence","TV Licence","yearly"],["Home insurance","Home insurance","yearly"],["Breakdown cover","Breakdown cover","yearly"],
  ["Boiler cover","Boiler cover","yearly"],["Yearly subscriptions","Yearly subscription","yearly"],["Service charge","Service charge","some"],["Water (if quarterly)","Water","some"]];
var BUDGET_SUGGESTIONS=["Food shopping","Fuel","Travel","Going out","Clothes","Gifts","Pets","Children"];
var SAVINGS_SUGGESTIONS=["Emergency fund","Holiday","Christmas","Car","House deposit"];
var DAY_NAMES=["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"],NUMBER_WORDS=["no","one","two","three","four","five","six","seven","eight","nine"];
function longDate(s){var p=s.split("-").map(Number);return DAY_NAMES[dow(s)]+" "+p[2]+" "+MN[p[1]-1]+(String(p[0])!==todayStr().slice(0,4)?" "+p[0]:"")}
/* Setup's household so far, with names filled in, for the flow helpers (parentId, flowOrder, flowStory). */
function suAcctName(a){return setupAcctName(a,setup.accounts.indexOf(a))}
function suPeople(){return setupPeople(setup)}
/* 2.12.1: whether someone pays board, from setup's answers (three or more people, anyone but the first). */
function suBoarder(p,i){return setupBoarder(setup,p,i)}
/* Whether the answers ask about board: three or more people, pooling, a joint account or one of us paying the bills. */
function suBoardAsked(){return setupBoardAsked(setup)}
/* 2.12.1: the bill payer has no pay while someone else has: "Half each" isn't offered, and the split goes by pay. */
function suNoHalf(){return setupNoHalf(setup)}
/* 2.13: the one person with pay among those who'd share the costs (not anyone paying board), when there's only one: they
   pay what the shared account needs, so how to split it isn't asked. With one of us paying the bills, only when that's
   the bill payer (otherwise set amounts still change what the earner pays). null otherwise. */
function suOneEarner(){return setupOneEarner(setup)}
/* 2.13: the split is asked and not answered yet: the diagram doesn't name a rule until it is (fundingWords, f.open). */
function suRuleOpen(){var s=setup;return s.people.length>1&&["contribute","housekeeping"].indexOf(s.style)>=0&&!s.ans.rule&&!suOneEarner()}
function suCfg(){var s=setup,open=suRuleOpen();return {accounts:s.accounts.map(function(a){var x={id:a.id,name:suAcctName(a),colour:a.colour,leftoverTo:a.leftoverTo};if(a.funding)x.funding=open&&a.funding.rule!=="set"?Object.assign({},a.funding,{open:true}):a.funding;return x}),
  people:suPeople(),income:s.income.filter(function(x){return String(x.name||"").trim()}).map(function(x){return {id:x.id,name:x.name.trim(),account:x.account}})}}
function suAcct(id){return setup.accounts.filter(function(a){return a.id===id})[0]||null}
function suRoot(c){return rootIds(c)[0]||(c.accounts[0]&&c.accounts[0].id)||null}
/* Point everything at an account that exists: people at the first account, bills typed for an account that's gone at the
   usual bills account. Other income, budgets and savings go where shared money goes (2.12.1: sharedInAccount and
   sharedSpendAccount, so a joint account rather than one person's, and never a boarder's), and follow the answers until
   an account is picked for them by hand (picked). */
function fixSetupRefs(){var s=setup;if(!s.accounts.length)return;
  var ids=s.accounts.map(function(a){return a.id});s.accounts.forEach(function(a){if(a.leftoverTo&&ids.indexOf(a.leftoverTo)<0)a.leftoverTo=null});
  var c=suCfg(),first=flowOrder(c)[0],to=defaultBillAccount({people:c.people.map(function(p){return {payAccount:ids.indexOf(p.payAccount)<0?first:p.payAccount}}),accounts:c.accounts});
  s.people.forEach(function(p){if(ids.indexOf(p.payAccount)<0)p.payAccount=first});
  var c2=suCfg(),spend=sharedSpendAccount(c2)||suRoot(c2),inc=sharedInAccount(c2)||spend;
  s.income.forEach(function(x){if(ids.indexOf(x.account)<0||!x.picked)x.account=inc});
  s.budgets.concat(s.savings).forEach(function(x){if(ids.indexOf(x.account)<0||!x.picked)x.account=spend});
  Object.keys(s.bills).forEach(function(k){if(ids.indexOf(k)>=0)return;var rows=s.bills[k].filter(rowUsed);delete s.bills[k];delete s.billOpen[k];
    if(rows.length){s.bills[to]=(s.bills[to]||[]).filter(rowUsed).concat(rows);s.billOpen[to]=true}})}
/* A starting point fills in the accounts. An account with the same role as one already there (Alex's own account, the
   joint bills account…) keeps that account's id, so what was typed for it (bills, budgets, savings, other income) stays
   with it when the starting point is filled in again, after someone is added in step 2, say. Anything typed for an
   account that's gone moves on (fixSetupRefs). Since 2.12 the starting point comes from the answers to the questions
   (suKind, suOpts), and the answers that shape the accounts are kept (s.applied) so "Keep mine" can put them back. */
function applyShape(){var s=setup,kind=suKind();if(!kind)return;var sh=setupShape(kind,suPeople(),suOpts()),had={},taken={},map={},old={};
  s.accounts.forEach(function(a){taken[a.id]=1;old[a.id]=a;if(a.role)had[a.role]=a.id});
  // Changing an existing household (2.12): its own accounts are kept wherever they fit (a joint account can stand in for
  // joint bills or joint spending and the other way round). 2.13: matched against the household's accounts every time
  // (matchAccounts), never against the list the previous answer left, which may have dropped one.
  if(s.change){var m=matchAccounts(s.homeRoles,sh.accounts);had={};
    s.home.forEach(function(a){taken[a.id]=1;if(!old[a.id])old[a.id]=a});
    sh.accounts.forEach(function(a){if(m[a.id])had[a.role]=m[a.id]})}
  // A new account never takes the id of one that's there: ids are made from the time and a random number, and the time
  // can be the same.
  sh.accounts.forEach(function(a){var id=had[a.role];if(!id){id=a.id;while(taken[id])id=uid("a")}taken[id]=1;map[a.id]=id});
  sh.accounts.forEach(function(a){a.id=map[a.id];if(a.leftoverTo)a.leftoverTo=map[a.leftoverTo];var o=old[a.id];if(s.change&&o){a.name=o.name;a.colour=o.colour}});Object.keys(sh.payAccount).forEach(function(k){sh.payAccount[k]=map[sh.payAccount[k]]});
  s.accounts=sh.accounts;s.people.forEach(function(p){p.payAccount=sh.payAccount[p.id]});s.shape=kind;s.applied=suStruct();s.pending=null;s.edited=false;fixSetupRefs()}
/* The setupShape kind the answers make: with one person, the picture picked; with more, how they manage their money
   (and, when they put it all together, how pay reaches the joint account). null until answered. */
function suKind(){var s=setup;if(s.people.length<2)return s.pool;return s.style==="pool"?s.pool:s.style}
/* The answers as setupShape options. Without anyone's pay typed in, nobody counts as having no pay. With one earner the
   split isn't asked (2.13), and it goes by pay, so it still makes sense if someone else has pay later. */
function suOpts(){return setupOpts(setup)}
/* The answers that decide which accounts there are (the rest only change who pays what). */
function suStruct(){var s=setup,a=s.ans,b={};if(suBoardAsked())Object.keys(a.board).forEach(function(k){if(a.board[k]==="yes")b[k]=true});
  return {style:s.style,pool:s.pool,two:a.two,payer:a.payer,board:b}}
function suStructKey(x){var s=setup;x=x||suStruct();var kind=s.people.length<2?x.pool:x.style==="pool"?x.pool:x.style;
  return JSON.stringify([kind,kind==="contribute"?x.two:null,kind==="housekeeping"?x.payer:null,s.people.length>2?Object.keys(x.board).sort():[]])}
/* One of those answers changed: fill in the accounts again, or, once they've been edited by hand, ask first. */
function suReshape(focusId){var s=setup,was=s.applied;
  if(!suKind()||(was&&suStructKey(was)===suStructKey()))s.pending=null;else if(s.edited&&s.accounts.length){if(!s.pending)s.pendingFocus=focusId;s.pending=true}else applyShape();suRedraw(focusId)}
/* "Keep mine": the answers that shaped the accounts go back to what they were. */
function suKeepMine(){var s=setup,x=s.applied;s.pending=null;if(!x)return;s.style=x.style;s.pool=x.pool;s.ans.two=x.two;s.ans.payer=x.payer;
  Object.keys(s.ans.board).forEach(function(k){s.ans.board[k]=x.board[k]?"yes":"no"})}
/* Who pays what changes with the rule and the amounts typed: the funding on each account from the starting point is
   worked out again from the answers (by role), whatever else has been changed by hand. */
function suSyncFunding(){setupSyncFunding(setup,setup.accounts)}
/* Removing an account: what sent its money to it now sends it where it went, and so does the pay that arrived in it.
   Its other income, budgets, savings and bills go there too; if it kept what's left, to the account that keeps it now
   (and pay to the first account in flow order). */
function removeSetupAccount(a){var s=setup,sc=suCfg(),up=parentId(sc,a.id);
  s.accounts.forEach(function(o){if(o.leftoverTo===a.id)o.leftoverTo=up&&up!==o.id?up:null});
  s.accounts.splice(s.accounts.indexOf(a),1);var after=suCfg(),pay=up||flowOrder(after)[0],to=up||suRoot(after);
  s.people.forEach(function(p){if(p.payAccount===a.id)p.payAccount=pay});s.income.concat(s.budgets,s.savings).forEach(function(x){if(x.account===a.id)x.account=to});
  if(s.bills[a.id]){var rows=s.bills[a.id].filter(rowUsed);delete s.bills[a.id];delete s.billOpen[a.id];if(rows.length){s.bills[to]=(s.bills[to]||[]).filter(rowUsed).concat(rows);s.billOpen[to]=true}}
  s.edited=true;fixSetupRefs()}
function newRow(acct){return {name:"",amount:"",account:acct||""}}
function newBillRow(){return {name:"",amount:"",freq:"monthly",month:"",picked:[]}}
/* Step changes: errors cleared, the top of the page, and focus on the step's title (for keyboards and screen readers). */
function goStep(n){var s=setup;s.step=n;s.bad=[];s.msg="";s.note=false;if(s.pending)suKeepMine();s.pending=null;renderSetup();if(s.change)reveal($("chBox"));else toTop();var h=$("suTitle");if(h)try{h.focus({preventScroll:true})}catch(e){}}
/* Redraw the step in place, keeping the scroll position and focus (on the element with that id, or where it was). */
function suRedraw(focusId){var a=document.activeElement,id=focusId||(a&&a.id);keepScroll(renderSetup);var e=id&&$(id);if(e)try{e.focus({preventScroll:true})}catch(x){}}
/* A failed Next: say what's wrong next to the buttons and mark the fields. */
function suFail(msg,bad){var s=setup;s.msg=msg;s.note=false;s.bad=bad||[];s.focusBad=true;keepScroll(renderSetup)}
function suCard(box,hid,title,intro){var c=el("section","card");c.setAttribute("aria-labelledby",hid);var h=el(setup&&setup.change?"h4":"h2",null,title);h.id=hid;c.appendChild(h);if(intro)c.appendChild(el("p","small muted",intro));box.appendChild(c);return c}
function suMoney(v,on,id){var i=textIn(v,on,id,true);i.placeholder="0.00";i.addEventListener("blur",function(){on(i.value)});return i}
function setupNav(box,o){var s=setup;
  var msg=el("div",s.note?"banner":"hint err");msg.id="su_msg";msg.setAttribute("aria-live","polite");box.appendChild(msg);
  if(s.msg){var t=s.msg;setTimeout(function(){if($("su_msg")===msg)msg.textContent=t},30)}else msg.hidden=true;
  var nb=el("div","btnrow su-nav");
  if(o.back!==false){var bk=el("button","btn ghost","Back");bk.id="su_back";bk.addEventListener("click",function(){goStep(s.change?4:s.step-1)});nb.appendChild(bk)}
  var nx=el("button","btn",o.next||"Next");nx.id=o.nextId||"su_next";nx.addEventListener("click",o.onNext);nb.appendChild(nx);box.appendChild(nb);
  var links=el("div","su-links");
  if(o.skip){var sk=el("button","linkbtn","Skip this step");sk.id="su_skip";sk.addEventListener("click",o.skip);links.appendChild(sk)}
  if(s.change){var cl=el("button","linkbtn","Cancel");cl.id="ch_cancel";cl.addEventListener("click",cancelChange);links.appendChild(cl)}
  else if(o.later!==false){var lt=el("button","linkbtn","Finish later");lt.id="su_later";lt.addEventListener("click",finishLater);links.appendChild(lt)}
  if(links.firstChild)box.appendChild(links)}
/* ---------- changing how the household manages its money, from a month (2.12) ----------
   Settings › Accounts › "Change how you manage your money": setup's questions and accounts (step 4, drawn in place in
   Settings), then the month it starts (step "8"). The household's own accounts are kept where they fit (accountRoles);
   ones left out close from that month and new ones open then. Saved with applyChange (calc.js); Undo puts everything
   back as it was. Pay for the questions is each person's latest pay (typed, or usual). */
function startChange(){startSetup();var s=setup,roles=accountRoles(cfg);s.change=true;s.step=4;s.from=null;s.moves={};
  // 2.16: the pay a month plans on with nothing typed (planPay: the estimate, pay each time × n on a pattern).
  // Someone on a pattern counts with their pay over a year ÷ 12 (usualMonthly), as their shares go by.
  var est=payEstimates();s.people=cfg.people.map(function(p,i){var pa=personAt(cfg,p.id,monthKey),e=patternOf(pa)?usualMonthly(pa):est[p.id].used;return {id:p.id,name:personName(p,i),pay:e>0?String(e):"",payAccount:p.payAccount}});
  s.income=cfg.income.map(function(x){return {id:x.id,name:String(x.name||""),amount:String(x.amount),account:x.account,picked:true}});
  s.accounts=cfg.accounts.filter(function(a){return !a.closedFrom}).map(function(a){var x={id:a.id,name:a.name||"",colour:a.colour,leftoverTo:parentId(cfg,a.id),role:roles[a.id]};if(a.funding)x.funding=clone(a.funding);return x});
  // 2.13: the household's own accounts, to match every answer against (applyShape); "separate joint accounts?" starts on
  // Yes when it already has joint bills and joint spending.
  s.homeRoles=roles;s.home=s.accounts.map(function(a){return {id:a.id,name:a.name,colour:a.colour}});
  var rl=Object.keys(roles).map(function(k){return roles[k]});if(rl.indexOf("bills")>=0&&rl.indexOf("spending")>=0)s.ans.two="yes";
  s.shape=null;keepScroll(renderAccountsSet);reveal($("chBox"));var h=$("suTitle");if(h)try{h.focus({preventScroll:true})}catch(e){}}
function cancelChange(){setup=null;keepScroll(renderAccountsSet);var b=$("ac_change");if(b)try{b.focus({preventScroll:true})}catch(e){}}
/* The months the change can start from: three before the month the app opens on, to a year after. */
function changeMonths(){var k0=defaultMonth(payCfg()),out=[];for(var o=-3;o<=12;o++)out.push(shiftMonth(k0,o));return out}
/* Accounts the change leaves out that still have bills, budgets, savings or income: they need somewhere to go. */
function closingAccounts(){var s=setup,keep={};s.accounts.forEach(function(a){keep[a.id]=1});
  return cfg.accounts.filter(function(a){return !a.closedFrom&&!keep[a.id]}).map(function(a){var n=itemsOn(a.id);return {a:a,n:n,busy:!!(n.bills||n.budgets||n.savings||n.income||n.estimates)}})}
function suChangeWhen(box,s){var opts=changeMonths(),def=shiftMonth(defaultMonth(payCfg()),1);if(!s.from)s.from=def;
  var c=suCard(box,"ch_h_when","Starting from");
  c.appendChild(labeled("The first pay month it applies to",selectIn(opts.map(function(k){return [k,mLabel(k)]}),s.from,function(v){s.from=v;suRedraw("ch_from")},"ch_from")));
  c.appendChild(el("p","small","Months before "+mLabel(s.from)+" keep the way you managed your money then."));
  var ticked=Object.keys(months).filter(function(k){var d=months[k];return k>=s.from&&d&&d.done&&Object.keys(d.done).some(function(x){return d.done[x]!=null&&d.done[x]!==false})}).sort();
  if(ticked.length){var tb=el("div","banner",listAnd(ticked.map(mLabel))+(ticked.length>1?" already have":" already has")+" transfers ticked. The ticks stay, but the transfers may change.");tb.id="ch_ticked";c.appendChild(tb)}
  var later=arr(cfg.flows).filter(function(e){return e.from>=s.from}).map(function(e){return mLabel(e.from)});
  if(later.length){var lb=el("div","banner","This replaces the change from "+listAnd(later)+".");lb.id="ch_replaces";c.appendChild(lb)}
  // Accounts that close: where their bills go. Moving a bill changes earlier months too (bills aren't dated yet).
  var closing=closingAccounts(),sc=suCfg(),to=sc.accounts.map(function(a){return [a.id,a.name]}),def2=defaultBillAccount(sc)||(to[0]&&to[0][0]);
  // Rather an account that was there before the change, so the bills stay with one the household knows.
  if(!accById(cfg,def2)){var old=flowOrder(sc).filter(function(id){return accById(cfg,id)});if(old.length)def2=old[old.length-1]}
  if(closing.length){var cc=suCard(box,"ch_h_close","Accounts that close");
    closing.forEach(function(x,i){var nm=x.a.name||"Unnamed account";if(!x.busy){cc.appendChild(el("p","small",nm+" closes from "+mLabel(s.from)+". Nothing uses it."));return}
      if(!s.moves[x.a.id]||!accById(sc,s.moves[x.a.id]))s.moves[x.a.id]=def2;
      cc.appendChild(labeled(nm+" closes. Move its bills, budgets"+(x.n.estimates?", savings and rough figure":" and savings")+" to",selectIn(to,s.moves[x.a.id],function(v){s.moves[x.a.id]=v},"ch_mv_"+i)))});
    if(closing.some(function(x){return x.busy}))cc.appendChild(el("p","small muted","Months before "+mLabel(s.from)+" keep them where they were."))}
  var nw=s.accounts.filter(function(a){return !accById(cfg,a.id)}).map(suAcctName);
  var dc=suCard(box,"ch_h_dia","From "+mLabel(s.from));if(nw.length)dc.appendChild(el("p","small",listAnd(nw)+(nw.length>1?" open":" opens")+" then."));
  dc.appendChild(flowDiagram(sc,"ch_h_dia"));
  setupNav(box,{back:true,next:"Change from "+mLabel(s.from),nextId:"ch_go",onNext:confirmChange})}
function confirmChange(){var s=setup;if(!s||!s.change)return;savePending();suSyncFunding();var sc=suCfg(),from=s.from,moves={};
  closingAccounts().forEach(function(x){if(x.busy&&s.moves[x.a.id])moves[x.a.id]=s.moves[x.a.id]});
  var next={accounts:s.accounts.map(function(a){var x={id:a.id,name:suAcctName(a),colour:a.colour,leftoverTo:parentId(sc,a.id)};if(a.funding)x.funding=clone(a.funding);return x}),pay:{}};
  s.people.forEach(function(p){next.pay[p.id]=p.payAccount});
  // Who pays board from then (2.12.1), for the people the questions asked about; earlier months keep who did.
  if(suBoardAsked()){next.boarders={};s.people.forEach(function(p,i){if(i)next.boarders[p.id]=suBoarder(p,i)})}
  var before={cfg:clone(cfg),months:clone(months)};
  cfg=applyChange(cfg,from,next,moves,oneOffAccounts());
  // One-offs from that month on, in an account that closes, go where its bills went.
  Object.keys(months).forEach(function(k){if(k>=from)arr(months[k]&&months[k].oneOffs).forEach(function(o){if(o&&moves[o.account])o.account=moves[o.account]})});
  cur=months[monthKey]?clone(months[monthKey]):null;xFresh();setup=null;saveMonths();cfgNow();renderPayInputs();keepScroll(renderSettings);
  var b=$("ac_change");if(b)try{b.focus({preventScroll:true})}catch(e){}
  offerUndo("Changed from "+mLabel(from),function(){cfg=before.cfg;months=before.months;cur=months[monthKey]?clone(months[monthKey]):null;xFresh();saveMonths();cfgNow();renderPayInputs();keepScroll(renderSettings)},"#ac_change")}
/* Accounts the saved months' one-offs use (they can't be removed while one does). */
function oneOffAccounts(){var out=[];Object.keys(months).forEach(function(k){arr(months[k]&&months[k].oneOffs).forEach(function(o){if(o&&o.account&&out.indexOf(o.account)<0)out.push(o.account)})});
  arr(cur&&cur.oneOffs).forEach(function(o){if(o&&o.account&&out.indexOf(o.account)<0)out.push(o.account)});return out}
/* Settings › Accounts: how the household manages its money, its changes, and the way to change it. */
var undoChangeArm=false;
function moneyBox(){var b=el("div","box"),h=el("h3",null,"How you manage your money");h.id="acMoneyH";b.id="acMoney";b.setAttribute("role","group");b.setAttribute("aria-labelledby","acMoneyH");b.appendChild(h);
  var fl=arr(cfg.flows),now=defaultMonth(payCfg()),last=fl[fl.length-1];
  if(last){b.appendChild(el("p","small",(last.from>now?"Changes from ":"Changed from ")+mLabel(last.from)+". "+(fl.length>1?"Earlier months keep the ways you managed it before.":"Earlier months keep the way you managed it before.")));
    if(last.from>now)b.appendChild(el("p","small muted","The accounts below are how it works from "+mLabel(last.from)+". Until then, transfers work as before."));
    var ub=el("button","btn ghost"+(undoChangeArm?" danger":""),undoChangeArm?"Undo it: every month goes back to how it was":"Undo the change from "+mLabel(last.from));ub.id="ac_undoChange";ub.type="button";
    ub.addEventListener("click",function(){if(!undoChangeArm){undoChangeArm=true;keepScroll(renderAccountsSet);var x=$("ac_undoChange");if(x)x.focus();return}
      undoChangeArm=false;savePending();cfg=removeLastChange(cfg,oneOffAccounts());cfgNow();renderPayInputs();keepScroll(renderSettings);toast("Change from "+mLabel(last.from)+" undone");var y=$("ac_change");if(y)y.focus()});
    var r=el("div","btnrow");r.appendChild(ub);b.appendChild(r)}
  else b.appendChild(el("p","small muted","Getting married, moving in together, a new baby or a change of job? Change how you manage your money from a month you choose. Earlier months stay as they were."));
  var cb=el("button","btn","Change how you manage your money\u2026");cb.id="ac_change";cb.type="button";cb.addEventListener("click",function(){undoChangeArm=false;startChange()});
  var r2=el("div","btnrow");r2.appendChild(cb);b.appendChild(r2);return b}
/* Where setup draws: its own screen, or Settings › Accounts for "Change how you manage your money" (2.12). */
function suBoxId(){return setup&&setup.change?"chBox":"setup"}
function renderSetup(){
  if(setup&&setup.change&&!$("chBox"))return;
  var box=clear($(suBoxId())),s=setup;if(!s){startSetup();s=setup}
  // Changing how the household manages its money (2.12): two steps, the questions and accounts, then when it starts.
  // Setup's own steps count from pay (2.18): the welcome draws no counter, and pay is "Step 1 of 6".
  var total=s.change?2:SETUP_STEPS-1,n=s.change?(s.step===8?2:1):s.step-1;
  // 2.16: with anyone on a pattern, steps 3 and 7 are about the transfer day.
  var title=suPats().length&&(s.step===3||s.step===7)?(s.step===3?"Your transfer day":"Your first transfer day"):SETUP_TITLES[s.step-1];
  var head=el("div","pagehead su-head"),h1=el(s.change?"h3":"h1",null,s.change?(s.step===8?"When does the change start?":"Change how you manage your money"):title);h1.id="suTitle";h1.tabIndex=-1;
  // The welcome (2.18): the mark and the name in a small line above a larger headline, and no step counter.
  var wel=s.step===1&&!s.change;box.classList.toggle("su-wel",wel);
  if(wel){var brand=el("div","su-brand");brand.appendChild(markSvg("su-mark"));brand.appendChild(el("span",null,"Dovetail"));head.appendChild(brand)}head.appendChild(h1);
  if(!wel){var sn=el("div","su-stepn");sn.appendChild(el("span",null,"Step "+n+" of "+total));
    var dots=el("div","steps-dots");dots.setAttribute("aria-hidden","true");for(var i=1;i<=total;i++)dots.appendChild(el("i",i<=n?"on":""));sn.appendChild(dots);head.appendChild(sn)}box.appendChild(head);
  (s.step===8?suChangeWhen:[suWelcome,suPay,suPayday,suAccounts,suBills,suSpend,suPreview][s.step-1])(box,s);
  s.bad.forEach(function(id,j){var e=$(id);if(!e)return;e.classList.add("bad");e.setAttribute("aria-invalid","true");e.setAttribute("aria-describedby","su_msg");
    if(!j&&s.focusBad){s.focusBad=false;var f=e.matches("input,select,textarea,button")?e:e.querySelector("button,input,select");try{f.focus()}catch(x){}reveal(e.closest(".qa-row,.box,.card")||e)}})}

/* Step 1: the welcome (2.18, docs/welcome.md): a headline, one line, a picture of a finished payday, a trust line and the
   three ways in. An automatic backup or an opened file is offered straight under the headline, and then the picture is
   left out so the card and the buttons come first. */
function suWelcome(box,s){
  var offer=!!(importOffer||restoreOffer);
  if(importOffer)box.appendChild(importOfferCard());
  var ro=el("div");ro.id="restoreOfferSetup";box.appendChild(ro);renderRestoreOffer(ro);
  box.appendChild(el("p","su-lead","Every bill, the account it leaves from, and the transfers to cover them, all in one place."));
  if(!offer)box.appendChild(welcomePicture());
  var tr=el("ul","su-trust");tr.id="su_trust";
  [["bank","Any bank"],["nologin","No bank login"],["nonet","No internet"]].forEach(function(t){var li=el("li");li.appendChild(welcomeIcon(t[0]));li.appendChild(el("span",null,t[1]));tr.appendChild(li)});
  box.appendChild(tr);
  var c=el("div","card su-choices");
  var go=el("button","btn","Set up my household");go.id="su_start";go.addEventListener("click",function(){goStep(2)});c.appendChild(go);
  var rd=el("details","su-restore");rd.id="su_restore";rd.appendChild(el("summary","btn ghost","Restore from a backup"));
  var ri=el("div","su-restore-in");ri.appendChild(el("p","small muted","Open a backup file you saved or were sent, or paste a backup you copied."));
  var ib=el("div","btnrow");ib.appendChild(importButton("Open a backup file","su_import"));ri.appendChild(ib);restoreBox(ri,"Or paste a backup");rd.appendChild(ri);
  if(restoreText||restoreMsg)rd.open=true;rd.addEventListener("toggle",function(){if(rd.open)reveal(rd)});c.appendChild(rd);
  var ex=el("button","btn ghost","Explore an example");ex.id="su_example";ex.addEventListener("click",loadExample);c.appendChild(ex);box.appendChild(c);
  var lr=el("div","su-links"),later=el("button","linkbtn","Skip setup for now");later.id="su_later";later.addEventListener("click",finishLater);lr.appendChild(later);box.appendChild(lr);
  var note=el("p","su-note","About five minutes to set up, and you can change anything later. A rough figure is fine for bills.");note.id="su_note";box.appendChild(note)}
/* The welcome's picture: a made-up payday, round figures that add up (left over and the bill count are worked out here,
   never typed). say/saysBills are the spoken forms for the screen-reader sentence. The names and amounts were checked
   against tools/make-public.mjs's search (the owner's bill names and amounts): if any changes, run it again. */
var WELCOME_EXAMPLE={pay:3000,from:{name:"Current account",colour:"blue"},transfers:[
  {to:"Bills account",say:"the Bills account",colour:"purple",amount:1400,bills:["Rent","Council tax","Energy"],more:2,saysBills:"rent, council tax, energy and 2 more bills"},
  {to:"Everyday account",say:"the Everyday account",colour:"orange",amount:800,bills:["Phone","Gym"],saysBills:"the phone and the gym"},
  {to:"Savings",say:"Savings",colour:"teal",amount:300}]};
/* The three trust-line icons and the tick (24- and 12-unit boxes; stroked by CSS). */
var WELCOME_ICONS={bank:["M3.5 9.5 12 4.5l8.5 5M5 20h14M6.5 12v5.5M10.2 12v5.5M13.8 12v5.5M17.5 12v5.5"],
  nologin:["M12 3.5 5 6v5.5c0 4.2 2.9 7.6 7 9 4.1-1.4 7-4.8 7-9V6z","m9 12 2.2 2.2L15.2 10"],
  nonet:["M12 19.5h.01M8.6 16a5 5 0 0 1 6.8 0M5.2 12.6a10 10 0 0 1 5-2.5M18.8 12.6a10 10 0 0 0-2.4-1.8M2 9.2a15 15 0 0 1 4.5-2.8M22 9.2A15 15 0 0 0 11 5M3 3l18 18"]};
function welcomeIcon(k){var v=svgEl("svg",{viewBox:"0 0 24 24","aria-hidden":"true",focusable:"false"});WELCOME_ICONS[k].forEach(function(d){svgEl("path",{d:d},v)});return v}
function welcomeTick(){var v=svgEl("svg",{viewBox:"0 0 12 12","aria-hidden":"true",focusable:"false"});svgEl("path",{d:"M2.6 6.2 5 8.5l4.4-4.8"},v);return v}
/* A badge for a made-up account: its first letter, in its colour. */
function welcomeBadge(name,colour){var a=avatar(null,false,name.charAt(0));a.style.setProperty("--c",colourVar(colour));return a}
/* The card borrows the Pay tab's look (numbered transfers, account badges, the hero's accent band). Words and amounts are
   HTML so they grow with larger text; the drawing is hidden from screen readers, and one sentence before it says what
   it shows. */
function welcomePicture(){var W=WELCOME_EXAMPLE,left=W.pay,bills=0;
  // Parts are joined by spaces (ignored by the flex layout) so the card's text reads as words.
  var put=function(p){for(var i=1;i<arguments.length;i++){if(p.firstChild)p.appendChild(document.createTextNode(" "));p.appendChild(arguments[i])}return p};
  W.transfers.forEach(function(t){left-=t.amount;bills+=t.bills?t.bills.length+(t.more||0):0});
  var fig=el("figure","su-pic");fig.id="su_pic";
  fig.appendChild(el("p","sr","An example payday. "+fmt0(W.pay)+" pay arrives. "+W.transfers.map(function(t,i){
    return "Transfer "+(i+1)+": move "+fmt0(t.amount)+" to "+t.say+(t.saysBills?", which pays "+t.saysBills:"")+"."}).join(" ")+
    " "+fmt0(left)+" is left over, yours to spend. All "+bills+" bills are covered."));
  var stack=el("div","su-pic-stack");stack.setAttribute("aria-hidden","true");var card=el("div","su-pic-card");stack.appendChild(card);
  card.appendChild(put(el("div","su-pic-pay"),welcomeBadge(W.from.name,W.from.colour),el("span","su-pic-pl","Pay in \u00b7 "+W.from.name),el("span","su-pic-amt",fmt0(W.pay))));
  var ol=el("ol","su-pic-list");W.transfers.forEach(function(t,i){
    var r=put(el("span","su-pic-route"),el("span",null,"Move to"),el("b",null,t.to));r.insertBefore(welcomeBadge(t.to,t.colour),r.lastChild); // the badge has no text, so no space of its own
    var li=put(el("li","su-pic-tr"),el("span","su-pic-n",String(i+1)),r,el("span","su-pic-amt",fmt0(t.amount)));
    if(t.bills){var ch=el("span","su-pic-chips");t.bills.forEach(function(b){var x=el("span","su-pic-chip",b);x.appendChild(welcomeTick());put(ch,x)});
      if(t.more)put(ch,el("span","su-pic-chip more","+"+t.more));put(li,ch)}
    ol.appendChild(li)});card.appendChild(ol);
  var hv=el("span","su-pic-hv",fmt0(left));hv.id="su_pic_left";
  var ht=el("span","su-pic-ht");ht.appendChild(el("b",null,"left over,"));ht.appendChild(document.createTextNode(" yours to spend"));
  var cov=el("span","su-pic-cov");cov.id="su_pic_covered";cov.appendChild(welcomeTick());cov.appendChild(document.createTextNode("All "+bills+" bills covered"));
  card.appendChild(put(el("div","su-pic-hero"),hv,ht,cov));fig.appendChild(stack);
  fig.appendChild(el("figcaption","small muted","An example. If pay won't stretch, Dovetail says which account will be short."));return fig}

/* 2.17 (docs/payperiods.md 13.2, L15): "A recent payday (optional)", a date field with its hint, for someone paid weekly,
   every two or four weeks (setup step 2's #su_pon_<i>, Settings › People's #pp_on_<id>). on(value) gets "YYYY-MM-DD", or
   "" when it's cleared. */
var PAYDAY_HINT="Any payday in the last few weeks, or the next one, as it usually falls (not one moved for a bank holiday). With it, Dovetail counts your paydays and spots an extra one.",
  PAYDAY_BAD="Choose a date from 2000 to 2099, or leave it empty.",PAYDAY_PART="Finish the date, or clear it all.";
/* A date field with only part of a date in it (it reads as empty). */
function paydayPart(i){return !!(i&&!i.value&&i.validity&&i.validity.badInput)}
function paydayField(id,v,on){var w=el("div"),i=el("input","inp");i.type="date";i.id=id;i.min="2000-01-01";i.max="2099-12-31";i.value=validDate(v)?v:"";
  var h=el("div","small muted",PAYDAY_HINT);h.id=id+"_h";var m=el("div","hint err");m.id=id+"_msg";m.setAttribute("aria-live","polite");i.setAttribute("aria-describedby",h.id+" "+m.id);
  // Saved when a whole date is chosen (change) or the field is left (blur), never on each keystroke: a part of the date
  // being typed again reads as empty, which mustn't remove the date (or a first pay with it). Only a field left empty
  // removes it; a date that can't be stored says so and changes nothing (on(value, true) is told, for setup's Next).
  // A date with a part cleared reads as empty too (validity.badInput): left like that, it says so and changes nothing. A
  // field cleared as a whole is saved at once (so leaving the app straight after keeps it).
  function commit(left){var x=i.value;
    if(!x&&paydayPart(i)){if(left){m.textContent=PAYDAY_PART;i.setAttribute("aria-invalid","true")}return}
    if(!x){m.textContent="";i.removeAttribute("aria-invalid");on("");return}
    if(!paydayDateOk(x)){if(left){m.textContent=PAYDAY_BAD;i.setAttribute("aria-invalid","true");on(x,true)}return}
    m.textContent="";i.removeAttribute("aria-invalid");on(x)}
  i.addEventListener("change",function(){commit(document.activeElement!==i||(i.value===""&&!paydayPart(i)))});i.addEventListener("blur",function(){commit(true)});
  w.appendChild(labeled("A recent payday (optional)",i));w.appendChild(h);w.appendChild(m);return w}
/* Step 2: who's paid, and how much. Other regular income is optional, behind a link until there is some. */
function suPay(box,s){
  var c=suCard(box,"su_h_pay","Who gets paid?");
  c.appendChild(el("p","small","Take-home pay is the money that actually reaches your bank account, after tax, National Insurance and pension. It's the ‘net pay’ on a payslip, or check your bank statement."));
  // 2.13: what Dovetail works with (the product's limits), plainly. 2.16: pay can come monthly, every four weeks, every two
  // weeks or weekly (docs/payperiods.md 6.2, Appendix A); and Universal Credit.
  c.appendChild(el("p","small","Dovetail works in pounds. Pay can come monthly, every four weeks, every two weeks or weekly. Paid a different amount each time? Use a typical amount: you'll type what actually arrived."));
  c.appendChild(el("p","small muted","Not employed? Use what you usually receive, such as a pension or self-employed income. Universal Credit is paid monthly: count it as the pay of the person whose account it goes into, and type the amount from your statement each month. No money of your own coming in? Leave it empty."));
  s.people.forEach(function(p,ix){var row=el("div","box");row.setAttribute("role","group");row.setAttribute("aria-label","Person "+(ix+1));var g=el("div","su-pair");
    var n=textIn(p.name,function(v){p.name=v},"su_p_"+ix);n.autocomplete="off";n.placeholder="Person "+(ix+1);g.appendChild(labeled("Name",n));
    // 2.16: "How often they're paid" (every month unless chosen); on a pattern the pay is pay each time, with what that
    // comes to a month underneath.
    var ev=suEvery(p),ab=null;
    g.appendChild(labeled(ev?"Take-home pay each time (£)":"Usual take-home pay (£)",suMoney(p.pay,function(v){p.pay=v;if(ab)sayLater(ab,suAbout(p))},"su_pu_"+ix)));row.appendChild(g);
    row.appendChild(labeled("How often they're paid",selectIn(EVERY_OPTS,ev?String(ev):"",function(v){if(v)p.every=Number(v);else delete p.every;suRedraw("su_pf_"+ix)},"su_pf_"+ix)));
    if(ev){ab=el("div","small muted",suAbout(p));ab.id="su_pm_"+ix;ab.setAttribute("aria-live","polite");row.appendChild(ab);
      // 2.17 (13.2, L15): a recent payday, optional, so Dovetail can count the paydays (setupSettings makes it pattern.on).
      row.appendChild(paydayField("su_pon_"+ix,p.on,function(v){if(v)p.on=v;else delete p.on}))}
    if(s.people.length>1){var x=el("button","btn ghost","Remove");x.setAttribute("aria-label","Remove person "+(ix+1));x.addEventListener("click",function(){s.people.splice(ix,1);suRedraw("su_addp")});
      var xr=el("div","btnrow");xr.appendChild(x);row.appendChild(xr)}
    c.appendChild(row)});
  var add=el("button","linkbtn","+ Add someone");add.id="su_addp";add.addEventListener("click",function(){s.people.push({id:uid("p"),name:"",pay:"",payAccount:null});suRedraw("su_p_"+(s.people.length-1));reveal($("su_p_"+(s.people.length-1)).closest(".box"))});c.appendChild(add);
  function addIncome(){s.income.push({id:uid("i"),name:"",amount:"",account:null});suRedraw("su_in_"+(s.income.length-1));reveal($("su_in_"+(s.income.length-1)).closest(".box"))}
  if(!s.income.length){var ai=el("button","linkbtn su-alone","+ Add other income");ai.id="su_addi";ai.addEventListener("click",addIncome);box.appendChild(ai)}
  else{var c2=suCard(box,"su_h_inc","Any other regular income?","Money that comes in every month besides pay, such as Child Benefit. You'll choose the account it goes into in step 3.");
    s.income.forEach(function(x,ix){var row=el("div","box");row.setAttribute("role","group");row.setAttribute("aria-label","Other income "+(ix+1));var g=el("div","su-pair");
      var n=textIn(x.name,function(v){x.name=v},"su_in_"+ix);n.autocomplete="off";n.placeholder="e.g. Child Benefit";g.appendChild(labeled("Name",n));
      g.appendChild(labeled("Amount a month (£)",suMoney(x.amount,function(v){x.amount=v},"su_inv_"+ix)));row.appendChild(g);
      var rm=el("button","btn ghost","Remove");rm.setAttribute("aria-label","Remove other income "+(ix+1));rm.addEventListener("click",function(){s.income.splice(ix,1);suRedraw("su_addi")});
      var rr=el("div","btnrow");rr.appendChild(rm);row.appendChild(rr);c2.appendChild(row)});
    var more=el("button","linkbtn","+ Add other income");more.id="su_addi";more.addEventListener("click",addIncome);c2.appendChild(more)}
  setupNav(box,{back:true,onNext:function(){var bad=[];
    // 2.16: pay each time is above £0 and up to £1,000,000 (validPattern).
    s.people.forEach(function(p,ix){var r=parseMoney(p.pay,false);if(r.invalid||suEvery(p)&&!r.empty&&r.value>PAY_EACH_MAX)bad.push("su_pu_"+ix)});
    // 2.17: a recent payday is a real date from 2000 to 2099, or left empty.
    var badOn=s.people.map(function(p,ix){return suEvery(p)&&p.on&&!paydayDateOk(p.on)?"su_pon_"+ix:null}).filter(Boolean),partOn=s.people.map(function(p,ix){return suEvery(p)&&paydayPart($("su_pon_"+ix))?"su_pon_"+ix:null}).filter(Boolean);
    if(!bad.length&&partOn.length)return suFail(PAYDAY_PART,partOn);
    if(!bad.length&&badOn.length)return suFail(PAYDAY_BAD,badOn);
    if(bad.length)return suFail(s.people.some(function(p,ix){return suEvery(p)&&bad.indexOf("su_pu_"+ix)>=0})?"Type pay as an amount, like 420.00.":"Type pay as an amount, like 1850.00.",bad);
    var res=readRows(s.income);if(res.errors.length)return suFail("Each income needs a name and an amount a month, like 110.00.",res.errors.map(function(e){return (e.f==="name"?"su_in_":"su_inv_")+e.i}));
    // 2.12.1: only when nobody's pay is in. Someone with no pay of their own (a partner at home, a student) is fine:
    // step 4 asks about them, and the last step says whose pay counts as £0.
    var noPay=s.people.every(function(p){return !(num(p.pay)>0)});
    if(noPay&&!s.payWarned){s.payWarned=true;s.msg="Without pay, Dovetail can't show what's left. You can add it later.";s.note=true;s.bad=[];suRedraw();return}
    s.people.forEach(function(p,ix){p.name=personName(p,ix)});s.income=s.income.filter(rowUsed);goStep(3)}})}

/* Step 3: one payday for the household (the day transfers are made). Skipping it leaves months following the calendar. */
function suNextPayday(pc){var nx=nextPayday(pc);return nx?"Your next payday: "+longDate(nx.date)+". That pay is for "+mLabel(nx.month)+".":""}
function suPaydayCfg(){return setupPayday(setup.payday)}
/* 2.16: setup's people on a pattern, and a person's (7, 14 or 28, or null for every month). */
function suEvery(p){return PAY_EVERY[Number(p&&p.every)]?Number(p.every):null}
function suPats(){return setup?setup.people.filter(suEvery):[]}
/* "About £1,690.00 a month over a year." for what's typed as pay each time ("" until there's an amount). */
function suAbout(p){var v=parseMoney(p.pay,false);return !v.invalid&&v.value>0?aboutWords({pattern:{every:suEvery(p),each:r2(v.value)}}):""}
/* 2.16: step 3 when anyone is on a pattern (6.2): the transfer day, required (no Skip, no "same day" question). */
function suTransferDay(box,s,pats){var pd=s.payday,q=pats[0],mon=s.people.some(function(p){return !suEvery(p)});
  var c=suCard(box,"su_h_day","When will you make the transfers?");
  var it=el("p","small",mon?possessive(personName(q,s.people.indexOf(q)))+" pay comes every "+PAY_EVERY[suEvery(q)].word+", so its date moves each month. Pick one day a month to make the transfers: Dovetail counts the pay that's arrived since the last one. Most households pick the monthly payday."
    :"Pick one day a month to make the transfers: Dovetail counts the pay that's arrived since the last one. A day just before your rent or mortgage goes out works well.");it.id="su_day_intro";c.appendChild(it);
  c.appendChild(labeled("Transfer day",selectIn([["","Choose a day"]].concat(DAY_OPTS),String(pd.day||""),function(v){pd.day=v;suRedraw("su_day")},"su_day")));
  if(pd.day&&pd.day!=="last")c.appendChild(checkIn("If it falls on a weekend or bank holiday, do it on the working day before",pd.weekend!==false,function(v){pd.weekend=v;suRedraw("su_wk")},"su_wk"));
  var nx=pd.day?nextPayday(suPaydayCfg()):null;if(nx){var nl=el("div","banner good","Your next transfer day: "+longDate(nx.date)+". It's for "+mLabel(nx.month)+".");nl.id="su_next_payday";c.appendChild(nl)}
  // 2.17 (13.2, L15): with a recent payday, each person's last pay by then: "Kerry's last pay before then: Thursday 15
  // October." (two: "…: Thursday 15 October, and Jordan's: Friday 23 October.").
  var nb=c.querySelector("#su_next_payday");if(nb){var lt=lastPayWords({people:s.people.map(function(q){var e=suEvery(q);return {name:q.name,pattern:e&&paydayDateOk(q.on)?{every:e,each:1,on:q.on}:undefined}})},nx.date);
    if(lt)nb.appendChild(document.createTextNode(" "+lt))}
  setupNav(box,{back:true,onNext:function(){if(!pd.day)return suFail("Choose a transfer day.",["su_day"]);delete s.skip[3];enterAccounts();goStep(4)}})}
function suPayday(box,s){var multi=s.people.length>1,pd=s.payday,pats=suPats();if(pats.length)return suTransferDay(box,s,pats);
  var c=suCard(box,"su_h_day","When does pay arrive?");
  if(multi){var fs=segRadios("su_same",s.people.length===2?"Are you both paid on the same day?":"Are you all paid on the same day?",[["yes","Yes"],["no","No"]],s.sameDay===true?"yes":s.sameDay===false?"no":"",function(v){s.sameDay=v==="yes";suRedraw("su_same_"+v)});
    fs.classList.add("su-q");fs.querySelector(".segrow").classList.add("two");c.appendChild(fs)}
  if(!multi||s.sameDay!=null){
    var opts=[["","Choose a day"]];for(var i=1;i<=31;i++)opts.push([String(i),ordinal(i)+" of the month"]);opts.push(["last","Last working day of the month"]);
    c.appendChild(labeled(multi&&s.sameDay===false?"Pick the day you'll make the transfers, once everyone's pay is in.":"Payday",selectIn(opts,String(pd.day||""),function(v){pd.day=v;suRedraw("su_day")},"su_day")));
    if(pd.day&&pd.day!=="last")c.appendChild(checkIn(multi&&s.sameDay===false?"If it falls on a weekend or bank holiday, do it on the working day before":"If it falls on a weekend or bank holiday, we're paid the working day before",pd.weekend!==false,function(v){pd.weekend=v;suRedraw("su_wk")},"su_wk"));
    var line=pd.day?suNextPayday(suPaydayCfg()):"";if(line){var nl=el("div","banner good",line);nl.id="su_next_payday";c.appendChild(nl)}}
  setupNav(box,{back:true,skip:function(){s.skip[3]=true;enterAccounts();goStep(4)},onNext:function(){delete s.skip[3];enterAccounts();goStep(4)}})}

/* Step 4: accounts, and how money moves between them. A starting point fills in the accounts (setupShape in calc.js);
   they can then be renamed, added, removed and re-pointed. Each person must be paid into an account. */
function enterAccounts(){var s=setup;if(s.shape&&!s.edited)applyShape();else fixSetupRefs()}
/* 2.12: the words for the questions at the top of the accounts step, for two people or more. */
var STYLE_TEXT={pool:["Putting it all together","All our pay goes towards the bills, spending and saving together."],
  contribute:["Each paying into a joint account","We each pay our share of the shared costs into a joint account, and keep the rest."],
  housekeeping:["One of us paying the bills","One of us pays the bills from their own account, and the others send them a share."],
  separate:["Each paying certain bills","We each pay some of the bills from our own account. There's no joint account."],
  other:["Something else","Start with one account and build it yourself."]};
function ruleText(rule,n,acct){return {equal:n>2?["Equal shares","You all pay the same."]:["Half each","You each pay the same."],
  pay:["In proportion to pay","Whoever earns more pays more: you each pay the same share of your pay."],
  sameLeft:["So we each keep the same","Whoever earns more pays more, so you're each left with the same amount."],
  set:["Set amounts","You each pay an amount you agree, whatever the bills. "+acct+" builds up or runs short."]}[rule]}
var SETUP_RULES=["equal","pay","sameLeft","set"];
/* A choice drawn as cards with a title and a line under it (real radio buttons underneath), like the starting points. */
function suChoice(c,o){var fs=el("fieldset","su-shapes su-q");fs.setAttribute("role","radiogroup");fs.appendChild(el("legend","lbl",o.legend));
  o.options.forEach(function(x){var l=el("label","su-shape"),r=el("input");r.type="radio";r.name=o.name;r.id=o.name+"_"+x[0];r.value=x[0];r.checked=o.value===x[0];
    r.addEventListener("change",function(){if(r.checked)o.on(x[0],r.id)});
    var b=el("span","su-shape-b t");b.appendChild(el("span","su-radio"));var t=el("span","su-shape-t");t.appendChild(el("b",null,x[1]));if(x[2])t.appendChild(el("span",null,x[2]));b.appendChild(t);
    l.appendChild(r);l.appendChild(b);fs.appendChild(l)});
  c.appendChild(fs);return fs}
/* A yes-or-no question (segRadios) with an amount box under it when the answer is yes. */
function suYesNo(c,id,q,val,on,labels){var fs=segRadios(id,q,labels||[["no","No"],["yes","Yes"]],val||"",function(v){on(v);suReshape(id+"_"+v)});
  fs.classList.add("su-q");fs.querySelector(".segrow").classList.add("two");c.appendChild(fs);return fs}
function suAmountIn(c,label,v,on,id){var w=labeled(label,suMoney(v,function(x){on(x);suSyncFunding();suRefreshDia()},id));w.classList.add("su-amt");c.appendChild(w);return w}
/* The diagram, redrawn in place when an amount changes. */
function suRefreshDia(){var old=$("su_dia");if(old&&setup.accounts.length)old.parentNode.replaceChild(suDiagramBox(suCfg()),old)}
/* With two or more people: how the household manages its money, then only the questions that follow from it. */
function suMoneyQuestions(c,s){var a=s.ans,ppl=suPeople(),n=ppl.length,nm=function(i){return ppl[i].name};
  c.appendChild(el("p",null,"Every household does this differently. Dovetail sets up your accounts from your answers, and you can change them afterwards."));
  suChoice(c,{name:"su_style",legend:"In our house we manage our money by\u2026",value:s.style,options:SETUP_STYLES.map(function(k){return [k].concat(STYLE_TEXT[k])}),
    on:function(v,id){s.style=v;suReshape(id)}});
  var hasPay=s.people.filter(function(p){return num(p.pay)>0}),earner=hasPay[0];
  if(s.style==="pool"){
    c.appendChild(el("p",null,"Each payday, pay lands in an account. That account pays its own bills first. Whatever's left moves on to the next account, and so on. The last account keeps what's left over: your money for the month."));
    suPictures(c,s,SETUP_SHAPES.filter(function(k){return k!=="other"}),"How does pay reach the joint account?");
    if(!s.change)suYesNo(c,"su_fun","Does each of you keep some spending money for yourselves?",a.fun,function(v){a.fun=v});
    // Not for someone paying board: what they keep is theirs anyway (2.12.1).
    if(a.fun==="yes"&&!s.change)s.people.forEach(function(p,i){if(suBoarder(p,i))return;suAmountIn(c,possessive(nm(i))+" spending money a month (\u00a3)",a.funAmt[p.id],function(x){a.funAmt[p.id]=x},"su_funv_"+i)});
    if(a.fun==="yes"&&!s.change)c.appendChild(el("p","small muted","It stays in each person's own account (or comes out of the joint account) before the rest is shared."))}
  if(s.style==="housekeeping")suChoice(c,{name:"su_payer",legend:"Who pays the bills?",value:a.payer==null?null:String(s.people.map(function(p){return p.id}).indexOf(a.payer)),
    options:ppl.map(function(p,i){return [String(i),p.name]}),on:function(v,id){a.payer=s.people[Number(v)].id;suReshape(id)}});
  if(s.style==="contribute"||s.style==="housekeeping"){var acctName=s.style==="contribute"?"The joint account":"Their account";
    // A bill payer with no pay can't pay half (2.12.1): "Half each" isn't offered then.
    var pp=s.style==="housekeeping"&&a.payer?s.people.filter(function(p){return p.id===a.payer})[0]:null,noHalf=suNoHalf(),one=suOneEarner();
    if(noHalf&&a.rule==="equal")a.rule=null;
    // 2.13: only one of them has pay, so the split can't change anything: not asked (the diagram says who pays what).
    if(one){var on=el("p","small muted","Only "+personName(one,s.people.indexOf(one))+" has pay of their own, so there's nothing to split.");on.id="su_oneearner";c.appendChild(on)}
    var rc=one?null:suChoice(c,{name:"su_rule",legend:s.style==="contribute"?"How do you split the shared costs?":"How do you split the bills?",value:a.rule,
      options:SETUP_RULES.filter(function(r){return !(noHalf&&r==="equal")}).map(function(r){return [r].concat(ruleText(r,n,acctName))}),on:function(v,id){a.rule=v;suSyncFunding();suRedraw(id)}});
    if(noHalf){var nh=el("p","small muted",personName(pp,s.people.indexOf(pp))+" has no pay of their own, so \u201c"+ruleText("equal",n,acctName)[0]+"\u201d isn't offered: they'd have nothing to pay their share from.");nh.id="su_nohalf";rc.setAttribute("aria-describedby","su_nohalf");rc.parentNode.insertBefore(nh,rc.nextSibling)}
    // Set amounts: one each for those with pay, but not the bill payer (they pay what's left to pay, from their own
    // account) or anyone paying board (they have a board amount instead).
    if(a.rule==="set"&&!one)s.people.forEach(function(p,i){if(earner&&!(num(p.pay)>0))return;if(s.style==="housekeeping"&&p.id===a.payer)return;if(suBoarder(p,i))return;
      suAmountIn(c,nm(i)+" pays a month (\u00a3)",a.set[p.id],function(x){a.set[p.id]=x},"su_set_"+i)});
    if(s.style==="contribute")suYesNo(c,"su_two","Do you keep bills and spending in separate joint accounts?",a.two,function(v){a.two=v})}
  // Someone with no pay of their own (a carer, a student…): money from the earner, as a transfer to their account.
  if(earner&&["contribute","housekeeping","separate"].indexOf(s.style)>=0)s.people.forEach(function(p,i){if(num(p.pay)>0||p.id===a.payer)return;
    suYesNo(c,"su_gets_"+i,"Does "+nm(i)+" get money from "+personName(earner,s.people.indexOf(earner))+" each month?",a.gets[p.id],function(v){a.gets[p.id]=v;suSyncFunding()});
    if(a.gets[p.id]==="yes")suAmountIn(c,"How much a month (\u00a3)",a.getsAmt[p.id],function(x){a.getsAmt[p.id]=x},"su_getsv_"+i)});
  // Board: with three or more, anyone but the first can pay a set amount instead of sharing.
  if(n>2&&["pool","contribute","housekeeping"].indexOf(s.style)>=0){var bh=el(s.change?"h5":"h3",null,"Everyone in the household");bh.id="su_h_board";c.appendChild(bh);
    var bx=el("p","small muted",BOARD_IS+" Someone who pays board keeps the rest of their pay.");bx.id="su_board_is";c.appendChild(bx);
    s.people.forEach(function(p,i){if(!i)return;suYesNo(c,"su_board_"+i,"Is "+nm(i)+" part of the shared money, or do they pay board?",a.board[p.id],function(v){a.board[p.id]=v},[["no","Part of it"],["yes","Pays board"]]);
      if(a.board[p.id]==="yes")suAmountIn(c,possessive(nm(i))+" board a month (\u00a3)",a.boardAmt[p.id],function(x){a.boardAmt[p.id]=x},"su_boardv_"+i)})}}
/* The starting-point pictures (one person, or how pay reaches the joint account when pooling). */
function suPictures(c,s,kinds,legend){var fs=el("fieldset","su-shapes");fs.setAttribute("role","radiogroup");fs.appendChild(el("legend","lbl",legend));
  var words=SHAPE_TEXT[s.people.length>1?"more":"one"],ppl=suPeople();
  kinds.forEach(function(kind){var l=el("label","su-shape"),r=el("input");r.type="radio";r.name="su_shape";r.id="su_shape_"+kind;r.value=kind;r.checked=s.pool===kind;
    r.addEventListener("change",function(){if(r.checked){s.pool=kind;suReshape("su_shape_"+kind)}});
    var b=el("span","su-shape-b");b.appendChild(el("span","su-radio"));b.appendChild(miniDiagram(setupShape(kind,ppl),ppl));
    var t=el("span","su-shape-t");t.appendChild(el("b",null,words[kind][0]));t.appendChild(el("span",null,words[kind][1]));b.appendChild(t);
    l.appendChild(r);l.appendChild(b);fs.appendChild(l)});
  c.appendChild(fs)}
function suAccounts(box,s){var multi=s.people.length>1;suSyncFunding();
  var c=suCard(box,"su_h_move",multi?(s.change?"How do you manage it now?":"How do you manage your money?"):"How does your money move?");
  if(multi)suMoneyQuestions(c,s);
  else{c.appendChild(el("p",null,"Each payday, pay lands in an account. That account pays its own bills first. Whatever's left moves on to the next account, and so on. The last account keeps what's left over: your money for the month."));
    suPictures(c,s,SETUP_SHAPES,"Pick a starting point")}
  if(s.pending){var pb=el("div","banner col");pb.id="su_replace";var q=el("div",null,"Replace the accounts below?");q.setAttribute("role","alert");pb.appendChild(q);
    var br=el("div","btnrow"),y=el("button","btn","Replace them"),n=el("button","btn ghost","Keep mine");y.id="su_replace_yes";n.id="su_replace_no";
    // Afterwards, focus goes back to the question that was answered: on the new answer, or the one put back.
    var grp=String(s.pendingFocus||"").replace(/_[^_]+$/,"");
    y.addEventListener("click",function(){applyShape();suRedraw(s.pendingFocus)});
    n.addEventListener("click",function(){suKeepMine();suRedraw();var r=grp&&document.querySelector('#'+suBoxId()+' input[name="'+grp+'"]:checked');if(r)try{r.focus({preventScroll:true})}catch(e){}});br.appendChild(y);br.appendChild(n);pb.appendChild(br);c.appendChild(pb)}
  // What the choice means comes first (the diagram), then the details to check. Nothing until the questions are answered.
  if(s.accounts.length&&suKind()){
    var sc=suCfg(),order=flowOrder(sc),nm=function(id){return (accById(sc,id)||{}).name||""},opts=order.map(function(id){return [id,nm(id)]});
    c.appendChild(suDiagramBox(sc));
    var c2=suCard(box,"su_h_check","Check your accounts",s.change?"Accounts you remove close when the change starts, and new ones open then. Earlier months keep them as they were.":"Rename them to match your bank, if you like. You can change all of this later in Settings.");
    var wb=el("div","box su-where");wb.setAttribute("role","group");wb.setAttribute("aria-labelledby","su_h_where");var wh=el(s.change?"h5":"h3",null,"Where does each pay arrive?");wh.id="su_h_where";wb.appendChild(wh);
    s.people.forEach(function(p,ix){wb.appendChild(labeled(possessive(personName(p,ix))+" pay goes into",selectIn(opts,p.payAccount,function(v){p.payAccount=v;s.edited=true;suRedraw("su_pa_"+ix)},"su_pa_"+ix)))});
    if(!s.change)s.income.forEach(function(x,ix){if(!String(x.name||"").trim())return;wb.appendChild(labeled(x.name.trim()+" goes into",selectIn(opts,x.account,function(v){x.account=v;x.picked=true;s.edited=true;suRedraw("su_ia_"+ix)},"su_ia_"+ix)))});
    c2.appendChild(wb);
    order.forEach(function(id,pos){var a=suAcct(id),ix=s.accounts.indexOf(a),b=el("div","box su-acct");b.setAttribute("role","group");b.setAttribute("aria-label","Account "+(pos+1));b.style.setProperty("--c",colourVar(a.colour));
      // "Account name" and a quiet "Remove" share a line.
      var top=el("div","su-acct-top"),nl=el("label","lbl","Account name");nl.htmlFor="su_a_"+ix;top.appendChild(nl);
      if(s.accounts.length>1){var x=el("button","linkbtn su-rm","Remove");x.type="button";x.setAttribute("aria-label","Remove account "+(pos+1));x.addEventListener("click",function(){removeSetupAccount(a);suRedraw("su_adda")});top.appendChild(x)}
      b.appendChild(top);
      var ni=textIn(a.name,function(v){a.name=v;s.edited=true;suRefreshNames(a)},"su_a_"+ix);ni.autocomplete="off";ni.placeholder="Account "+(ix+1);b.appendChild(ni);
      var who=s.people.map(function(p,i){return p.payAccount===id?possessive(personName(p,i))+" pay":null}).concat(s.income.map(function(x){return x.account===id&&String(x.name||"").trim()?x.name.trim():null})).filter(Boolean);
      var pin=el("div","su-paidin");pin.appendChild(el("span","lbl","Paid in here:"));
      if(who.length){var ul=el("ul","chips");who.forEach(function(w){ul.appendChild(el("li","chip",w))});pin.appendChild(ul)}else pin.appendChild(el("span","small muted","nobody's pay"));b.appendChild(pin);
      var fp=fundingPeople(sc,id);if(fp.length){var fw=el("p","small su-fund",fundingWords(accById(sc,id).funding,fp,"it",id));fw.id="su_fund_"+ix;b.appendChild(fw)}
      var bad=[id].concat(descendants(sc,id)),lo=[["","…stays here (this is your left over)"]].concat(order.filter(function(x){return bad.indexOf(x)<0}).map(function(x){return [x,"…moves to "+nm(x)]}));
      b.appendChild(labeled("When this account's bills are paid, what's left…",selectIn(lo,parentId(sc,id)||"",function(v){a.leftoverTo=v||null;s.edited=true;suRedraw("su_l_"+ix)},"su_l_"+ix)));
      c2.appendChild(b)});
    var add=el("button","linkbtn","+ Add an account");add.id="su_adda";add.addEventListener("click",function(){var na={id:uid("a"),name:"",colour:COLOURS[s.accounts.length%COLOURS.length][0],leftoverTo:suRoot(suCfg())};
      s.accounts.push(na);s.edited=true;suRedraw("su_a_"+(s.accounts.length-1));reveal($("su_a_"+(s.accounts.length-1)).closest(".box"))});c2.appendChild(add)}
  setupNav(box,{back:!s.change,onNext:function(){var a=s.ans,kind=suKind();
    if(multi&&!s.style)return suFail("Choose how you manage your money first. “Something else” starts you with one account.",["su_style_pool"]);
    if(!kind||!s.accounts.length)return suFail(multi?"Choose how pay reaches the joint account.":"Pick how your money moves first. “Something else” starts you with one account.",["su_shape_joint"]);
    if(s.pending)return suFail("Choose whether to replace the accounts below first.",["su_replace_yes"]);
    if(s.style==="housekeeping"&&multi&&!a.payer)return suFail("Choose who pays the bills.",["su_payer_0"]);
    if((s.style==="contribute"||s.style==="housekeeping")&&multi&&!a.rule&&!suOneEarner())return suFail("Choose how you split "+(s.style==="contribute"?"the shared costs.":"the bills."),[suNoHalf()?"su_rule_pay":"su_rule_equal"]);
    var badAmt=[].slice.call(document.querySelectorAll("#"+suBoxId()+" .su-amt input")).filter(function(i){var r=parseMoney(i.value,false);return r.empty||r.invalid}).map(function(i){return i.id});
    if(badAmt.length)return suFail("Type each amount a month, like 300.00.",badAmt);
    var names=s.accounts.map(suAcctName);s.accounts.forEach(function(a,i){a.name=names[i]});s.pending=null;
    var order=flowOrder(suCfg());s.accounts.sort(function(a,b){return order.indexOf(a.id)-order.indexOf(b.id)});fixSetupRefs();
    if(s.change){goStep(8);return}
    enterBills();goStep(5)}})}
/* The diagram, the worked example and, when more than one account keeps what's left, a plain note. */
function suDiagramBox(sc){var dg=el("div","box su-dia");dg.id="su_dia";var dh=el(setup&&setup.change?"h5":"h3",null,"How money moves between them");dh.id="su_h_dia";dg.appendChild(dh);dg.appendChild(flowDiagram(sc,"su_h_dia"));
  var ex=suExample(sc);if(ex){var ep=el("p","small",ex);ep.id="su_example_line";dg.appendChild(ep)}
  // 2.16 (E17): one person on a pattern with the pay, bills and spending picture: setupSettings saves Bills → pay account
  // → Spending, so say why the money moves that way.
  var e17=suE17();if(e17){var en=el("p","small",e17);en.id="su_e17";dg.appendChild(en)}
  // Own accounts that each keep what's left (2.12) are the point of those answers, so no note for them.
  // 2.13: a boarder's own account isn't counted: their money isn't shown as the household's left over.
  var out=boarderAccounts(sc),roots=rootIds(sc).filter(function(id){return !out[id]}).length;if(roots>1&&["contribute","housekeeping","separate"].indexOf(setup.shape)<0){var rn=NUMBER_WORDS[roots]||String(roots),cap=rn.charAt(0).toUpperCase()+rn.slice(1);var mr=el("div","banner",cap+" accounts keep what's left, so you'll see "+rn+" left-over amounts. That's fine if it's what you want.");mr.id="su_roots";dg.appendChild(mr)}
  return dg}
/* 2.16 (E17): the line under the picture for one person on a pattern with a pay, bills and spending account, else "". */
function suE17(){var s=setup;if(!s||s.change||s.people.length!==1||s.shape!=="split")return "";var q=s.people[0],ev=suEvery(q);if(!ev)return "";
  var role=function(r){return s.accounts.filter(function(a){return a.role===r})[0]},pa=role("pay"),bi=role("bills"),sp=role("spending");
  if(!pa||!bi||!sp||q.payAccount!==pa.id||pa.leftoverTo!==bi.id||bi.leftoverTo!==sp.id||sp.leftoverTo)return "";
  var nm=personName(q,0);return "Because "+nm+" is paid every "+PAY_EVERY[ev].word+", "+suAcctName(bi)+" is topped up from "+suAcctName(pa)+" each month, and what's left goes on to "+suAcctName(sp)+"."}
/* An account renamed: its name in every list and in the diagram, without redrawing the field being typed in. */
function suRefreshNames(a){var name=suAcctName(a);
  var b="#"+suBoxId()+" ";document.querySelectorAll(b+'select[id^="su_pa_"] option,'+b+'select[id^="su_ia_"] option,'+b+'select[id^="su_l_"] option').forEach(function(o){
    if(o.value===a.id)o.textContent=(o.parentNode.id.indexOf("su_l_")===0?"\u2026moves to ":"")+name});
  var old=$("su_dia");if(old)old.parentNode.replaceChild(suDiagramBox(suCfg()),old)}
/* The worked example under the diagram (setupExample, calc.js), from the pay typed in step 2 and this month's bills
   typed for each account. */
function suExample(sc){var s=setup,m=mNum(thisMonthFor()),bills={},bc=Object.assign({bills:[],income:[]},sc);
  // 2.16: someone on a pattern counts as setupSettings saves them: pay each time, and usual pay over a year ÷ 12.
  var c={accounts:sc.accounts,people:sc.people.map(function(p,i){var q=s.people[i],x=Object.assign({},p,{usualPay:num(q.pay)}),ev=suEvery(q);delete x.pattern;
    if(ev&&num(q.pay)>0){x.pattern={every:ev,each:r2(num(q.pay))};x.usualPay=usualMonthly(x)}return x})};
  // 2.14: with a rough figure, the account's bills that month are what's not listed yet plus the listed bills due (5.2).
  Object.keys(s.bills).concat(Object.keys(s.figures||{})).forEach(function(id){if(bills.hasOwnProperty(id))return;var it=readRows(s.bills[id]||[]).items;
    bills[id]=it.reduce(function(t,x){return applies({months:x.months},m)?t+x.amount:t},0);
    var f=s.skip[5]||!accById(sc,id)||estimateBlock(bc,id)?null:parseMoney((s.figures||{})[id],false);
    if(f&&!f.empty&&!f.invalid&&f.value>0)bills[id]+=Math.max(0,f.value-it.reduce(function(t,x){return inFigure({months:x.months})?t+x.amount:t},0))});
  return setupExample(c,bills)}
function thisMonthFor(){return defaultMonth(setup.skip[3]?{}:suPaydayCfg())}

/* Step 5: bills, account by account in flow order. The usual bills accounts (nobody's paid into them and they pass what's
   left on) open with three rows; with none, the account everyone is paid into if it passes what's left on (one person's
   "bills account, then a spending account"), else the account that keeps what's left. The others are a line until opened.
   2.14 (docs/onboarding.md 5.1 to 5.5 and 5.10): two links at the top, "Paste a list" and "Not sure of every bill? Start
   with a rough figure"; help behind "How do I find my bills?"; in each section a running total and "Add a rough figure for
   the rest" (not where estimateBlock says no: setup says why instead); the suggestions grouped; someone's own account a
   slim line with its own few suggestions; and a card at the end for bills that don't come every month (its rows are kept
   with their account's, marked nm, so they're saved and checked like the others). A household that lists everything sees
   two links and a running total, and taps no more than before. Nothing records which way a household chose. */
function enterBills(){var s=setup,sc=suCfg(),order=flowOrder(sc),paid=sc.people.map(function(p){return p.payAccount});
  var match=order.filter(function(id){return paid.indexOf(id)<0&&parentId(sc,id)});if(!match.length)match=[sharedPayAccount(sc)||suRoot(sc)];
  // 2.12: an account several people pay for is where the bills go; when each pays certain bills, every own account opens.
  var shared=sharedFundedAccount(sc);if(shared)match=[shared];if(s.shape==="separate")match=order.slice();
  order.forEach(function(id){if(s.billOpen[id]===undefined){s.billOpen[id]=match.indexOf(id)>=0;
    if(s.billOpen[id]&&!(s.bills[id]||[]).length)s.bills[id]=[newBillRow(),newBillRow(),newBillRow()]}})}
/* Suggestions: plain buttons. One hides once a row in its section has that name, whether it was tapped or typed
   (suChipsRefresh runs as names are typed). */
function suChips(sec,names,rows,label,onPick){var g=el("div","fchips su-chips");g.setAttribute("role","group");g.setAttribute("aria-label",label);
  names.forEach(function(n){g.appendChild(suChipBtn(n,n,function(){onPick(n)}))});
  sec.appendChild(g);suChipsRefresh(g,rows);return g}
/* One suggestion: "+ " (hidden from screen readers) and its label; data-name is the name it fills in, which hides it. */
function suChipBtn(label,name,on){var b=el("button","fchip"),pl=el("span",null,"+ ");pl.setAttribute("aria-hidden","true");b.appendChild(pl);b.appendChild(document.createTextNode(label));b.type="button";
  b.setAttribute("data-name",String(name).trim().toLowerCase());b.addEventListener("click",on);return b}
function suChipsRefresh(g,rows){var taken=takenNames(rows),any=false;
  g.querySelectorAll("button[data-name]").forEach(function(b){var t=taken.indexOf(b.getAttribute("data-name"))>=0;b.hidden=t;if(!t)any=true});g.hidden=!any}
function takenNames(rows){return rows.map(function(r){return String(r.name||"").trim().toLowerCase()}).filter(Boolean)}
/* 2.14: someone's own account, in a household of two or more (only they are paid into it), except when each pays certain
   bills, where every account is a bills account, and the usual bills account (a bill payer's own, say). Its section
   suggests its own few bills (5.10). */
function suOwn(sc,id){return setup.people.length>1&&setup.shape!=="separate"&&sc.people.filter(function(p){return p.payAccount===id}).length===1&&id!==defaultBillAccount(sc)}
/* The household so far, as estimateBlock reads it (5.9: no figure on a boarder's own account, nor on someone's own account
   under "what's left after own bills" or "so we each keep the same"), and setup's words for why. */
function suFigCfg(){suSyncFunding();return Object.assign({bills:[],income:[],budgets:[],savings:[]},suCfg())}
function suFigWhy(why){return why==="board"?"A rough figure isn't offered here: it's their own money, outside the household's figures.":why?"With this split, list your own bills so the shares are fair.":""}
/* A section's bills as typed so far (rows that can be saved): how many, what they come to a month (a yearly bill as a
   twelfth), and listed: those that come in 7 or more months a year, which a rough figure covers (inFigure). */
function suBillSums(rows){var it=readRows(rows).items;return {n:it.length,monthly:it.reduce(function(t,x){return t+x.amount*(x.months.length?x.months.length:12)/12},0),
  listed:r2(it.reduce(function(t,x){return inFigure({months:x.months})?t+x.amount:t},0))}}
/* The running total ("Joint: 14 bills, £1,642.30 a month") and, with a figure, a note when the bills listed already come to
   more than it: redrawn in place as amounts are typed (never the whole step, which would move focus). */
function suBillLive(id){var s=setup,a=suAcct(id);if(!a)return;var ai=s.accounts.indexOf(a),name=suAcctName(a),sm=suBillSums(s.bills[id]||[]),t=$("su_b_"+ai+"_tot");
  if(t){t.textContent=sm.n?name+": "+plural(sm.n,"bill")+", "+fmt(sm.monthly)+" a month":"";t.hidden=!sm.n}
  var n=$("su_fig_"+ai+"_n");if(n){var f=parseMoney(s.figures[id],false),over=!f.empty&&!f.invalid&&f.value>0&&sm.listed>f.value;
    n.textContent=over?"Your bills here already add up to "+fmt(sm.listed)+", more than the "+fmt(f.value)+" you put. Raise the figure if there are more to come, or leave it out.":"";n.hidden=!over}}
/* The check against what's moved into the account now (5.2; setup only, never saved): when the figure is well below it
   (by £20 and 5% or more), ask once whether the rest is bills too. "Yes, it's bills" makes the figure that amount. */
function suFigAsk(id){var s=setup,a=suAcct(id);if(!a)return;var ai=s.accounts.indexOf(a),name=suAcctName(a),box=$("su_figask_"+ai);if(!box)return;clear(box);
  var f=parseMoney(s.figures[id],false),m=parseMoney(s.figIn[id],false);if(s.figAsked[id]||f.empty||f.invalid||m.empty||m.invalid||!(f.value>0))return;
  var gap=r2(m.value-f.value);if(!(gap>=20&&gap>=m.value*0.05))return;
  var w=el("div","banner col"),q=el("div",null,"You move "+fmt(m.value)+" into "+name+" but put "+fmt(f.value)+" for bills. Is the other "+fmt(gap)+" for bills too?");q.id="su_figask_"+ai+"_q";
  w.setAttribute("role","group");w.setAttribute("aria-labelledby",q.id);w.appendChild(q);
  var br=el("div","btnrow"),y=el("button","btn","Yes, it's bills"),n=el("button","btn ghost","No, it's spending");y.type=n.type="button";y.id="su_figask_"+ai+"_yes";n.id="su_figask_"+ai+"_no";
  y.addEventListener("click",function(){s.figures[id]=m.value.toFixed(2);s.figAsked[id]="yes";suRedraw("su_fig_"+ai)});
  n.addEventListener("click",function(){s.figAsked[id]="no";suRedraw("su_figin_"+ai)});br.appendChild(y);br.appendChild(n);w.appendChild(br);box.appendChild(w)}
/* The figure box in an account's section (5.2): the question, what to count, the figure, rounding up, "Do this together"
   with two or more people, the check against what's moved in now, and "No bills from here" while nothing is listed. */
function suFigBox(s,id,ai,name,rows,own){var fid="su_fig_"+ai,b=el("div","box su-fig");b.id="su_figbox_"+ai;b.setAttribute("role","group");b.setAttribute("aria-labelledby",fid+"_l");
  var q=el("label","su-figq","Roughly how much goes out of "+name+" in bills each month?");q.id=fid+"_l";q.htmlFor=fid;b.appendChild(q);
  var hp=el("p","small","Count what leaves by itself: direct debits, standing orders and subscriptions. Count Council Tax as monthly. Leave out bills that come only a few times a year; they have their own question below. Food and fuel come later, as spending.");hp.id=fid+"_h";b.appendChild(hp);
  var mb=el("div","money su-figmoney");mb.appendChild(el("span",null,"£"));var inp=el("input");inp.id=fid;inp.inputMode="decimal";inp.autocomplete="off";inp.placeholder="0.00";inp.value=s.figures[id]||"";
  inp.setAttribute("aria-describedby",fid+"_h "+fid+"_r");inp.setAttribute("enterkeyhint","next");
  inp.addEventListener("input",function(){s.figures[id]=inp.value;suBillLive(id)});
  inp.addEventListener("change",function(){var r=parseMoney(inp.value,false);if(!r.empty&&!r.invalid)inp.value=r.value.toFixed(2);s.figures[id]=inp.value;suBillLive(id);suFigAsk(id)});
  mb.appendChild(inp);b.appendChild(mb);
  var rp=el("p","small muted","Round up if you're unsure: anything over stays in the account. You can change it any time.");rp.id=fid+"_r";b.appendChild(rp);
  if(s.people.length>1&&!own)b.appendChild(el("p","small","Do this together if you can. One of you may know the joint bills better."));
  var nt=el("p","small su-fignote");nt.id=fid+"_n";nt.hidden=true;b.appendChild(nt);
  var an=textIn(s.figIn[id]||"",function(v){s.figIn[id]=v},"su_figin_"+ai,true);an.placeholder="0.00";
  an.addEventListener("change",function(){s.figIn[id]=an.value;suFigAsk(id)});
  var aw=labeled("Already move a set amount into "+name+" each month? (optional, £)",an);aw.classList.add("su-amt");b.appendChild(aw);
  var ask=el("div","su-figask");ask.id="su_figask_"+ai;ask.setAttribute("aria-live","polite");b.appendChild(ask);
  var br=el("div","btnrow su-figbtns");
  if(!rows.some(function(r){return !r.nm&&rowUsed(r)})){var nb=el("button","btn ghost","No bills from here");nb.type="button";nb.id=fid+"_none";
    nb.addEventListener("click",function(){delete s.figOpen[id];delete s.figures[id];delete s.figIn[id];s.bills[id]=rows.filter(function(r){return r.nm||rowUsed(r)});s.billOpen[id]=false;s.noBills[id]=true;suRedraw("su_b_"+ai+"_open")});br.appendChild(nb)}
  var off=el("button","linkbtn","Don't use a rough figure");off.type="button";off.id=fid+"_off";
  off.addEventListener("click",function(){delete s.figOpen[id];delete s.figures[id];delete s.figIn[id];suRedraw("su_b_"+ai+"_fig")});br.appendChild(off);b.appendChild(br);
  return b}
/* A bills section's suggestions: the six most common (in someone's own account, its own few), then the groups, one open
   at a time (5.5). With a figure open they double as "Did your figure include…?". Returns the chip groups, for
   suChipsRefresh as names are typed. pick(name, options) fills a row. */
function suBillChips(sec,s,id,ai,name,rows,own,fig,pick){var out=[],first=BILL_SUGGESTIONS.filter(function(x){return own?x[1].own:x[1].top}),lid="su_b_"+ai+"_cl";
  if(fig){var l=el("p","small su-chiplbl","Did your figure include…?");l.id=lid;sec.appendChild(l)}
  var g=el("div","fchips su-chips");g.setAttribute("role","group");if(fig)g.setAttribute("aria-labelledby",lid);else g.setAttribute("aria-label","Common bills paid from "+name);
  first.forEach(function(x){g.appendChild(suChipBtn(x[0],x[0],function(){pick(x[0],x[1])}))});sec.appendChild(g);out.push(g);
  var open=s.chipGrp[id],mr=el("div","su-more");mr.setAttribute("role","group");mr.setAttribute("aria-label","More bills paid from "+name+", by kind");
  var ml=el("span","small muted","More:");ml.setAttribute("aria-hidden","true");mr.appendChild(ml);
  BILL_GROUPS.forEach(function(gr){var rest=BILL_SUGGESTIONS.filter(function(x){return x[1].g===gr[0]&&first.indexOf(x)<0});if(!rest.length)return;
    var b=el("button","fchip su-cgrp",gr[1]);b.type="button";b.id="su_b_"+ai+"_g_"+gr[0];b.setAttribute("aria-expanded",open===gr[0]?"true":"false");if(open===gr[0])b.setAttribute("aria-controls","su_b_"+ai+"_gc");
    b.addEventListener("click",function(){s.chipGrp[id]=open===gr[0]?null:gr[0];suRedraw(b.id)});mr.appendChild(b)});
  sec.appendChild(mr);
  var gr=open&&BILL_GROUPS.filter(function(x){return x[0]===open})[0];
  if(gr){var gc=el("div","fchips su-chips su-gchips");gc.id="su_b_"+ai+"_gc";gc.setAttribute("role","group");gc.setAttribute("aria-label",gr[1]+" bills");
    BILL_SUGGESTIONS.filter(function(x){return x[1].g===open&&first.indexOf(x)<0}).forEach(function(x){gc.appendChild(suChipBtn(x[0],x[0],function(){pick(x[0],x[1])}))});sec.appendChild(gc);out.push(gc)}
  out.forEach(function(x){suChipsRefresh(x,rows)});return out}
/* "How do I find my bills?": the help, one tap away rather than on screen (5.1). */
function suFindHelp(box,s){var b=el("button","linkbtn su-find","How do I find my bills?");b.type="button";b.id="su_find";b.setAttribute("aria-expanded",s.findOpen?"true":"false");b.setAttribute("aria-controls","su_find_tip");
  b.addEventListener("click",function(){s.findOpen=!s.findOpen;suRedraw("su_find")});box.appendChild(b)}
function suFindTip(){var tip=el("div","su-tip");tip.id="su_find_tip";tip.appendChild(document.createTextNode("Most banking apps list an account's direct debits and standing orders together: check the account each one comes out of. Or look at last month's bank statement. Payments marked DD (Direct Debit) or SO (Standing Order) are usually regular bills."));return tip}
function suBills(box,s){
  var sc=suCfg(),bc=suFigCfg(),order=flowOrder(sc),ai=function(id){return s.accounts.indexOf(suAcct(id))},shown=function(id){return s.billOpen[id]||(s.bills[id]||[]).some(function(r){return !r.nm})};
  box.appendChild(el("p",null,"Add the bills that go out regularly. Rough amounts are fine: you can change them any time."));
  // The two links (5.1): paste a list; start with a rough figure (every section a figure can go in that isn't open yet).
  var figFor=order.filter(function(id){return shown(id)&&!estimateBlock(bc,id)}),lk=el("div","su-toplinks");
  var pl=el("button","linkbtn","Paste a list");pl.type="button";pl.id="su_paste_open";pl.setAttribute("aria-expanded",s.paste?"true":"false");if(s.paste)pl.setAttribute("aria-controls","su_paste");
  pl.addEventListener("click",function(){s.paste=s.paste?null:{text:"",res:null,rows:[]};suRedraw(s.paste?"su_paste_text":"su_paste_open")});lk.appendChild(pl);
  if(figFor.some(function(id){return !s.figOpen[id]})){var fa=el("button","linkbtn","Not sure of every bill? Start with a rough figure");fa.type="button";fa.id="su_fig_all";
    fa.addEventListener("click",function(){figFor.forEach(function(id){s.figOpen[id]=true});suRedraw("su_fig_"+ai(figFor[0]))});lk.appendChild(fa)}
  suFindHelp(lk,s);box.appendChild(lk);if(s.findOpen)box.appendChild(suFindTip());
  if(s.paste){var accts=order.map(function(id){return [id,suAcctName(suAcct(id))]}),existing=[];order.forEach(function(id){readRows(s.bills[id]||[]).items.forEach(function(x){existing.push({name:x.name,amount:x.amount})})});
    box.appendChild(pasteBox(s.paste,{idp:"su_paste",card:true,heading:"h2",accts:accts,def:defaultBillAccount(sc)||order[0],existing:existing,redraw:suRedraw,
      onClose:function(){s.paste=null;suRedraw("su_paste_open")},
      onAdd:function(list){var cleared={};list.forEach(function(x){var rows=s.bills[x.account]||(s.bills[x.account]=[]);
          if(!cleared[x.account]){cleared[x.account]=1;s.bills[x.account]=rows=rows.filter(function(r){return r.nm||rowUsed(r)})}
          rows.push({name:x.name,amount:x.amount.toFixed(2),freq:x.freq,month:x.month||"",picked:arr(x.picked).slice()});s.billOpen[x.account]=true;delete s.noBills[x.account]});
        s.paste=null;suRedraw("su_paste_open");toast("Added "+plural(list.length,"bill"))}}))}
  order.forEach(function(id){var a=suAcct(id),ai=s.accounts.indexOf(a),name=suAcctName(a),rows=s.bills[id]||(s.bills[id]=[]),bid=function(i,f){return "su_b_"+ai+"_"+i+"_"+f};
    var mine=[];rows.forEach(function(r,i){if(!r.nm)mine.push(i)});var own=suOwn(sc,id),why=estimateBlock(bc,id),fig=!!s.figOpen[id]&&!why;
    // A suggestion fills the first empty row (or a new one) and opens the section.
    function pick(n,pre){var i=-1;mine.forEach(function(j){if(i<0&&!rowUsed(rows[j]))i=j});if(i<0){rows.push(newBillRow());i=rows.length-1}
      rows[i].name=n;if(pre&&pre.freq){rows[i].freq=pre.freq;if(pre.picked)rows[i].picked=pre.picked.slice()}s.billOpen[id]=true;delete s.noBills[id];
      suRedraw(bid(i,pre&&pre.freq==="yearly"?"m":"a"));var e=$(bid(i,"n"));if(e)reveal(e.closest(".qa-row"))}
    // Accounts that aren't usually for bills (enterBills) and have none yet are one line each, opened in place. Someone's own
    // account has its own few suggestions on the line (5.10): one opens it with that bill filled in.
    if(!s.billOpen[id]&&!mine.length){var ln=el("div","su-bline");ln.style.setProperty("--c",colourVar(a.colour));ln.appendChild(el("b",null,name));
      var dash=el("span","muted","—");dash.setAttribute("aria-hidden","true");ln.appendChild(dash);
      if(s.noBills[id])ln.appendChild(el("span","small muted su-nobills","no bills ·"));
      var op=el("button","linkbtn","+ Add a bill");op.type="button";op.id="su_b_"+ai+"_open";op.setAttribute("aria-label","Add a bill paid from "+name);
      op.addEventListener("click",function(){s.billOpen[id]=true;delete s.noBills[id];rows.push(newBillRow());suRedraw(bid(rows.length-1,"n"))});ln.appendChild(op);
      if(own){var oc=el("div","fchips su-chips su-linechips");oc.setAttribute("role","group");oc.setAttribute("aria-label","Common bills paid from "+name);
        BILL_SUGGESTIONS.filter(function(x){return x[1].own}).forEach(function(x){oc.appendChild(suChipBtn(x[0],x[0],function(){pick(x[0],x[1])}))});ln.appendChild(oc)}
      box.appendChild(ln);return}
    var sec=suCard(box,"su_h_b"+ai,"Paid from "+name);sec.classList.add("su-bsec");sec.style.setProperty("--c",colourVar(a.colour));
    if(fig){sec.appendChild(suFigBox(s,id,ai,name,rows,own));if(!own)sec.appendChild(el("p","small su-big","Add the big ones now if you know them: rent or mortgage, Council Tax, energy. The rest can wait."))}
    var chips=suBillChips(sec,s,id,ai,name,rows,own,fig,pick),live=function(){chips.forEach(function(g){suChipsRefresh(g,rows)});suBillLive(id)};
    var hdr=el("div","qa-head");hdr.setAttribute("aria-hidden","true");hdr.appendChild(el("span",null,"Bill name"));hdr.appendChild(el("span",null,"Amount (£)"));sec.appendChild(hdr);
    var list=el("div","qa-rows");mine.forEach(function(i,n){var r=rows[i];list.appendChild(quickRow(r,{id:function(f){return bid(i,f)},noun:"Bill",n:n+1,group:"Bill "+(n+1)+", paid from "+name,freq:true,
      onFreq:function(){suRedraw(bid(i,"f"))},onName:live,onAmount:live,
      onEnter:function(){if(n===mine.length-1){rows.push(newBillRow());suRedraw(bid(rows.length-1,"n"))}else $(bid(mine[n+1],"n")).focus()},
      onRemove:function(){rows.splice(i,1);var m2=mine.filter(function(j){return j!==i}).map(function(j){return j>i?j-1:j});suRedraw(m2.length?bid(m2[Math.min(n,m2.length-1)],"n"):"su_b_"+ai+"_more")}}))});sec.appendChild(list);
    var more=el("button","linkbtn","+ Add another bill");more.id="su_b_"+ai+"_more";more.setAttribute("aria-label","Add another bill paid from "+name);more.addEventListener("click",function(){rows.push(newBillRow());suRedraw(bid(rows.length-1,"n"))});sec.appendChild(more);
    var tot=el("p","small su-total");tot.id="su_b_"+ai+"_tot";tot.hidden=true;sec.appendChild(tot);
    // 5.1: a rough figure for the rest, reached by a link; where it isn't offered, why.
    if(why){var wn=el("p","small muted",suFigWhy(why));wn.id="su_b_"+ai+"_nofig";sec.appendChild(wn)}
    else if(!fig){var fl=el("p","small su-figlink");fl.appendChild(document.createTextNode("Not sure you've got them all? "));var fb=el("button","linkbtn","Add a rough figure for the rest");fb.type="button";fb.id="su_b_"+ai+"_fig";
      fb.setAttribute("aria-label","Not sure you've got them all? Add a rough figure for the rest of the bills paid from "+name);
      fb.addEventListener("click",function(){s.figOpen[id]=true;suRedraw("su_fig_"+ai)});fl.appendChild(fb);sec.appendChild(fl)}
    suBillLive(id);if(fig)suFigAsk(id)});
  suNotEvery(box,s,sc,order);
  box.appendChild(el("p","small muted","Renewal dates, reminders and categories can be added later in Settings › Bills."));
  setupNav(box,{back:true,skip:function(){s.skip[5]=true;enterSpend();goStep(6)},onNext:function(){var bad=[],why={};
    s.accounts.forEach(function(a,ai){var rows=s.bills[a.id]||[];readRows(rows).errors.forEach(function(e){var f=e.f==="months"?rows[e.i].freq:e.f;why[f==="name"?"amount":f]=1;
      bad.push("su_b_"+ai+"_"+e.i+"_"+(e.f==="name"?"n":e.f==="amount"?"a":"m"))});
      // 2.14: a rough figure that isn't an amount.
      if(s.figOpen[a.id]&&!estimateBlock(bc,a.id)){var f=parseMoney(s.figures[a.id],false);if(f.invalid||(!f.empty&&f.value<0)){why.figure=1;bad.push("su_fig_"+ai)}}});
    if(bad.length)return suFail([why.amount&&"Each bill needs a name and an amount like 42.50.",why.yearly&&"Choose the month each yearly bill is paid in.",why.some&&"Pick at least one month for each bill paid in some months.",why.figure&&"Type the rough figure as an amount a month, like 1500.00."].filter(Boolean).join(" "),bad);
    delete s.skip[5];enterSpend();goStep(6)}})}
/* 5.3: "Any bills that don't come every month?" at the end of the step, for every household, whether it lists its bills or
   gives a rough figure. A suggestion adds a row (paid from the usual bills account); each row says the account it's paid
   from, and changing it moves the row there. */
function suNotEvery(box,s,sc,order){var c=suCard(box,"su_h_nm","Any bills that don't come every month?"),def=defaultBillAccount(sc)||order[0],all=[];c.id="su_nm";
  order.forEach(function(id){(s.bills[id]||[]).forEach(function(r,i){if(r.nm)all.push({id:id,i:i,r:r})})});
  var taken=all.map(function(x){return x.r}),g=el("div","fchips su-chips");g.setAttribute("role","group");g.setAttribute("aria-label","Bills that don't come every month");
  var focusChips=function(){var b=document.querySelector("#su_nm .su-chips button:not([hidden])")||$("su_next");if(b)try{b.focus({preventScroll:true})}catch(e){}};
  NM_SUGGESTIONS.forEach(function(x){g.appendChild(suChipBtn(x[0],x[1],function(){var rows=s.bills[def]||(s.bills[def]=[]),r=newBillRow();r.nm=true;r.name=x[1];r.freq=x[2];rows.push(r);
    var ai=s.accounts.indexOf(suAcct(def));suRedraw("su_b_"+ai+"_"+(rows.length-1)+"_"+(x[2]==="yearly"?"m":"a"))}))});
  c.appendChild(g);suChipsRefresh(g,taken);
  if(all.length){var opts=order.map(function(id){return [id,suAcctName(suAcct(id))]}),list=el("div","qa-rows");
    var hdr=el("div","qa-head");hdr.setAttribute("aria-hidden","true");hdr.appendChild(el("span",null,"Bill name"));hdr.appendChild(el("span",null,"Amount (£)"));c.appendChild(hdr);
    all.forEach(function(x,n){var ai=s.accounts.indexOf(suAcct(x.id)),bid=function(f){return "su_b_"+ai+"_"+x.i+"_"+f};x.r.account=x.id;
      list.appendChild(quickRow(x.r,{id:bid,noun:"Bill",n:n+1,group:"Bill that doesn't come every month, "+(n+1)+" of "+all.length,freq:true,acct:opts.length>1?opts:null,acctLabel:"Paid from",acctShown:true,
        onFreq:function(){suRedraw(bid("f"))},onName:function(){suChipsRefresh(g,taken);suBillLive(x.id)},onAmount:function(){suBillLive(x.id)},
        onAcct:function(v){var from=s.bills[x.id];from.splice(from.indexOf(x.r),1);var to=s.bills[v]||(s.bills[v]=[]);to.push(x.r);suRedraw("su_b_"+s.accounts.indexOf(suAcct(v))+"_"+(to.length-1)+"_s")},
        onEnter:function(){var f=$(bid(x.r.freq==="yearly"?"m":"f"));if(f)f.focus()},
        onRemove:function(){var from=s.bills[x.id];from.splice(from.indexOf(x.r),1);suRedraw();focusChips()}}))});
    c.appendChild(list)}
  c.appendChild(el("p","small muted","Not sure of the month? Add it when the renewal letter comes."))}

/* Step 6: spending budgets and savings transfers. 2.14 (docs/onboarding.md 5.10): drawn by account, as the bills step is
   ("Kept in Joint account", "Sent from Alex's account"), so a row's account is where it's typed rather than a select. The
   account shared spending goes to (sharedSpendAccount) is open, with the suggestions; each person's own account, and any
   other account that keeps what's left, is a line until something is added there. In a household that pays into a joint
   account, or where one of them pays the bills, each person's own account offers "Alex's spending money". Rows in the
   shared account follow the answers if they're changed (fixSetupRefs); rows added in another account stay there (picked). */
function enterSpend(){var s=setup,sc=suCfg(),to=sharedSpendAccount(sc)||suRoot(sc);if(!s.budgets.length)s.budgets.push(newRow(to));if(!s.savings.length)s.savings.push(newRow(to));fixSetupRefs()}
function suSpend(box,s){var sc=suCfg(),order=flowOrder(sc),root=sharedSpendAccount(sc)||suRoot(sc),nm=function(id){return (accById(sc,id)||{}).name||""};
  var paid=sc.people.map(function(p){return p.payAccount}),roots=rootIds(sc),fun=s.people.length>1&&(s.style==="contribute"||s.style==="housekeeping");
  function list(rows,o){var c=suCard(box,"su_h_"+o.key,o.title,o.intro),rid=function(i,f){return "su_"+o.key+"_"+i+"_"+f};
    var chips=suChips(c,o.chips,rows.filter(function(r){return r.account===root}),"Common "+o.title.toLowerCase(),function(n){var i=-1;rows.forEach(function(r,j){if(i<0&&r.account===root&&!rowUsed(r))i=j});
      if(i<0){rows.push(newRow(root));i=rows.length-1}rows[i].name=n;suRedraw(rid(i,"a"))});
    order.forEach(function(id){var a=suAcct(id),ai=s.accounts.indexOf(a),name=nm(id),idx=[];rows.forEach(function(r,i){if(r.account===id)idx.push(i)});
      if(id!==root&&!idx.length&&paid.indexOf(id)<0&&roots.indexOf(id)<0)return;
      var where=o.where+" "+name,addId="su_add"+o.key+(id===root?"":"_"+ai);
      // "Alex's spending money": someone's own money to spend, kept in their own account.
      var own=fun&&o.key==="g"&&id!==root?s.people.filter(function(p,pi){return p.payAccount===id&&!suBoarder(p,pi)}):[];
      function add(n,f){var r=newRow(id);if(id!==root)r.picked=true;if(n)r.name=n;rows.push(r);suRedraw(rid(rows.length-1,f||"n"))}
      var addBtn=function(){var b=el("button","linkbtn",o.add);b.type="button";b.id=addId;b.setAttribute("aria-label",o.add.replace(/^\+ /,"")+" "+where.charAt(0).toLowerCase()+where.slice(1));b.addEventListener("click",function(){add()});return b};
      var ownChips=function(sec,rs){if(!own.length)return null;var g=el("div","fchips su-chips su-ownchips");g.setAttribute("role","group");g.setAttribute("aria-label","Suggestions "+where.charAt(0).toLowerCase()+where.slice(1));
        own.forEach(function(p){var t=possessive(personName(p,s.people.indexOf(p)))+" spending money";g.appendChild(suChipBtn(t,t,function(){var i=-1;idx.forEach(function(j){if(i<0&&!rowUsed(rows[j]))i=j});
          if(i<0)add(t,"a");else{rows[i].name=t;suRedraw(rid(i,"a"))}}))});sec.appendChild(g);suChipsRefresh(g,rs);return g};
      if(id!==root&&!idx.length){var ln=el("div","su-bline su-gline");ln.setAttribute("data-acct",name);ln.setAttribute("data-ai",String(ai));ln.style.setProperty("--c",colourVar(a.colour));ln.appendChild(el("b",null,where));
        var dash=el("span","muted","—");dash.setAttribute("aria-hidden","true");ln.appendChild(dash);ln.appendChild(addBtn());ownChips(ln,[]);c.appendChild(ln);return}
      var g=el("div","box su-grp");g.id="su_grp_"+o.key+"_"+ai;g.setAttribute("role","group");g.setAttribute("data-acct",name);g.setAttribute("data-ai",String(ai));g.style.setProperty("--c",colourVar(a.colour));
      var h=el("h3",null,where);h.id="su_h_"+o.key+"_"+ai;g.setAttribute("aria-labelledby",h.id);g.appendChild(h);
      var mineRows=idx.map(function(i){return rows[i]}),oc=ownChips(g,mineRows);
      var hdr=el("div","qa-head");hdr.setAttribute("aria-hidden","true");hdr.appendChild(el("span",null,"Name"));hdr.appendChild(el("span",null,"A month (£)"));g.appendChild(hdr);
      var l=el("div","qa-rows");idx.forEach(function(i,n){var r=rows[i];l.appendChild(quickRow(r,{id:function(f){return rid(i,f)},noun:o.noun,n:n+1,group:o.noun+" "+(n+1)+", "+where.charAt(0).toLowerCase()+where.slice(1),namePh:o.ph,
        onName:function(){if(id===root)suChipsRefresh(chips,rows.filter(function(x){return x.account===root}));if(oc)suChipsRefresh(oc,mineRows)},
        onEnter:function(){if(n===idx.length-1)add();else $(rid(idx[n+1],"n")).focus()},
        onRemove:function(){rows.splice(i,1);var m2=idx.filter(function(j){return j!==i}).map(function(j){return j>i?j-1:j});suRedraw(m2.length?rid(m2[Math.min(n,m2.length-1)],"n"):addId)}}))});g.appendChild(l);
      g.appendChild(addBtn());c.appendChild(g)});
    c.appendChild(el("p","small muted",o.after))}
  list(s.budgets,{key:"g",title:"Spending budgets",noun:"Budget",ph:"e.g. Food shopping",where:"Kept in",add:"+ Add a budget",chips:BUDGET_SUGGESTIONS,
    intro:"Money set aside each month for everyday spending, like food shopping or fuel. Setting an amount helps day-to-day spending stay clear of your bill money.",
    after:"Not sure how much? Look at what you spent last month and start there. You can adjust it as you go."});
  list(s.savings,{key:"v",title:"Savings transfers",noun:"Savings transfer",ph:"e.g. Emergency fund",where:"Sent from",add:"+ Add a savings transfer",chips:SAVINGS_SUGGESTIONS,
    intro:"Money you move to a savings account each payday, before it gets spent. Even a small amount adds up.",
    after:"Many people start with an emergency fund: money for unexpected costs, like a broken boiler."});
  setupNav(box,{back:true,skip:function(){s.skip[6]=true;goStep(7)},onNext:function(){var bad=[];
    [["g",s.budgets],["v",s.savings]].forEach(function(x){readRows(x[1]).errors.forEach(function(e){bad.push("su_"+x[0]+"_"+e.i+"_"+(e.f==="name"?"n":"a"))})});
    if(bad.length)return suFail("Each one needs a name and an amount a month, like 150.00.",bad);
    delete s.skip[6];goStep(7)}})}

/* Step 7: the first payday, worked out from the household finishSetup will save, with each person's usual pay. With a
   payday, the month the next payday pays for (suFirstMonth); without one, the month the app opens on. */
function suFirstMonth(pc){var nx=nextPayday(pc);return nx?nx.month:defaultMonth(pc)}
function suPreview(box,s){var info={},c=setupResult(undefined,info),nx=nextPayday(c.payday),k=suFirstMonth(c.payday),pay={},any=false,pat=hasPatterns(c);
  // 2.16: the pay the first month plans on (planPay): usual pay, or pay each time × the paydays every month has.
  var pl=planPay(c,{},k);c.people.forEach(function(p){pay[p.id]=pl[p.id].used;if(pay[p.id]>0)any=true});
  // With no pay at all, the transfers are worked out with a large figure for everyone, just to show their order.
  var big={};c.people.forEach(function(p){big[p.id]=1e6});var r=calc(c,mNum(k),any?pay:big,[]),nm=function(id){var a=accById(c,id);return a?a.name:""};
  var unl={},said={};c.accounts.forEach(function(a){var x=r.A[a.id];if(x&&x.unlisted>0.004)unl[a.id]=x.unlisted});
  var card=suCard(box,"su_h_first","Transfers to make, in this order");
  if(nx){var fp=el("p","su-firstday",(pat?"Your first transfer day: ":"Your first payday: ")+longDate(nx.date)+", for "+mLabel(k)+".");fp.id="su_first";card.appendChild(fp)}
  if(any||!nx){var lead=el("p",null,nx?"With the pay you entered:":any?"For "+mLabel(k)+", with the pay you entered:":"For "+mLabel(k)+":");lead.id="su_for";card.appendChild(lead)}
  if(!any){var np=el("div","banner","Add pay to see real amounts.");np.id="su_nopay";card.appendChild(np)}
  // 2.13: the preview works from usual pay, so someone without any has no pay of their own (not pay that isn't in yet).
  else{var missing=c.people.filter(function(p){return !(pay[p.id]>0)}).map(function(p){return p.name});
    if(missing.length)card.appendChild(el("p","small muted",listAnd(missing)+(missing.length>1?" have":" has")+" no pay of their own, so it counts as £0."))}
  var ol=el("ol","su-tlist");ol.id="su_transfers";
  r.steps.forEach(function(st){var li=el("li"),rt=el("span","r");rt.appendChild(acctTagIn(c,st.from));var ar=el("span","arr","→");ar.setAttribute("aria-hidden","true");rt.appendChild(ar);rt.appendChild(el("span","sr"," to "));
    if(st.to)rt.appendChild(acctTagIn(c,st.to));else rt.appendChild(el("span","acct",st.toText));li.appendChild(rt);if(any)li.appendChild(moneyEl(Math.abs(st.amt),"v"));
    // 2.14: the first transfer into an account with a rough figure says what's in it that isn't listed yet.
    if(any&&st.to&&unl[st.to]&&!said[st.to]){said[st.to]=1;var fn=el("span","small muted su-tnote","Includes "+fmt(unl[st.to])+" of bills not listed yet.");fn.id="su_fig_note_"+safeId(st.to);li.appendChild(fn)}ol.appendChild(li)});
  if(!r.steps.length)ol.appendChild(el("li","small muted",r.floats.length>1?"No transfers needed: each account keeps its own money.":"No transfers needed: everything stays in "+nm(c.accounts[0].id)+"."));
  card.appendChild(ol);
  // An account with a figure that no transfer goes into (pay arrives there): said under the list.
  if(any)Object.keys(unl).forEach(function(id){if(said[id])return;var p=el("p","small muted",possessive(nm(id))+" bills include "+fmt(unl[id])+" not listed yet.");p.id="su_fig_note_"+safeId(id);card.appendChild(p)});
  if(info.figureNotes.length){var fns=el("p","small muted",info.figureNotes.join(" "));fns.id="su_fignotes";card.appendChild(fns)}
  if(any){var lf=el("div","su-left"+(r2(r.flt)<0?" neg":""));lf.id="su_left";lf.appendChild(el("span","lbl","Left over"));lf.appendChild(moneyEl(r.flt,"hv"));
    lf.appendChild(el("span","small muted",r.floats.length===1?"in "+nm(r.floats[0].id):listAnd(r.floats.map(function(f){return fmt(f.amt)+" in "+nm(f.id)}))));
    // 2.13: an account short is named as the Pay tab's top card names it ("Joint account is short by £450.00"), even
    // when the total is fine: one account's shortfall mustn't hide behind another's left over.
    var shortBy=shortNamed(r)?shortAccounts(r):[],ks=personKeeps(c,r);
    shortBy.forEach(function(s){var k=ks.filter(function(x){return x.p.payAccount===s.id})[0],w=el("span","hwarn",(k?k.p.name||"Someone":nm(s.id))+" is short by "+fmt(s.amount));w.id="su_short_"+safeId(s.id);lf.appendChild(w)});
    card.appendChild(lf);
    var setShort=shortBy.some(function(s){var a=accById(c,s.id),f=a&&a.funding;return isObj(f)&&(f.rule==="set"||isObj(f.set))}),shared=c.accounts.some(function(a){return isObj(a.funding)});
    var sb=shortBy.length?el("div","banner bad","You can "+(setShort?"raise the set amounts, ":shared?"change how the shared costs are split, ":"")+"trim a budget or a bill, or carry on and adjust later.")
      :r2(r.flt)<0?el("div","banner bad","That's "+fmt(-r.flt)+" short. You can trim a budget or a bill, or carry on and adjust later."):null;
    if(sb){sb.id="su_short";card.appendChild(sb)}
    // 2.16: standing orders from each pay that cover these transfers every month.
    if(pat){var so=standingOrders(c,{},k),sw=[];c.people.forEach(function(p){if(so[p.id])sw=sw.concat(so[p.id].orders.map(orderWords))});
      if(sw.length){var sp=el("p","small","From your next pay, standing orders of "+listAnd(sw)+" cover these transfers every month. This month, make them as usual.");sp.id="su_so";card.appendChild(sp)}}}
  var how=suCard(box,"su_h_how","What happens each "+dayWord(c));var hl=el("ol","su-how");

  [['<path d="M4 7h16v10H4z"/><path d="M12 10v4M10 12h4"/>',"Type the pay that arrived."],['<path d="M4 7h13l-3-3M20 17H7l3 3"/>',"Make these transfers in your banking app."],
   ['<path d="M5 12.5l4.5 4.5L19 7.5"/>',"Tick each one off in Dovetail. What's left over is yours to spend for the month."]].forEach(function(x){var li=el("li"),ic=el("span","ic");
    ic.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+x[0]+'</svg>';li.appendChild(ic);li.appendChild(el("span",null,x[1]));hl.appendChild(li)});
  how.appendChild(hl);
  setupNav(box,{back:true,next:"Looks right, start",nextId:"su_finish",onNext:function(){finishSetup(true)},later:false})}
function acctTagIn(c,id){var a=accById(c,id),s=el("span","acct"),d=el("span","dot");d.style.setProperty("--c",colourVar(a&&a.colour));s.appendChild(d);s.appendChild(document.createTextNode(a?a.name:""));return s}

/* The money-flow diagram: accounts in flow order, as cards joined by "what's left" arrows, with the pay that arrives
   above each and a badge on the account that keeps what's left. An ordered list whose items each carry a plain sentence
   (flowStory) for screen readers; the drawing is hidden from them. Accounts that all feed the next one sit side by side,
   two at most to a row, when there's room (400px and normal text, in CSS), otherwise one under another, with "→ moves
   to …" under any whose next card isn't where its money goes. Account colours are a border only: names are always written. */
function flowDiagram(c,labelId){var story=flowStory(c),ol=el("ol","fd"),depth={},rows={};if(labelId)ol.setAttribute("aria-labelledby",labelId);else ol.setAttribute("aria-label","How money moves between your accounts");
  story.forEach(function(x){var d=accountDepth(c,x.id);depth[x.id]=d;(rows[d]=rows[d]||[]).push(x)});
  // Side by side only when each row's accounts all move to the one account in the row below (no lines would cross), and
  // no row has more than two: three or more cards in a row leave too little room for their names and pay.
  var side=Object.keys(rows).every(function(d){d=Number(d);if(rows[d].length>2)return false;if(!d)return true;var tos=rows[d].map(function(x){return x.to});
    return tos.every(function(t){return t===tos[0]})&&(rows[d-1]||[]).length===1});
  if(side)ol.classList.add("side");
  story.forEach(function(x,i){var a=accById(c,x.id),li=el("li",x.to?(story[i+1]&&story[i+1].id===x.to?"adj":""):"root");li.style.setProperty("--c",colourVar(a&&a.colour));li.style.setProperty("--k",String(rows[depth[x.id]].length));
    li.appendChild(el("span","sr",x.text));var v=el("div","fd-v");v.setAttribute("aria-hidden","true");
    if(x.arrives.length||x.shares.length){var ins=el("div","fd-in");x.arrives.forEach(function(w){ins.appendChild(el("span","chip",w))});x.shares.forEach(function(w){ins.appendChild(el("span","chip share",w))});v.appendChild(ins)}
    var cd=el("div","fd-card");cd.appendChild(el("b",null,(a&&a.name)||""));if(!x.to)cd.appendChild(el("span","fd-keep","Keeps what's left: "+x.keep));v.appendChild(cd);
    // 2.12: contributions from this account (a share, or a set amount) into accounts others pay for too.
    x.paysInto.forEach(function(t){v.appendChild(el("div","fd-pays","\u2192 pays into "+((accById(c,t)||{}).name||"")))});
    if(x.to){var ar=el("div","fd-arrow");ar.appendChild(el("span","fd-ah","↓"));ar.appendChild(el("span",null,"what's left"));v.appendChild(ar);
      v.appendChild(el("div","fd-to","→ moves to "+((accById(c,x.to)||{}).name||"")))}
    li.appendChild(v);ol.appendChild(li)});
  return ol}
/* A tiny decorative version for the starting-point cards (hidden from screen readers; the card's words say it all). */
function miniDiagram(sh,people){var c={accounts:sh.accounts,people:people.map(function(p){return {id:p.id,name:p.name,payAccount:sh.payAccount[p.id]}})},rows={},max=0;
  sh.accounts.forEach(function(a){var d=accountDepth(c,a.id);max=Math.max(max,d);(rows[d]=rows[d]||[]).push(a)});
  var m=el("span","mini");m.setAttribute("aria-hidden","true");
  for(var d=max;d>=0;d--){var r=el("span","mrow");rows[d].forEach(function(a){var i=el("i",d?"":"keep");i.style.setProperty("--c",colourVar(a.colour));r.appendChild(i)});m.appendChild(r);if(d)m.appendChild(el("span","marr","↓"))}
  return m}

/* The household setup will save, from setup's answers (calc.js setupSettings, which the simulation uses too): what was
   entered, with defaults for anything not reached or skipped. Rows that can't be saved (a name with no amount, say) are
   left out; info.dropped (when info is given) counts them, leaving out steps that were skipped. Used for the first-payday
   preview and by finishSetup. Savings transfers start ("since") in the month the Pay tab first opens on: the next
   payday's month when fromPreview is true (after "Looks right, start"), otherwise the month the app opens on as usual. */
function setupResult(fromPreview,info){suSyncFunding();var r=setupSettings(setup,cfg,{schema:SCHEMA,version:VERSION,fromPreview:fromPreview});
  if(info){info.dropped=r.dropped;info.figureNotes=r.figureNotes||[]}return r.cfg}
/* One way out of setup, for "Looks right, start", "Finish later" and "Skip setup for now". After "Looks right, start"
   the Pay tab opens once on the month the preview showed (the next payday's); afterwards, and after Finish later, the
   app opens on defaultMonth as usual. Rows that weren't complete are left out, and a message says so, once the tour
   (which starts straight away) has ended. */
var setupNote=null;
function droppedText(n){return n===1?"One row wasn't complete, so it was left out. You can add it in Settings.":n+" rows weren't complete, so they were left out. You can add them in Settings."}
function finishLater(){finishSetup(false)}
function finishSetup(fromPreview){var info={};if(setup&&setup.change)return; // never from "Change how you manage your money"
  cfg=setupResult(fromPreview,info);months={};setup=null;restoreOffer=null;whatsNew=false;hideUndo();saveCfg(true);saveMonths();paySig=peopleSig();
  try{history.replaceState(null,"","#pay")}catch(e){}monthKey=fromPreview===true?suFirstMonth(payCfg()):defaultMonth(payCfg());route();goMonth(monthKey);
  queueNativeBackup(0);
  // A new household gets the tour straight away (it says what to do next, so no "All set" message).
  // 2.14: a rough figure that wasn't kept (already covered by the bills listed, or not offered with this split) says so.
  var note=[info.dropped?droppedText(info.dropped):null].concat(info.figureNotes||[]).filter(Boolean).join(" ")||null;
  if(cfg.tourDone===false){setupNote=note;startTour()}else toast(note||(cfg.bills.length?"All set. "+plural(cfg.bills.length,"bill")+" added.":"All set."))}
/* A made-up household for exploring. Flagged as an example: never backed up, and "Set up my own household" wipes it.
   It comes with three saved months, a renewal and a one-off next month, so every Analysis section has something to show. */
function loadExample(){
  var c={schema:SCHEMA,setupDone:true,example:true,
    people:[{id:"alex",name:"Alex",payAccount:"a1",usualPay:2150},{id:"sam",name:"Sam",payAccount:"a2",usualPay:1875}],
    accounts:[{id:"a1",name:"Alex's current account",colour:"blue",leftoverTo:"bills"},{id:"a2",name:"Sam's current account",colour:"teal",leftoverTo:"bills"},
      {id:"bills",name:"Joint bills account",colour:"purple",leftoverTo:"spend"},{id:"spend",name:"Joint spending account",colour:"orange",leftoverTo:null}],
    bills:[{id:"x1",name:"Mobile phone",amount:18,account:"a1",months:[]},{id:"x2",name:"Mobile phone",amount:12,account:"a2",months:[]},{id:"x3",name:"Gym",amount:32,account:"a2",months:[],renews:plusDays(20),lead:30},
      {id:"x4",name:"Mortgage",amount:925,account:"bills",months:[]},{id:"x5",name:"Council Tax",amount:168,account:"bills",months:[4,5,6,7,8,9,10,11,12,1]},
      {id:"x6",name:"Energy",amount:118,account:"bills",months:[],renews:plusDays(120),lead:45,history:[{on:plusDays(-245),date:plusDays(120),from:104,to:118}]},
      {id:"x7",name:"Broadband",amount:34,account:"bills",months:[]},{id:"x8",name:"Water",amount:41,account:"bills",months:[]},
      {id:"x9",name:"Car insurance",amount:420,account:"bills",months:[3],renews:plusDays(150),lead:30},
      {id:"x10",name:"TV Licence",amount:174.5,account:"spend",months:[6]},{id:"x11",name:"Streaming",amount:10.99,account:"spend",months:[]},
      {id:"x12",name:"Music",amount:11.99,account:"spend",months:[]},{id:"x13",name:"Junior ISA",amount:50,account:"bills",months:[],savings:true}],
    income:[{id:"i1",name:"Child Benefit",amount:110,account:"spend"}],
    budgets:[{id:"g1",name:"Food",amount:520,account:"spend"},{id:"g2",name:"Fuel",amount:160,account:"spend"},{id:"g3",name:"General living",amount:380,account:"spend"}],
    savings:[{id:"s1",name:"Holiday pot",amount:150,fromAccount:"spend"},{id:"s2",name:"Emergency fund",amount:100,fromAccount:"spend"}],
    reminders:[{id:"r1",name:"Car MOT",date:plusDays(40),lead:30,yearly:true}],doneLog:[],payday:{day:28,weekend:true},appearance:cfg&&cfg.appearance,lastVersion:VERSION};
  cfg=normCfg(c);cfg.bills.forEach(function(b){applyCategorySuggestion(b)});
  months={};var k0=defaultMonth(payCfg()),extra=[[-12,0],[35,0],[0,42.5]];
  [-3,-2,-1].forEach(function(o,j){var k=shiftMonth(k0,o),pay={alex:2150+extra[j][0],sam:1875+extra[j][1]},r=calc(cfg,mNum(k),pay,[]),done={};
    r.steps.forEach(function(st){if(!(j===1&&st.id==="s:s2"))done[st.id]=r2(st.amt)});
    months[k]={month:k,pay:pay,done:done,oneOffs:[],updatedAt:new Date().toISOString()}});
  var nk=shiftMonth(k0,1);months[nk]={month:nk,pay:{alex:null,sam:null},done:{},oneOffs:[{id:"o1",kind:"out",name:"Car service",amount:185,account:"bills",date:nk+"-12"}]};
  setup=null;restoreOffer=null;hideUndo();saveCfg(true);saveMonths();paySig=peopleSig();
  try{history.replaceState(null,"","#pay")}catch(e){}monthKey=k0;route();goMonth(monthKey)}

/* ---------- help: "What's this?" buttons, the help sheet and Settings › Help (2.6) ----------
   A small round "?" next to a heading opens a bottom sheet with a plain explanation. Since 2.9.1 only "Saved so far"
   has one: the tour, Settings › Help and the charts' own keys and figures explain the rest. The sheet is a modal dialog: focus starts on its title and stays inside it,
   Esc, Close, a tap outside it and the phone's Back button close it, and focus goes back to the "?" that opened it. */
var lastR=null;  // the calculation for the month on screen, as the Pay tab last drew it
function fig(t){return el("p","fig",t)}
var HELP={
  saved:{ask:"What does saved so far show?",title:"Saved so far",body:function(){return ["What you've put into savings: the savings transfers you ticked, and bills marked as savings.",
      "Only months where you typed pay or ticked a transfer are counted.","Tax years run from 6 April to 5 April."]}}};
function helpBtn(key){var h=HELP[key],b=el("button","helpq");b.type="button";b.setAttribute("aria-label",h.ask);b.setAttribute("aria-haspopup","dialog");b.setAttribute("data-help",key);
  var q=el("span",null,"?");q.setAttribute("aria-hidden","true");b.appendChild(q);b.addEventListener("click",function(){openHelp(key,b)});return b}
function openHelp(key,from){var h=HELP[key];openSheet(h.title,h.body(),from,{key:key,describe:true})}
var sheetOpen=false,sheetFrom=null,sheetSkip=false,sheetHist=false,sheetRefocus=null,sheetOnClose=null;
/* Everything behind a sheet or the tour: unreachable by touch, keyboard and screen reader while it's open. */
function setInert(on){["main","tabbar"].forEach(function(id){var n=$(id);if(on)n.setAttribute("inert","");else n.removeAttribute("inert")})}
function openSheet(title,nodes,from,o){o=o||{};var sh=$("sheet"),b=clear($("sheetB"));$("sheetH").textContent=title;
  nodes.forEach(function(n){b.appendChild(typeof n==="string"?el("p",null,n):n)});
  if(o.describe)sh.setAttribute("aria-describedby","sheetB");else sh.removeAttribute("aria-describedby");
  sheetFrom={el:from||null,key:o.key||null,id:(from&&from.id)||null};$("sheetClose").className="btn"+(o.quietClose?" ghost":"");
  // 2.16: o.onClose runs when the sheet closes, however it's closed, before focus goes back.
  sheetOnClose=o.onClose||null;
  if(!sheetOpen){sheetOpen=true;hideUndo();setInert(true);$("sheetWrap").hidden=false;
    // An entry in the history, so the phone's Back button closes the sheet rather than leaving the screen.
    try{history.pushState(Object.assign({},history.state||{},{sheet:true}),"");sheetHist=true}catch(e){sheetHist=false}}
  sh.scrollTop=0;try{$("sheetH").focus({preventScroll:true})}catch(e){}}
function closeSheet(fromBack){if(!sheetOpen)return;sheetOpen=false;$("sheetWrap").hidden=true;setInert(false);
  var oc=sheetOnClose;sheetOnClose=null;if(oc)oc();

  if(sheetHist&&!fromBack){sheetSkip=true;setTimeout(function(){sheetSkip=false},1000);try{history.back()}catch(e){sheetSkip=false}}sheetHist=false;
  var f=sheetFrom||{},shown=function(n){return n&&n.isConnected&&n.getClientRects().length?n:null};sheetFrom=null;
  var t=shown(f.el)||(f.key&&shown(document.querySelector('[data-help="'+f.key+'"]')))||(f.id&&shown($(f.id)));if(t)try{t.focus({preventScroll:true})}catch(e){}
  sheetRefocus=sheetSkip?t:null}
$("sheetClose").addEventListener("click",function(){closeSheet()});$("sheetBack").addEventListener("click",function(){closeSheet()});
/* Tab and Shift+Tab go round the buttons inside an open sheet or tour card, never out of it. */
function trapTab(e,box){var f=[].filter.call(box.querySelectorAll("button,[href],input,select,textarea,[tabindex]:not([tabindex='-1'])"),function(x){return !x.disabled&&x.getClientRects().length});if(!f.length)return;
  var i=f.indexOf(document.activeElement);e.preventDefault();f[e.shiftKey?(i<=0?f.length-1:i-1):(i<0||i===f.length-1?0:i+1)].focus()}
document.addEventListener("keydown",function(e){var box=sheetOpen?$("sheet"):tour?$("tourCard"):null;if(!box)return;
  if(e.key==="Escape"){e.preventDefault();e.stopPropagation();if(sheetOpen)closeSheet();else endTour(false);return}
  if(e.key==="Tab")trapTab(e,box)},true);

/* Settings › Help: the tour again, how Dovetail works, and the words it uses. */
function renderHelpSet(){var box=clear($("setHelp"));
  box.appendChild(el("div","small muted","New to Dovetail? Take a short tour of the screens, or read how it all works."));
  var r=el("div","btnrow"),t=el("button","btn","Show me around");t.id="tourStart";t.type="button";t.addEventListener("click",function(){startTour(t)});r.appendChild(t);box.appendChild(r);
  var r2=el("div","btnrow"),h=el("button","btn ghost","How Dovetail works");h.id="helpHow";h.type="button";h.setAttribute("aria-haspopup","dialog");h.addEventListener("click",function(){openHow(h)});
  var w=el("button","btn ghost","Words Dovetail uses");w.id="helpWords";w.type="button";w.setAttribute("aria-haspopup","dialog");w.addEventListener("click",function(){openWords(w)});
  r2.appendChild(h);r2.appendChild(w);box.appendChild(r2)}
function openHow(from){var r=lastR,n=[];
  n.push(el("h3",null,"Each payday"));var ol=el("ol","how");["Type the pay that arrived.","Make the transfers in your banking app, in the order shown.","Tick each one off in Dovetail. What's left over is yours to spend for the month."].forEach(function(t){ol.appendChild(el("li",null,t))});n.push(ol);
  var mh=el("h3",null,"How money moves");mh.id="howFlowH";n.push(mh);
  n.push("Pay lands in an account, which pays its own bills first. What's left moves on to the next account, and so on. Here are your accounts:");
  if(cfg.accounts.length)n.push(flowDiagram(monthCfg(),"howFlowH"));
  // 2.12: accounts several people pay for.
  if(cfg.accounts.some(function(a){return fundingPeople(cfg,a.id).length}))n.push("Some of your accounts are paid for by more than one person. Each pays a share from their own account, and those payments come first in the transfers. Settings \u203a Accounts says who pays what.");
  // 2.13: the households the definition names, one sentence each.
  if(cfg.people.length>1)n.push("If you each have your own account and pay a share into a joint one, your own account keeps what's left of your pay after your share: your own left over.");
  if(cfg.people.length>1)n.push("Someone who pays board pays a set amount into the household's account each month and keeps the rest of their pay, so their account isn't counted in what the household has left.");
  n.push(el("h3",null,"What left over means"));
  n.push("Left over is what's left once every bill, spending budget and savings transfer is covered. It stays in the account that keeps what's left.");
  if(r&&r.totalIn>0.004)n.push(fig(r2(r.flt)<0?mLabel(monthKey)+" is "+fmt(-r.flt)+" short.":mLabel(monthKey)+": "+fmt(r.flt)+" left over."));
  n.push(el("h3",null,"Pay months"));
  n.push("A pay month runs from one transfer day to the next. It's named after the month that pay is for.");
  n.push("Once a month has been saved, a change to a bill, budget or savings transfer applies from this pay month. Earlier months keep what they had.");
  // 2.14: the rough figure, in one line.
  n.push("An account can have a rough figure for its bills instead of every bill listed: Dovetail counts the figure until the bills you list go past it, so listing a bill within it doesn't change your transfers.");
  // 2.16: pay that isn't monthly, standing orders from each pay, and other income every four weeks (one text for everyone).
  n.push(el("h3",null,"Pay that isn't monthly"));
  n.push("Paid every week, two weeks or four weeks? Choose it in Settings › People. Each month, type everything that's arrived since your last transfer day. If one more payday came than usual, tap 'Had an extra payday?': it's set aside, out of the transfers, unless you count it. Settings › People shows standing orders that cover every month.");
  n.push("A standing order from each pay covers the largest month in the next year, so some months it sends a little more than needed and the extra builds up as a buffer. Once the buffer's there, you can lower it to the month's amount × 12 ÷ 52 (weekly) or × 12 ÷ 26 (every two weeks).");
  n.push("Child Benefit or another payment every four weeks? Add it as other income, using one payment as the amount a month: in the month with two, you'll have a bit more.");
  openSheet("How Dovetail works",n,from)}
var WORDS=[["Take-home pay","The pay that actually reaches your bank account, after tax, National Insurance and pension. Also called net pay."],
  ["Pay month","The month your pay is for. It runs from one transfer day to the next."],
  ["Transfer day","The day each month you make the transfers. For most people it's payday. If you're paid every week, two weeks or four weeks, it's a day you choose, and the pay that's arrived since the last one counts."],
  ["Transfer","Money you move from one of your accounts to another, in your banking app."],
  ["Left over","What's left once every bill, spending budget and savings transfer is covered. It's yours to spend for the month."],
  ["One-off","Money that goes out or comes in just once, like a car repair or a refund."],
  ["Share","What each person pays into an account you pay for together. It might be half each, in proportion to pay, so you each keep the same, or a set amount."],
  ["Board","Money someone living with you, like a grown-up child at home, pays towards the household each month. It's also called keep. The rest of their pay stays theirs, so it isn't counted in what the household has left."],
  ["Spending budget","Money set aside each month for everyday spending, like food shopping or fuel."],
  ["Savings transfer","Money you move to savings each payday, before it gets spent."],
  ["Rough figure (bills)","A rough amount for what goes out of an account in bills each month, for when you haven't listed every bill. What it has over the bills you've listed is shown as not listed yet."],
  ["Direct Debit","A regular payment a company takes from your account, with your permission. Shown as DD on a bank statement."],
  ["Standing Order","A regular payment of a fixed amount that you set up yourself. Shown as SO on a bank statement."],
  ["Renewal","When a contract or policy, like insurance or a phone contract, ends and starts again, often at a new price."],
  ["Tax year","In the UK, 6 April to 5 April the next year."]];
function openWords(from){var dl=el("dl","gloss");WORDS.forEach(function(w){var d=el("div");d.appendChild(el("dt",null,w[0]));d.appendChild(el("dd",null,w[1]));dl.appendChild(d)});openSheet("Words Dovetail uses",[dl],from)}

/* ---------- the guided tour (2.6) ----------
   Shown once straight after setup (tourDone false), and any time from Settings › Help › Show me around or the example
   household's banner. Each stop puts a ring round one thing on the real screen, dims the rest, and docks a card above
   the tab bar. Stops whose element isn't on screen are left out. The card is a modal dialog: focus goes to its title at
   each stop and stays in it; Esc (or the phone's Back) ends the tour; the screen behind can't be touched or swiped.
   Ending it any way saves tourDone (removed) so it isn't shown again uninvited. The tour has one entry of its own in
   the history while it runs, wherever it is, so the phone's Back button ends it, even on the Pay tab (where Back would
   otherwise leave the app). */
var TOUR=[
  {id:"month",target:"#monthBar",tab:"pay",title:"Your pay month",text:"This is the month your pay is for, from one payday to the next. Swipe, use the arrows or tap the month to look at other months."},
  {id:"hero",target:"#hero",tab:"pay",title:"What's left over",text:function(r){
    if(r.totalIn<=0.004)return "After every bill, budget and savings transfer, this is what's left for the month. Add your pay to see it.";
    return (r2(r.flt)<0?"This month is "+fmt(-r.flt)+" short: more is going out than coming in. You can fix it by changing a budget or a bill.":"After every bill, budget and savings transfer, this is what's left for the month: "+fmt(r.flt)+".")+
      (personKeeps(monthCfg(),r).length?" Under it is what each of you keeps in your own account.":"")}},
  {id:"pay",target:"#payCard",tab:"pay",title:"Type your pay",text:"When pay arrives, type what actually reached your bank since you last made the transfers. Until then, Dovetail uses an estimate."},

  {id:"transfers",target:"#trSec",tab:"pay",title:"Then make these transfers",text:function(r){return r.steps.length?"These are the payments to make in your banking app, in this order, so every bill is covered. Tick each one off when it's done."+
    (r.steps.some(function(x){return x.kind==="contribute"})?" Each person's share comes first.":"")+(cfg.people.length>1?" Share sends the list to "+(cfg.people.length===2?"the other person":"everyone else")+(sendsUpdate()?", or a file that brings Dovetail on their phone up to date.":"."):""):
    "When money needs to move between your accounts, the transfers show here, in order. Tick each one off when it's done."}},
  {id:"oneoffs",target:"#oneOffCard",tab:"pay",open:openPayDetails,title:"Something different this month?",text:"A birthday, a car repair, a refund: add it here and the transfers change to cover it."},
  {id:"notevery",target:"#nmCard",tab:"pay",open:openPayDetails,when:function(){return notEveryMonth(cfg,monthKey,0).any},title:"Bills that aren't monthly",text:"Yearly or occasional bills show up in the month they're due, so they don't catch you out."},
  {id:"analysis",target:"#t-analysis",tab:"analysis",title:"See the months ahead",text:"How the months ahead look, whether any account will be short, what your bills add up to, and how much you've saved."},
  {id:"reminders",target:"#t-due",tab:"due",title:"Never miss a renewal",text:"Insurance, phone contracts and MOTs, with a nudge before they renew, so you can shop around."},
  {id:"settings",target:"#t-settings",tab:"settings",title:"Change anything",text:"Your bills, budgets, accounts and payday all live here, and so do backups. You can see this tour again in Settings › Help."}];
var tour=null,tabWait=null;
/* Go to a tab, then run cb once it's on screen (going back to Pay can wait for the browser's history). */
function afterTab(t,cb){if(tab===t){cb();return}var w={t:t,cb:cb};tabWait=w;goTab(t);if(tabWait!==w)return;
  if(tab===t){tabWait=null;cb();return}
  setTimeout(function(){if(tabWait!==w)return;tabWait=null;if(tab!==t){try{history.replaceState(null,"","#"+t)}catch(e){}route()}cb()},700)}
function tourCalc(){try{return calc(monthCfg(),mNum(monthKey),readPay().vals,curOneOffs())}catch(e){return lastR}}
function startTour(from){if(!cfg||!cfg.setupDone||tour)return;closeSheet();hideUndo();
  var back={el:from||null,id:(from&&from.id)||null,tab:tab==="settings"?"settings":"pay"};
  afterTab("pay",function(){if(tour)return;toTop();
    // A stop inside "This month in detail" (open) counts when that's on screen; it's opened when the tour gets there.
    var stops=TOUR.filter(function(st){if(st.when&&!st.when())return false;var t=document.querySelector(st.target);return !!(t&&(st.open?$("payDetails"):t).getClientRects().length)});
    tour={stops:stops,ix:0,back:back,mark:null,markWas:null,detailsWas:$("payDetails").open,detailsPref:payDetailsOpen};$("tour").hidden=false;setInert(true);$("main").classList.add("touring");
    // The tour's history entry: it follows the tour from tab to tab (goTab replaces it) and goes when the tour ends.
    try{if(history.state&&history.state.tour)history.replaceState({tour:true},"","#pay");else history.pushState({tour:true},"","#pay")}catch(e){}
    tourShow()})}
function tourUnmark(){var T=tour||{};if(T.mark){if(T.markWas!=null)T.mark.setAttribute("aria-describedby",T.markWas);else T.mark.removeAttribute("aria-describedby")}if(tour){tour.mark=null;tour.markWas=null}}
function tourShow(){var T=tour,st=T&&T.stops[T.ix];if(!st){endTour(true);return}
  afterTab(st.tab,function(){if(tour!==T)return;tourUnmark();var r=tourCalc(),last=T.ix===T.stops.length-1;
    $("tourN").textContent=(T.ix+1)+" of "+T.stops.length;
    // A new title element each time, so a screen reader announces it when focus moves to it.
    var old=$("tourH"),h=el("h2",null,typeof st.title==="function"?st.title(r):st.title);h.id="tourH";h.tabIndex=-1;old.parentNode.replaceChild(h,old);
    var tx=clear($("tourT"));tx.appendChild(el("p",null,typeof st.text==="function"?st.text(r):st.text));
    if(last)tx.appendChild(el("p","tour-end","That's it. Each payday: type your pay, make the transfers, tick them off."));
    $("tourBack").hidden=T.ix===0;$("tourNext").textContent=last?"Done":"Next";$("tourCard").setAttribute("data-stop",st.id);
    if(st.open)st.open();
    var t=document.querySelector(st.target);if(t){T.mark=t;T.markWas=t.getAttribute("aria-describedby");t.setAttribute("aria-describedby","tourT")}
    tourPlace();try{h.focus({preventScroll:true})}catch(e){}
    if(!reduceMotion)setTimeout(function(){if(tour===T)tourPlace()},240)})}
/* Ring the stop's element and keep it clear of the card: scroll the page so it sits between the month bar and the
   card (its top part, if it's taller than that). */
function tourPlace(){var T=tour;if(!T)return;var st=T.stops[T.ix],t=document.querySelector(st.target),ring=$("tourRing"),card=$("tourCard");
  var vh=window.innerHeight,tb=$("tabbar"),tbTop=tb.hidden?vh:tb.getBoundingClientRect().top;card.style.bottom=Math.max(8,vh-tbTop+8)+"px";
  if(!t){ring.hidden=true;return}ring.hidden=false;
  var m=$("main"),inMain=m.contains(t)&&st.target!=="#monthBar",cr=card.getBoundingClientRect(),mr=m.getBoundingClientRect(),bar=$("monthBar");
  var top=mr.top+(bar.hidden?0:bar.offsetHeight)+10,bot=cr.top-12;
  if(inMain){var r=t.getBoundingClientRect(),d=0;if(r.height>bot-top||r.top<top)d=r.top-top;else if(r.bottom>bot)d=r.bottom-bot;if(Math.abs(d)>0.5)m.scrollTop+=d}
  var b=t.getBoundingClientRect(),p=6,y1=b.top-p,y2=b.bottom+p;if(inMain){y1=Math.max(y1,top-p);y2=Math.min(y2,bot+6)}y1=Math.max(y1,2);y2=Math.min(y2,vh-2);
  ring.style.left=(b.left-p)+"px";ring.style.top=y1+"px";ring.style.width=(b.width+2*p)+"px";ring.style.height=Math.max(0,y2-y1)+"px"}
function tourStep(d){if(!tour)return;var n=tour.ix+d;if(n<0)return;if(n>=tour.stops.length){endTour(true);return}tour.ix=n;tourShow()}
/* finished: Done on the last stop. quiet: ended by something else (the phone's Back, another screen's data): no
   moving about, just tidy up. Otherwise back to where the tour was started, with focus there. */
function endTour(finished,quiet){if(!tour)return;var T=tour;tourUnmark();tour=null;$("tour").hidden=true;setInert(false);$("main").classList.remove("touring");
  // "This month in detail" goes back to how it was before the tour opened it.
  payDetailsOpen=T.detailsPref;if(!T.detailsWas&&$("payDetails").open){pdExpect=false;$("payDetails").open=false}
  if(cfg&&cfg.tourDone===false){delete cfg.tourDone;saveCfg(true)}
  // Setup's message about rows left out waited for the tour (it would be hidden behind it).
  var note=setupNote;setupNote=null;if(note)toast(note);
  var bk=T.back;tourUnwind(quiet?null:bk.tab);if(quiet)return;
  afterTab(bk.tab,function(){tourFocus(bk)})}
/* Focus after the tour: where it was started from, or the "Finish setting up" card's title, or the hero's. */
function tourFocus(bk){var shown=function(n){return n&&n.isConnected&&n.getClientRects().length?n:null};
  var f=(bk&&(shown(bk.el)||(bk.id&&shown($(bk.id)))))||shown($("tipsH"))||shown($("heroH"));if(!f)return;
  if(!f.matches("button,a,input,select,textarea"))f.tabIndex=-1;try{f.focus({preventScroll:true})}catch(e){}reveal(f)}
/* The tour has ended some other way than the phone's Back: leave the history as it would be without the tour's entry.
   On another tab the entry becomes that tab's usual one. On Pay it goes (history.back, whose popstate is ignored),
   unless the tour is going back to another tab (next), which then takes its place. */
var tourPop=false;
function tourUnwind(next){if(!(history.state&&history.state.tour))return;var to=tab!=="pay"?tab:next||"pay";
  if(to==="pay"){tourPop=true;setTimeout(function(){tourPop=false},1000);try{history.back()}catch(e){tourPop=false}return}
  try{history.replaceState({sub:true},"","#"+to)}catch(e){}if(to!==tab)route()}
$("tourNext").addEventListener("click",function(){tourStep(1)});$("tourBack").addEventListener("click",function(){tourStep(-1)});
$("tourSkip").addEventListener("click",function(){endTour(false)});
window.addEventListener("resize",function(){if(tour)tourPlace()});

/* ---------- tabs & routing ---------- */
var TABS=["setup","pay","analysis","due","settings"];
function showTab(){dropFreshRem();
  TABS.forEach(function(t){$("tab-"+t).hidden=t!==tab;var b=$("t-"+t);if(b)b.setAttribute("aria-selected",t===tab?"true":"false")});
  $("tabbar").hidden=tab==="setup";$("monthBar").hidden=!monthTab();
  if(tab==="setup")renderSetup();else if(tab==="analysis")renderAnalysis();else if(tab==="settings")renderSettings();else if(tab==="due"){openRem=null;renewing=null;remSec=null;remHome=null;renewDraft=null;renderDue()}else renderPay();updateBadge();
  toTop();animatePanel($("tab-"+tab),0);
}
/* A quick fade as a page appears, or a short slide in the direction of a month change (dir 1 = next, -1 = previous).
   Off for reduced motion. */
function animatePanel(panel,dir){if(reduceMotion||!panel)return;
  // Going back fires both popstate and hashchange; the second redraw mustn't swap a slide that's under way for a fade.
  if(!dir&&(panel.classList.contains("slide-l")||panel.classList.contains("slide-r")))return;
  panel.classList.remove("fadein","slide-l","slide-r");void panel.offsetWidth;
  var c=dir>0?"slide-l":dir<0?"slide-r":"fadein";panel.classList.add(c);setTimeout(function(){panel.classList.remove(c)},300)}
function hashTab(){var h=(location.hash||"").replace("#","");return !cfg.setupDone?"setup":(h==="settings"||h==="due"||h==="analysis")?h:"pay"}
function route(){tab=hashTab();showTab();
  // The tour (afterTab) waiting for this tab to be on screen.
  if(tabWait&&tab===tabWait.t){var w=tabWait;tabWait=null;w.cb()}}
/* Back goes from any tab to Pay, then out of the app: Pay is the only entry under the other tabs. */
var setupPop=false;
function goTab(t){if(t===tab)return;
  // Setup from another tab (Settings › Start again): that tab's history entry goes, leaving Pay's as the only one, as
  // after a new install, so Back from Pay later leaves the app at once. Setup is on screen straight away; the popstate
  // that follows is ignored.
  if(t==="setup"){if(history.state&&history.state.sub){setupPop=true;setTimeout(function(){setupPop=false},1000);try{history.back()}catch(e){setupPop=false}}
    else{try{history.replaceState(null,"","#setup")}catch(e){}}route();return}
  // During the tour its own history entry moves with it (see startTour), so Back from any tab ends the tour.
  if(tour&&history.state&&history.state.tour){try{history.replaceState({tour:true},"","#"+t)}catch(e){}route();return}
  if(t==="pay"){if(history.state&&history.state.sub){history.back();return}try{history.replaceState(null,"","#pay")}catch(e){}route();return}
  try{if(tab==="pay")history.pushState({sub:true},"","#"+t);else history.replaceState({sub:true},"","#"+t)}catch(e){location.hash=t;return}route()}
document.querySelectorAll(".tabbar button").forEach(function(b){b.addEventListener("click",function(){goTab(b.getAttribute("data-tab"))})});
var rsT=null,rsW=0;window.addEventListener("resize",function(){clearTimeout(rsT);rsT=setTimeout(function(){var w=$("main").clientWidth;if(tab==="analysis"&&w!==rsW)keepScroll(renderAnalysis);rsW=w},150)});
$("undoBtn").addEventListener("click",function(){var f=undoFn,sel=undoFocus;hideUndo();if(f){f();toast("Restored");var e=sel&&document.querySelector(sel),shown=function(b){return b&&b.offsetParent&&!b.closest("details:not([open])")};if(!shown(e))e=null;
  // A reminder row may now be listed in another section (after a month change): use whichever copy is on screen.
  var rm=!e&&sel&&/^#rem_(?:[mu]_)?(\S+)/.exec(sel);if(rm)e=[].filter.call(document.querySelectorAll("#rem_"+rm[1]+" .btn,#rem_m_"+rm[1]+" .btn,#rem_u_"+rm[1]+" .btn"),shown)[0];
  if(!e){var h=document.querySelector("#tab-"+tab+" h1,#tab-"+tab+" h2");if(h){h.tabIndex=-1;e=h}}
  if(e){e.focus();reveal(e)}}});
/* The undo bar waits while you're on it (keyboard focus, or a finger or pointer over it), so there's time to use it. */
["focusin","pointerenter"].forEach(function(ev){$("undoBar").addEventListener(ev,function(){undoHold=true;clearTimeout(undoT)})});
["focusout","pointerleave"].forEach(function(ev){$("undoBar").addEventListener(ev,function(){undoHold=false;if(undoFn)armUndoTimer()})});
$("undoX").addEventListener("click",dismissUndo);
document.addEventListener("keydown",function(e){if(e.key==="Escape"&&!e.defaultPrevented&&!$("undoBar").hidden){e.preventDefault();dismissUndo()}});
/* Swipe the undo bar sideways (more than 40px either way) to dismiss it. The bar follows the finger; a short drag springs
   back. The pointer is only captured once it's clearly a drag, so a tap on Undo still works. */
(function(){var bar=$("undoBar"),g=null;
  bar.addEventListener("pointerdown",function(e){if(e.button>0)return;g={id:e.pointerId,x:e.clientX,dx:0,cap:false}});
  bar.addEventListener("pointermove",function(e){if(!g||e.pointerId!==g.id)return;g.dx=e.clientX-g.x;
    if(!g.cap&&Math.abs(g.dx)>10){g.cap=true;try{bar.setPointerCapture(e.pointerId)}catch(x){}}
    if(g.cap){bar.style.transform="translateX(calc(-50% + "+Math.round(g.dx)+"px))";bar.style.opacity=String(Math.max(0.35,1-Math.abs(g.dx)/180))}});
  function end(e,cancel){if(!g||e.pointerId!==g.id)return;var d=g.dx;g=null;bar.style.transform="";bar.style.opacity="";if(!cancel&&Math.abs(d)>40)dismissUndo()}
  bar.addEventListener("pointerup",function(e){end(e,false)});bar.addEventListener("pointercancel",function(e){end(e,true)})})();
/* Swipe left on the main area for the next month, right for the previous one, exactly like the ‹ › arrows. Only where
   the month bar shows (Pay, Analysis, Reminders); tabs change by the tab bar and Back. Passive listeners, so scrolling
   is never held up. A swipe must be at least 70px sideways, less than half that up or down, start more than 24px from
   either screen edge (Android's back gesture lives there) and not start on a chart, a sideways-scrolling table, a form
   field or anything marked data-noswipe. */
function monthTab(){return tab==="pay"||tab==="analysis"||tab==="due"}
function stepMonth(d){goMonth(shiftMonth(monthKey,d));animatePanel($("tab-"+tab),d)}
/* ---------- choosing a month (2.10) ----------
   The month name in the month bar opens a sheet with two wheels, month and year (pickerYears in calc.js), and "Show
   <month>"; "This month" too when another month is on screen. Each wheel is a listbox that scrolls and snaps to the
   option in the middle band: a tap picks an option, the arrow keys, Page Up/Down, Home and End move it, Enter shows. */
function openMonthPicker(){if(tour||sheetOpen)return;
  var sel={m:Number(monthKey.slice(5,7))-1,y:Number(monthKey.slice(0,4))},years=pickerYears(Object.keys(months),thisMonth(),monthKey);
  var go=el("button","btn");go.type="button";go.id="pickGo";
  var key=function(){return sel.y+"-"+pad(sel.m+1)},label=function(){go.textContent="Show "+mLabel(key())};
  // A wheel still settling after a fling: what's in the band now counts.
  var show=function(k){wm.sync();wy.sync();k=k||key();closeSheet();if(k===monthKey)return;var d=k<monthKey?-1:1;goMonth(k);animatePanel($("tab-"+tab),d)};
  var wrap=el("div","wheels"),band=el("div","wheel-band");band.setAttribute("aria-hidden","true");wrap.appendChild(band);
  var wm=wheel("pickMonth","Month",MN,sel.m,function(i){sel.m=i;label()},function(){show()}),
    wy=wheel("pickYear","Year",years.map(String),years.indexOf(sel.y),function(i){sel.y=years[i];label()},function(){show()});
  wrap.appendChild(wm.box);wrap.appendChild(wy.box);label();
  go.addEventListener("click",function(){show()});
  var r=el("div","btnrow");r.appendChild(go);var now=thisMonth();
  if(now!==monthKey){var t=el("button","btn ghost","This month");t.type="button";t.id="pickNow";t.addEventListener("click",function(){show(now)});r.appendChild(t)}
  openSheet("Choose a month",[wrap,r],$("monthPick"),{quietClose:true});wm.place();wy.place()}
function wheel(id,name,items,ix,onPick,onEnter){
  var box=el("div","wheel-col"),lab=el("div","small muted",name);lab.id=id+"L";box.appendChild(lab);
  var w=el("div","wheel");w.id=id;w.tabIndex=0;w.setAttribute("role","listbox");w.setAttribute("aria-labelledby",id+"L");box.appendChild(w);
  // A scroll picks only when it's the user's (a finger, mouse or wheel) or one of the wheel's own (target): a screen
  // reader moving through the options scrolls the wheel too, and mustn't change the choice by itself.
  var cur=-1,t=null,target=null,user=false,h=function(){return opts[0].getBoundingClientRect().height||44};
  ["pointerdown","touchstart","wheel"].forEach(function(ev){w.addEventListener(ev,function(){user=true},{passive:true})});
  var opts=items.map(function(txt,i){var o=el("div","wheel-o",txt);o.id=id+"_"+i;o.setAttribute("role","option");o.setAttribute("aria-selected","false");
    o.addEventListener("click",function(){pick(i,true)});w.appendChild(o);return o});
  function pick(i,scroll){i=Math.max(0,Math.min(items.length-1,i));
    if(i!==cur){if(cur>=0)opts[cur].setAttribute("aria-selected","false");cur=i;opts[i].setAttribute("aria-selected","true");w.setAttribute("aria-activedescendant",opts[i].id);onPick(i)}
    if(scroll){target=i;try{w.scrollTo({top:i*h(),behavior:reduceMotion?"auto":"smooth"})}catch(e){w.scrollTop=i*h()}}}
  // A scroll by finger picks whatever settles in the middle.
  w.addEventListener("scroll",function(){clearTimeout(t);t=setTimeout(function(){if(user||target!=null)pick(Math.round(w.scrollTop/h()),false);user=false;target=null},90)},{passive:true});
  w.addEventListener("keydown",function(e){var k=e.key,d=k==="ArrowDown"?1:k==="ArrowUp"?-1:k==="PageDown"?3:k==="PageUp"?-3:0;
    if(d)pick(cur+d,true);else if(k==="Home")pick(0,true);else if(k==="End")pick(items.length-1,true);else if(k==="Enter"||k===" ")onEnter();else return;e.preventDefault()});
  return {box:box,place:function(){pick(Math.max(0,ix),false);w.scrollTop=Math.max(0,ix)*h()},
    sync:function(){if(user&&target==null)pick(Math.round(w.scrollTop/h()),false)}}}
$("monthPick").addEventListener("click",openMonthPicker);
(function(){var m=$("main"),g=null;
  m.addEventListener("touchstart",function(e){g=null;if(e.touches.length!==1||!cfg||!cfg.setupDone||!monthTab()||tour||sheetOpen)return;var t=e.touches[0],w=window.innerWidth;
    if(t.clientX<=24||t.clientX>=w-24)return;
    var tg=e.target&&e.target.closest?e.target:(e.target&&e.target.parentElement);
    if(tg&&tg.closest(".chartbox,input,select,textarea,.tablewrap,[data-noswipe]"))return;
    g={x:t.clientX,y:t.clientY,at:Date.now()}},{passive:true});
  m.addEventListener("touchmove",function(e){if(g&&e.touches.length!==1)g=null},{passive:true});
  m.addEventListener("touchend",function(e){if(!g)return;var t=e.changedTouches[0],dx=t.clientX-g.x,dy=t.clientY-g.y,dt=Date.now()-g.at;g=null;
    if(Math.abs(dx)<70||Math.abs(dy)*2>=Math.abs(dx)||dt>1200||!monthTab())return;stepMonth(dx<0?1:-1)},{passive:true});
  m.addEventListener("touchcancel",function(){g=null},{passive:true})})();
/* Back: closes an open help sheet or ends the tour (each has its own history entry; the tour lands on Pay), otherwise
   goes back a tab. Going back fires popstate and then hashchange; the second one changes nothing (the tab is already
   right), so it doesn't redraw the page again (which would move the scroll and focus, for example where the tour has
   just put them). */
window.addEventListener("popstate",function(){if(sheetSkip){sheetSkip=false;
    // Going back after Esc closes a sheet, Chromium can drop focus (seen on Analysis): put it back on the "?".
    var r=sheetRefocus;sheetRefocus=null;if(r)setTimeout(function(){var a=document.activeElement;if(r.isConnected&&(!a||a===document.body))try{r.focus({preventScroll:true})}catch(e){}},0);return}if(tourPop){tourPop=false;return}if(setupPop){setupPop=false;return}if(sheetOpen){closeSheet(true);return}
  var ended=!!tour&&!tabWait;if(ended)endTour(false,true);route();if(ended)tourFocus(null)});
window.addEventListener("hashchange",function(){if(cfg&&hashTab()===tab)return;route()});
$("prev").addEventListener("click",function(){stepMonth(-1)});
$("next").addEventListener("click",function(){stepMonth(1)});
/* Any section that opens scrolls into view if it's off-screen. */
document.querySelectorAll("details.card:not(#payDetails)").forEach(function(d){d.addEventListener("toggle",function(){if(d.open)reveal(d)})});

/* ---------- boot & migration ---------- */
(function boot(){
  try{
    storageOK=lsSet("payday.probe",1);lsDel("payday.probe");
    // Damaged settings or months (saved, but not readable) are never treated as a new install: the recovery screen
    // offers the automatic backups instead, and nothing is written over them.
    var rc=lsRead(K_CFG),rm=lsRead(K_MON);
    if((rc&&rc.corrupt)||(rm&&rm.corrupt)){showRecovery("corrupt");return}
    var sc=rc?rc.value:null,rep=[],repM=[],fresh=false,note=null;wealthRaw=lsGet(K_W);months=normMonths(rm?rm.value:null,repM);markSeen();
    try{note=sessionStorage.getItem(K_NOTE);sessionStorage.removeItem(K_NOTE)}catch(e){}
    if(sc){cfg=normCfg(sc,rep);rep=rep.concat(repM);var mig=migrate(cfg,months,wealthRaw);
      // The first open of a new version (or of 1.x data): a kept backup of the data exactly as it was stored comes before
      // anything is written, so whatever this version's normCfg or migrate changes can be brought back.
      fresh=!!(cfg.setupDone&&!cfg.example&&cfg.lastVersion!==VERSION);if(fresh)keepRaw(sc);
      if(mig){lsSet(K_CFG,cfg);lsSet(K_MON,months)}}
    else{cfg=normCfg({schema:SCHEMA});months={}}
    // Not set up: a new install, or "Start again" (whose settings keep only this phone's appearance and notifications).
    if(!cfg.setupDone){startSetup();offerNewestBackup()}
    applyAppearance();
    if(cfg.setupDone&&cfg.lastVersion!==VERSION){whatsNew=!cfg.example&&!!sc;whatsNewFrom=cfg.lastVersion||null;cfg.lastVersion=VERSION;lsSet(K_CFG,cfg)}
    paySig=peopleSig();monthKey=defaultMonth(payCfg());
    if(!location.hash){try{history.replaceState(null,"","#pay")}catch(e){}}
    if(cfg.setupDone)goMonth(monthKey);route();
    queueNativeBackup(1500);queueSchedule(1500);
    // What couldn't be used, said once: after the recovery screen's restore, or on the first open of a new version.
    if(note)toast(note);else if(fresh&&rep.length){var said=reportSentence(rep);logError("boot",said);toast(said)}
    if(!storageOK)toast("This phone isn't letting the app save. Changes will be lost when you close it.");
  }catch(e){showRecovery("error",e)}
})();
