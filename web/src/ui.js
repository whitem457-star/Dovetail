/* Dovetail: the page (DOM, storage, Android bridge). Uses the pure functions in calc.js, migrate.js and analysis.js. */
var VERSION="2.10.1",SCHEMA=5,BACKUP_VERSION=5;
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
/* payday.wealth.v1 is the old Wealth tab's data. 2.0 doesn't use it, but keeps it untouched and in every backup. */
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
function syncFromStorage(){if(!cfg||!storageChanged())return false;syncCount++;setupNote=null;endTour(false,true);closeSheet(true);
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
function accountOptions(c,exclude){return c.accounts.filter(function(a){return !exclude||exclude.indexOf(a.id)<0}).map(function(a){return [a.id,a.name||"Unnamed account"]})}

/* ---------- the calculation ----------
   For each account: in = pay of people paid into it + other income + one-off income;
                     out = bills due this month + spending budgets + savings transfers + one-off payments.
   What's left moves up the "leftover goes to" tree from the leaves: an account's subtotal is its own in − out plus
   whatever its children pass up. A positive subtotal is sent to the parent, a negative one is topped up by the parent,
   and an account that keeps its leftover holds its subtotal as the float. */
/* ---------- PAY TAB ---------- */
var cur=null,saveT=null,openOne=null;
function fieldVal(id){var i=$(id);if(!i)return null;var r=parseMoney(i.value,false);return r.empty||r.invalid?null:r2(r.value)}
/* Each person's pay for the month on screen, from the pay boxes. estimated: people whose box is empty (or can't be read),
   so the estimate is used; filled: people whose box holds the estimate that ticking a transfer filled in (payEstimated). */
function readPay(){
  var out={vals:{},estimated:[],invalid:[],est:{},filled:[]},pe=(cur&&cur.payEstimated)||{};
  cfg.people.forEach(function(p){var e=payEstimate(cfg,months,p.id,monthKey),i=$("pay_"+safeId(p.id)),r=parseMoney(i?i.value:"",false);out.est[p.id]=e;
    if(r.invalid){out.invalid.push(p.id);out.vals[p.id]=e.v;out.estimated.push(p)}
    else if(r.empty){out.vals[p.id]=e.v;out.estimated.push(p)}else{out.vals[p.id]=r.value;if(pe[p.id])out.filled.push(p)}});
  return out}
/* Everyone whose pay this month is an estimate, typed box or not. */
function estimatedPeople(p){return p.estimated.concat(p.filled)}
function curOneOffs(){return (cur&&Array.isArray(cur.oneOffs))?cur.oneOffs:[]}
function goMonth(k){
  if(saveT){clearTimeout(saveT);saveT=null;flushMonth()}
  if(tab==="due"&&k!==monthKey)remMonthHint=false; // Reminders' "change month above" hint has done its job
  monthKey=k;cur=months[k]?clone(months[k]):null;
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
  cfg.people.forEach(function(p,ix){var id=safeId(p.id),e=payEstimate(cfg,months,p.id,monthKey);
    var f=el("div","field payrow");f.appendChild(avatar(p.payAccount,true,(p.name||"?").trim().charAt(0).toUpperCase()||"?"));
    var l=el("label");l.htmlFor="pay_"+id;l.appendChild(el("b",null,p.name||"Person "+(ix+1)));l.appendChild(el("span",null,"Into "+accName(p.payAccount)));f.appendChild(l);
    var mb=el("div","money");mb.id="payBox_"+id;mb.appendChild(el("span",null,"£"));
    var inp=el("input");inp.id="pay_"+id;inp.inputMode="decimal";inp.autocomplete="off";inp.setAttribute("enterkeyhint",ix<cfg.people.length-1?"next":"done");
    inp.value=cur&&cur.pay&&cur.pay[p.id]!=null?num(cur.pay[p.id]).toFixed(2):"";inp.placeholder=e.v?e.v.toFixed(2):"0.00";
    // Typing in a box filled with the estimate (when a transfer was ticked) makes it real pay.
    // (Something unreadable keeps the saved estimate, so it stays marked; an empty box drops both in flushMonth.)
    inp.addEventListener("input",function(){var rv=parseMoney(inp.value,false);if(!rv.invalid&&!rv.empty&&cur&&cur.payEstimated&&cur.payEstimated[p.id]){delete cur.payEstimated[p.id];if(!Object.keys(cur.payEstimated).length)delete cur.payEstimated}renderResults();queueMonthSave()});
    inp.addEventListener("blur",function(){var r=parseMoney(inp.value,false);if(!r.empty&&!r.invalid)inp.value=r.value.toFixed(2)});
    inp.addEventListener("keydown",function(ev){if(ev.key==="Enter"){ev.preventDefault();var nx=cfg.people[ix+1];if(nx&&$("pay_"+safeId(nx.id)))$("pay_"+safeId(nx.id)).focus();else inp.blur()}});
    mb.appendChild(inp);f.appendChild(mb);var h=el("div","hint");h.id="payHint_"+id;f.appendChild(h);g.appendChild(f)});
}
function renderPay(){if(!cfg.setupDone)return;renderOneOffs();renderResults()}
function renderResults(){
  if(!cfg.setupDone)return;
  var m=mNum(monthKey),p=readPay(),r=calc(cfg,m,p.vals,curOneOffs()),done=(cur&&cur.done)||{};
  cfg.people.forEach(function(pp){var id=safeId(pp.id),inp=$("pay_"+id);if(!inp)return;var bad=p.invalid.indexOf(pp.id)>=0;$("payBox_"+id).classList.toggle("err",bad);
    var h=$("payHint_"+id);h.className="hint"+(bad?" err":"");var e=p.est[pp.id];
    if(bad)h.textContent="Enter an amount like 1850.00";
    else if(inp.value.trim()==="")h.textContent=e.from?"Using "+mShort(e.from)+": "+fmt(e.v):e.v?"Using usual pay: "+fmt(e.v):"Not typed in yet";
    // Filled in with the estimate when a transfer was ticked: say so until the real figure is typed.
    else if(p.filled.indexOf(pp)>=0){var v=p.vals[pp.id];h.textContent=(Math.abs(v-e.v)<0.005?"Using "+(e.from?mShort(e.from):"usual pay")+": "+fmt(v):fmt(v))+" (estimated \u2014 tap to type what arrived)"}
    else h.textContent=""});
  renderNotice();renderActionBanner();renderPayLine();
  var pb=clear($("payBanner")),ep=estimatedPeople(p);
  if(ep.length&&cfg.people.length){var fromLast=ep.some(function(x){return p.est[x.id].from}),src=fromLast?"last month's pay":"usual pay";
    var all=ep.length===cfg.people.length;
    pb.appendChild(el("div","banner",(all?"These transfers use "+src+".":"These transfers use "+src+" for "+listAnd(ep.map(function(x){return x.name}))+".")+" When pay arrives, type what reached your bank to make them exact."))}
  // steps
  var ol=clear($("steps")),w=clear($("warnings")),nDone=0;
  r.steps.forEach(function(s){
    var d=done[s.id],isDone=d!=null&&d!==false;if(isDone)nDone++;
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
    if(s.kind==="topup")li.appendChild(el("div","note","Top-up: "+accName(s.to)+" doesn't have enough for its own bills this month, so money goes back to it."));
    if(isDone&&typeof d==="number"&&Math.abs(d-r2(s.amt))>0.004)li.appendChild(el("div","changed","You ticked this at "+fmt(Math.abs(d))+" but it's now "+fmt(Math.abs(s.amt))+" ("+fmtS(r2(s.amt)-d)+"). Send the difference, or untick and tick again once it's right."));
    ol.appendChild(li);
    if(s.kind==="topup")w.appendChild(el("div","banner",accName(s.to)+" doesn't have enough for its bills this month, so "+accName(s.from)+" tops it up with "+fmt(s.amt)+"."));
  });
  if(!r.steps.length)ol.appendChild(el("li","empty small muted","No transfers needed this month."));
  $("progressText").textContent=r.steps.length?nDone+" of "+r.steps.length+" done":"";$("shareTransfers").hidden=!r.steps.length;
  $("shareTransfers").setAttribute("aria-label",sendsUpdate()?"Share this month's transfers or an update file":"Share this month's transfers");
  if(sendsUpdate())$("shareTransfers").setAttribute("aria-haspopup","dialog");else $("shareTransfers").removeAttribute("aria-haspopup");
  $("payDetailsSum").textContent=r2(r.flt)<0?fmt(-r.flt)+" short":fmt(r.flt)+" left over";
  var pd=$("payDetails"),want=payDetailsOpen!=null?payDetailsOpen:curOneOffs().length>0;if(pd.open!==want){pdExpect=want;pd.open=want}
  $("progressBar").style.width=(r.steps.length?Math.round(100*nDone/r.steps.length):0)+"%";
  if(nDone===r.steps.length&&r.steps.length)w.appendChild(el("div","banner good alldone","All transfers done for "+mLabel(monthKey)+"."));
  // First-month hint: until some month has every transfer ticked, or another month has been used (worked out from the
  // months), never for the example.
  $("firstHint").hidden=!!cfg.example||!r.steps.length||nDone===r.steps.length||firstMonthDone(months,monthKey);
  lastR=r;
  renderHero(r,nDone);renderFloats(r,w);
  renderPayExtra();renderNotEvery();
  var st=clear($("stats"));
  [["Income",r.totalIn],["Bills",r.billsExSav],["Saving",r.totalSaving],["Budgets & one-offs",r.spend+r.oneOut]].forEach(function(x){var d=el("div","stat");d.appendChild(el("div","k",x[0]));d.appendChild(el("div","v",fmt(x[1])));st.appendChild(d)});
  var al=clear($("acctList"));
  cfg.accounts.forEach(function(a){var box=el("div");var h=el("div","accthead");h.appendChild(acctTag(a.id));
    var tot=r.A[a.id].bills.reduce(function(s,b){return s+num(b.amount)},0);h.appendChild(el("span","num",fmt(tot)));box.appendChild(h);
    var rr=el("div","rows");cfg.bills.filter(function(b){return b.account===a.id}).forEach(function(b){var on=applies(b,m);var d=el("div","row sub");
      d.appendChild(el("span","k",b.name+(on?"":" (not this month)")+(b.savings?" · savings":"")));d.appendChild(el("span","v",on?fmt(num(b.amount)):"–"));rr.appendChild(d)});
    if(!rr.firstChild)rr.appendChild(el("div","small muted","No bills from this account."));
    box.appendChild(rr);al.appendChild(box)});
}
/* The first thing on the Pay tab: what's left this month (all floats together), progress through the transfers, and
   a warning if the figures don't reconcile (nothing is shown when they do). */
function renderHero(r,nDone){
  var box=clear($("hero")),n=r.steps.length,neg=r2(r.flt)<0;box.classList.toggle("neg",neg);
  box.hidden=!cfg.people.length||!cfg.accounts.length;if(box.hidden){heroShown=null;return}
  var main=el("div","hmain");var h=el("h2","lbl",neg?"Short this month":"Left over this month");h.id="heroH";main.appendChild(h);
  var len=fmt(r.flt).length,v=el("div","hv mny"+(len>11?" longer":len>9?" long":""));v.id="heroFloat";rollHero(v,r.flt);main.appendChild(v);
  var wh=el("div","where");if(r.floats.length===1){wh.appendChild(avatar(r.floats[0].id));wh.appendChild(document.createTextNode("in "+accName(r.floats[0].id)))}
  else wh.appendChild(document.createTextNode("across "+plural(r.floats.length,"account")));main.appendChild(wh);box.appendChild(main);
  if(n){var C=2*Math.PI*32,ring=el("div","ring");ring.setAttribute("role","img");ring.setAttribute("aria-label",nDone+" of "+n+" transfers done");
    ring.innerHTML='<svg viewBox="0 0 76 76" aria-hidden="true"><circle class="rb" cx="38" cy="38" r="32"/><circle class="rf" cx="38" cy="38" r="32" stroke-dasharray="'+C.toFixed(2)+'" stroke-dashoffset="'+(C*(1-nDone/n)).toFixed(2)+'"/></svg>';
    var rt=el("div","rt");rt.setAttribute("aria-hidden","true");rt.appendChild(el("b",null,nDone+"/"+n));rt.appendChild(el("span",null,"done"));ring.appendChild(rt);box.appendChild(ring)}
  // One account short while the total is fine: say so here, not only under the transfers.
  if(!neg)r.floats.forEach(function(f){if(f.amt<-0.004)box.appendChild(el("div","hwarn",accName(f.id)+" is short by "+fmt(-f.amt)))});
  // Silent when the figures reconcile; a warning with a way to fix it when they don't.
  if(!r.ok){var ck=el("div","banner bad col");ck.id="check";ck.setAttribute("role","group");ck.setAttribute("aria-label","The figures don't add up");
    ck.appendChild(el("div",null,"The figures don't add up: off by "+fmt(Math.abs(r.diff))+". Check that every bill, budget and savings transfer points at an account in Settings."));
    var ob=el("button","btn","Open accounts");ob.type="button";ob.addEventListener("click",function(){openSettings("sAccounts")});var row=el("div");row.appendChild(ob);ck.appendChild(row);box.appendChild(ck)}}
function renderFloats(r,w){
  var box=clear($("floatCards"));
  r.floats.forEach(function(f,ix){var s=r.A[f.id],card=el("section","card"),hid="flH_"+safeId(f.id);card.setAttribute("aria-labelledby",hid);
    var top=el("div","spread"),h=el("h2",null,accName(f.id)+" after the transfers");h.id=hid;top.appendChild(h);
    card.appendChild(top);var rows=el("div","rows");rows.id="floatRows_"+safeId(f.id);
    // Money in: "+ £x" in the accent colour. Money out: muted, "− £x".
    function row(k,v,isSub){var d=el("div","row"+(isSub?" sub":""));d.appendChild(el("span","k",k));d.appendChild(el("span","v",v));rows.appendChild(d)}
    function rin(k,v){var d=el("div","row in");d.appendChild(el("span","k",k));d.appendChild(el("span","v","+ "+fmt(v)));rows.appendChild(d)}
    r.kids[f.id].forEach(function(k){var v=r.sub[k];if(v>0.004)rin("Arrives from "+accName(k),v);else if(v<-0.004)row("Top-up to "+accName(k),"− "+fmt(-v),true)});
    s.pay.forEach(function(x){rin((x.p.name||"Pay")+"'s pay",x.v)});
    s.income.forEach(function(i){rin(i.name||"Income",num(i.amount))});
    s.oneIn.forEach(function(o){rin((o.name||"One-off")+" (one-off)",num(o.amount))});
    s.bills.forEach(function(b){row(b.name,"− "+fmt(num(b.amount)),true)});
    s.savings.forEach(function(x){row("To "+(x.name||"savings"),"− "+fmt(num(x.amount)),true)});
    s.budgets.forEach(function(b){row(b.name||"Budget","− "+fmt(num(b.amount)),true)});
    s.oneOut.forEach(function(o){row((o.name||"One-off")+" (one-off)","− "+fmt(num(o.amount)),true)});
    if(!rows.firstChild)rows.appendChild(el("div","small muted","Nothing comes into or goes out of this account yet."));
    card.appendChild(rows);
    var tot=el("div","total"),lab=el("div");lab.appendChild(el("div",null,"Left over"));lab.firstChild.style.fontWeight="700";lab.appendChild(el("div","small muted","What's left after bills, spending budgets and savings"));tot.appendChild(lab);
    var fv=moneyEl(f.amt,"v"+(f.amt<0?" neg":""),ix===0?"floatV":"floatV_"+safeId(f.id));tot.appendChild(fv);card.appendChild(tot);box.appendChild(card);
    if(f.amt<-0.004)w.appendChild(el("div","banner bad",accName(f.id)+" will be short by "+fmt(-f.amt)+" this month after budgets and savings."))});
  if(r.floats.length>1){var c=el("section","card"),t=el("div","total");t.style.borderTop="0";t.style.paddingTop="0";
    var l=el("div");l.appendChild(el("div",null,"Total left over"));l.firstChild.style.fontWeight="700";l.appendChild(el("div","small muted","Across "+plural(r.floats.length,"account")+" that keep what's left"));t.appendChild(l);
    var v=moneyEl(r.flt,"v"+(r.flt<0?" neg":""),"floatTotal");t.appendChild(v);c.appendChild(t);box.appendChild(c)}
}
/* Other money coming in this month, under the pay boxes. Read-only: amounts and accounts are set in Settings › Other
   income and in the one-offs card, and a tap opens the item there. */
function renderPayExtra(){
  var box=clear($("payExtra")),inc=cfg.income.filter(function(i){return num(i.amount)>0.004}),ones=curOneOffs().filter(function(o){return o.kind==="in"&&num(o.amount)>0.004});
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
  var r=calc(cfg,mNum(k),p.vals,curOneOffs()),old=months[k]||{},pay=Object.assign({},old.pay||{}),st={};
  // A pay box that can't be read keeps the figure last saved; ticks and one-offs are still saved.
  cfg.people.forEach(function(pp){if(p.invalid.indexOf(pp.id)<0)pay[pp.id]=fieldVal("pay_"+safeId(pp.id));else if(!(pp.id in pay))pay[pp.id]=null});
  r.steps.forEach(function(s){st[s.id]=r2(s.amt)});
  var body=Object.assign({},old,{month:k,pay:pay,done:(cur&&cur.done)||{},oneOffs:curOneOffs(),results:{steps:st,float:r2(r.flt)},updatedAt:new Date().toISOString()});
  // payEstimated: the people whose saved pay is the estimate filled in by a tick; only while there's a figure to mark.
  var pe={};Object.keys((cur&&cur.payEstimated)||{}).forEach(function(id){if(cur.payEstimated[id]&&pay[id]!=null)pe[id]=true});
  if(Object.keys(pe).length)body.payEstimated=pe;else delete body.payEstimated;
  // cur stays the working copy (an open one-off editor holds its objects); the saved month is an independent copy.
  months[k]=clone(body);cur=body;saveMonths();
}
/* "Share" beside the transfers (2.7): the month on screen's transfers as text (transfersText in export.js), ticks
   included, through the phone's share sheet; in a browser, the browser's own sharing, or copied. In the app with a
   household set up (2.10.1), Share asks first: the transfers as a message, or an update file for the other phone (the
   whole backup, which the other phone opens to bring itself up to date: see offerImport). WhatsApp drops the message
   when a file goes with it, so they're two choices rather than one share (2.10 sent both together). The example
   household sends the text straight away. */
function transfersMessage(){var p=readPay(),r=calc(cfg,mNum(monthKey),p.vals,curOneOffs());
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
var whatsNew=false;
var WHATS_NEW=["Share now asks what to send: the transfers as a message, or an update file for the other phone. WhatsApp won't send both at once.",
  "On the other phone, tap the update file, then Update, to show the same bills, pay and ticks.",
  "Anything changed on the other phone is replaced by the next update, so make changes on one phone."];
/* One notice at most above the hero (2.7), the first there is of: an update file to open (2.10), an automatic backup to restore, What's new, and the
   example household's banner or the "Finish setting up" card. The reminders nudge is a line under the hero instead. */
function renderNotice(){clear($("updateOffer"));clear($("restoreOffer"));clear($("whatsNew"));clear($("exampleBanner"));
  // An update file from this household's other phone (2.10) comes first: it's what was just opened.
  if(importOffer&&importOffer.update)$("updateOffer").appendChild(importOfferCard());
  else if(restoreOffer)renderRestoreOffer();else if(whatsNew&&!cfg.example)renderWhatsNew();else renderExampleBanner();
  $("notice").hidden=!($("updateOffer").firstChild||$("restoreOffer").firstChild||$("whatsNew").firstChild||$("exampleBanner").firstChild)}
function renderWhatsNew(){var box=clear($("whatsNew"));if(!whatsNew||cfg.example)return;
  var c=el("div","banner good col");c.setAttribute("role","group");c.setAttribute("aria-label","What's new in Dovetail "+VERSION);c.appendChild(el("b",null,"What's new in "+VERSION));
  var ul=el("ul");WHATS_NEW.forEach(function(t){ul.appendChild(el("li",null,t))});c.appendChild(ul);
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

function renderAnalysis(){
  if(!cfg.setupDone)return;var box=clear($("analysis")),k=monthKey;rsW=$("main").clientWidth;
  if(!cfg.bills.length&&!cfg.budgets.length&&!cfg.savings.length){var e=el("div","empty");e.appendChild(el("div",null,"Add your bills, spending budgets and savings in Settings to see where your money goes."));
    var b=el("button","btn",cfg.bills.length?"Open Settings":"Add bills");b.style.marginTop="10px";b.addEventListener("click",goBills);e.appendChild(b);box.appendChild(e)}
  [anMonths,anPicture,anCategories,anHistory,anSaved,anPrices,anTopUps].forEach(function(f){var c=f(k);if(c)box.appendChild(c)});
}
/* Month by month: the float for 12 budget months (3 back, the one on screen, 8 ahead). Since 2.9.1 the chart speaks for
   itself: words above it only when a month is short or there's no pay yet. Each bar's reading (tap or arrow keys) and
   the figures (the table) have what goes out and what makes each month differ; the chart's description for screen
   readers still sums it up (this month, the tightest month ahead). */
function anMonths(k){
  if(!cfg.bills.length&&!cfg.budgets.length&&!cfg.savings.length)return null;
  var keys=chartMonths(k),r=projectedFloat(cfg,months,k,keys),h=heavyLight(cfg,months,k,keys),c=anCard("anMonths","Month by month");
  var ahead=r.filter(function(x){return x.k>=k}),now=ahead[0],shortM=ahead.filter(function(x){return x.short}),low=ahead.reduce(function(a,x){return x.float<a.float?x:a},ahead[0]);
  var ex=keys.map(function(x){return monthExtras(cfg,months,x)}),why=function(i){return extrasText(ex[i],true)||"Only the monthly bills"};
  var later=shortM.filter(function(x){return x.k!==k}),noPay=avgIncome(cfg,months,k).total<=0,advice=" Move a one-off to another month or trim a spending budget.";
  // Without any pay every month is "short": that's a missing figure, not advice to trim.
  if(noPay||now.short){var verdict=el("div",noPay?"lead":"banner bad");verdict.id="anVerdict";
    verdict.textContent=noPay?"Add each person's pay (or their usual pay in Settings › People) to see what's left each month.":mLabel(k)+" is short by "+fmt(-now.float)+"."+advice;
    c.appendChild(verdict)}
  if(later.length&&!noPay)c.appendChild(el("div","banner bad",(now.short?"Also short: ":"Short: ")+later.slice(0,3).map(function(x){return mLabel(x.k)+" by "+fmt(-x.float)}).join(", ")+(later.length>3?" and "+plural(later.length-3,"more month")+" (see the figures)":"")+"."+(now.short?"":advice)));
  // Months with typed pay are solid, with a line at what was predicted before pay was typed; the rest are hatched.
  function vsPredicted(x){if(x.predicted==null)return "";var d=x.float-x.predicted;return Math.abs(d)<0.005?"as predicted":fmt(Math.abs(d))+(d>0?" more":" less")+" than the "+fmt(x.predicted)+" predicted"}
  var cb=el("div","chartbox");c.appendChild(cb);
  columnChart(cb,{items:r.map(function(x){return {label:MS[mNum(x.k)-1],value:x.float,neg:x.short,hatch:!x.actual,mark:x.predicted,current:x.k===k}}),
    ariaLabel:"Left over each month from "+mLabel(keys[0])+" to "+mLabel(keys[keys.length-1])+". "+mLabel(k)+" (this month)"+(now.short?" short by "+fmt(-now.float):" "+fmt(now.float)+" left over")+". Tightest from "+mLabel(k)+": "+mLabel(low.k)+" "+fmt(low.float)+(shortM.length?". "+plural(shortM.length,"month")+" short":"")+". Use the arrow keys to read each month.",
    tip:function(i){var x=r[i],o=h.months[i],vp=vsPredicted(x);return [mLabel(x.k)+(x.k===k?" (this month)":"")+": "+fmt(x.float)+(x.short?" (short)":""),fmt(o.total)+" going out",why(i),x.actual?"Actual: pay typed in"+(vp?", "+vp:""):"Estimated"]}});
  var keysList=actualKeys(r,"var(--accent)");if(r.some(function(x){return x.predicted!=null}))keysList.push({label:"Predicted",line:true});if(r.some(function(x){return x.short}))keysList.push({colour:"var(--bad)",label:"Short"});c.appendChild(keyRow(keysList));
  tableToggle(c,"anMonthsTable",["Month","Left over","Bills","Budgets","Savings","One-offs out","Going out","What's different"],
    r.map(function(x,i){var o=h.months[i];return [monthCell(x),fmt(x.float)+(x.short?" (short)":"")+(x.predicted!=null?" (predicted "+fmt(x.predicted)+")":""),fmt(o.bills),fmt(o.budgets),fmt(o.savings),fmt(o.oneOffs),fmt(o.total),why(i)]}));
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
  // Each person's pay (an average of the months typed in, or their usual pay) is in the figures, under Income.
  var inc=r.incomeDetail,of=function(v){return r.income>0?pct(v/r.income):""},incRows=inc.people.map(function(p){return [(p.name?p.name+"'s pay":"Pay")+(p.months?" (average of "+plural(p.months,"month")+")":" (usual pay)"),fmt(p.avg),of(p.avg)]});
  if(inc.other)incRows.push(["Other income",fmt(inc.other),of(inc.other)]);
  tableToggle(c,"anPictureTable",["","A month","Of income"],[["Income",fmt(r.income),r.income>0?"100%":""]].concat(incRows,segs.map(function(s){return [s.label,fmt(s.value),of(s.value)]})));
  return c}
function anCategories(){
  var r=byCategory(cfg),c=anCard("anCategories","Where the money goes");
  if(!cfg.bills.length){c.appendChild(el("div","empty","No bills yet. Add them in Settings › Bills."));return c}
  c.appendChild(el("div","lead",fmt(r.annual)+" a year on bills, "+fmt(r.monthly)+" a month."));
  var max=Math.max.apply(null,r.groups.map(function(g){return g.annual}))||1,list=el("div");
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
  c.appendChild(list);
  tableToggle(c,"anCategoriesTable",["Category","A year","A month","Share"],r.groups.map(function(g){return [g.name,fmt(g.annual),fmt(g.monthly),pct(g.share)]}));
  return c}
/* Pay and float history: only once there are two months to compare. */
function anHistory(k){
  var h=payHistory(cfg,months,k);if(h.length<2)return null;
  var c=anCard("anHistory","Pay and what was left"),fb=el("div","chartbox");c.appendChild(fb);
  var inH=h.some(function(x){return x.k===k});
  columnChart(fb,{items:h.map(function(x){return {label:MS[mNum(x.k)-1],value:x.float,neg:r2(x.float)<0,current:x.k===k}}),height:170,
    ariaLabel:"Left over each month from "+mLabel(h[0].k)+" to "+mLabel(h[h.length-1].k)+"."+(inH?" "+mLabel(k)+" (this month) is outlined.":"")+" Use the arrow keys to read each month and its pay.",
    tip:function(i){var x=h[i];return [mLabel(x.k)+(x.k===k?" (this month)":"")+": "+fmt(x.float)+" left over"].concat(cfg.people.map(function(p){return (p.name||"Pay")+": "+(x.pay[p.id]==null?"not typed":fmt(x.pay[p.id]))}))}});
  tableToggle(c,"anHistoryTable",["Month"].concat(cfg.people.map(function(p){return p.name||"Pay"})).concat(["Left over"]),h.map(function(x){return [mShort(x.k)].concat(cfg.people.map(function(p){return x.pay[p.id]==null?"–":fmt(x.pay[p.id])})).concat([fmt(x.float)])}));
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
function anTopUps(k){
  var r=topUps(cfg,months,k);if(!r.accounts.length)return null;
  var c=anCard("anTopUps","Accounts that ran short");
  c.appendChild(el("div","small muted","When an account doesn't have enough for its own bills, Dovetail moves money back to it from the account it sends to. That's a top-up."));
  r.accounts.forEach(function(a){
    c.appendChild(el("div","lead",accName(a.account)+" needed topping up in "+a.count+" of the last "+plural(r.monthsLooked,"month")+" you used the app, by "+fmt(a.average)+" on average. Moving a bill of about "+fmt(a.average)+" from "+accName(a.account)+" to "+accName(a.from)+" would stop that."))});
  return c}

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
var openRem=null,renewing=null,remSec=null,remHome=null,renewDraft=null,dueAllOpen=false,remMonthHint=true;
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
  s2.appendChild(el("div","small muted",paydayFor(cfg.payday,monthKey)?shortDate(w.from)+" to "+shortDate(w.to)+", between paydays":"The calendar month"));
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
  var add=el("button","btn ghost","+ Add a reminder");add.addEventListener("click",function(){var r={id:uid("r"),name:"New reminder",date:w.from>todayStr()?w.from:plusDays(30),lead:30,yearly:false};
    cfg.reminders.push(r);saveCfg(true);openRem="r:"+r.id;renewing=null;remHome=null;renewDraft=null;keepScroll(renderDue);reveal($(remDomId(openRem)));var f=$("rn_"+r.id);if(f){f.focus();f.select()}});
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
  if(it.kind==="oneoff"){var ob=el("button","btn ghost","Open "+mLabel(it.month));ob.addEventListener("click",function(){var k=it.month,id=it.ref.id;afterTab("pay",function(){goMonth(k);openOneOffItem(id)})});br.appendChild(ob);d.appendChild(br);return d}
  var primary=it.kind==="rem"&&!it.yearly?"Done":(it.status==="over"&&it.kind==="bill"?"Update renewal":"Mark as renewed");
  if(it.status!=="later"){var pb=el("button","btn",primary);pb.addEventListener("click",function(){renewing=renewing===it.key&&here?null:it.key;remHome=sec;renewDraft=null;openRem=null;keepScroll(renderDue);if(renewing)reveal($(remDomId(it.key)))});br.appendChild(pb)}
  var open=openRem===it.key&&here,eb=el("button","btn ghost",open?"Close":"Edit");eb.setAttribute("aria-expanded",open?"true":"false");
  eb.addEventListener("click",function(){openRem=open?null:it.key;remHome=sec;renewing=null;renewDraft=null;keepScroll(renderDue);if(openRem)reveal($(remDomId(it.key)))});br.appendChild(eb);d.appendChild(br);
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
  var sb=el("button","btn","Save");sb.addEventListener("click",function(){
    if(!validDate(nd.value)){msg.className="hint err";msg.textContent="Choose the next date.";return}
    var r=amt?parseMoney(amt.value,false):{empty:true};if(r.invalid){msg.className="hint err";msg.textContent="Enter an amount like 142.50";return}
    if(it.kind==="bill"){var b=it.ref,old=num(b.amount);if(!r.empty)b.amount=r.value;b.renews=nd.value;
      b.history=arr(b.history);b.history.push({on:todayStr(),date:nd.value,from:old,to:num(b.amount)});if(perYear(b)===1)b.months=[Number(nd.value.slice(5,7))];
      logDone(it.name+" renewed"+(!r.empty&&Math.abs(r.value-old)>0.004?" at "+fmt(r.value)+" (was "+fmt(old)+")":" at the same price")+", next "+fmtDate(nd.value));saveCfg(true)}
    else{it.ref.date=nd.value;logDone(it.name+" done, next "+fmtDate(nd.value));saveCfg(true)}
    renewing=null;toast("Saved. Next reminder: "+fmtDate(nd.value));keepScroll(renderDue);renderPay()});
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
  if(it.kind==="rem")br.appendChild(confirmBtn("rem"+ref.id,"Delete reminder",function(){openRem=null;removeWithUndo(cfg.reminders,ref,(ref.name||"Reminder")+" deleted",function(){saveCfg(true);updateBadge();rerender()},"#"+remDomId("r:"+ref.id)+" .btn")}));
  else br.appendChild(confirmBtn("rem"+it.key,"Stop reminding",function(){delete ref.renews;saveCfg(true);openRem=null;keepScroll(renderDue)}));
  f.appendChild(br);
  if(it.kind==="bill")f.appendChild(el("div","small muted","The amount and other details are in Settings › Bills."));
  return f;
}
var remT=null;

/* ---------- SETTINGS ---------- */
var cfgT=null;function queueCfg(){clearTimeout(cfgT);cfgT=setTimeout(function(){saveCfg();afterCfgChange()},600)}
function cfgNow(){clearTimeout(cfgT);saveCfg();afterCfgChange()}
var paySig="";function peopleSig(){return JSON.stringify(cfg.people.map(function(p){return [p.id,p.name]}))}
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
  $("sumPeople").textContent=plural(cfg.people.length,"person","people");$("sumAccounts").textContent=plural(cfg.accounts.length,"account");
  $("sumBills").textContent=plural(cfg.bills.length,"bill");$("sumIncome").textContent=cfg.income.length?fmt(cfg.income.reduce(function(t,i){return t+num(i.amount)},0)):"None";
  $("sumLook").textContent=optName(THEMES,cfg.appearance.theme)+" · "+optName(TEXTS,cfg.appearance.textSize);
  $("sumNotify").textContent=cfg.notify.on?"On, "+cfg.notify.time:"Off";
  $("sumBudget").textContent=fmt(cfg.budgets.reduce(function(t,b){return t+num(b.amount)},0));$("sumSavings").textContent=fmt(cfg.savings.reduce(function(t,s){return t+num(s.amount)},0))}
function renderPaydaySet(){
  var box=clear($("setPayday")),pc=cfg.payday;
  box.appendChild(el("div","small muted","Tell Dovetail when your pay arrives. It then opens on the right pay month and shows when your next payday is."));
  var opts=[["","Not set"]];for(var i=1;i<=31;i++)opts.push([String(i),ordinal(i)+" of the month"]);opts.push(["last","Last working day of the month"]);
  box.appendChild(labeled("Payday",selectIn(opts,pc.day!=null?String(pc.day):"",function(v){if(!v)delete pc.day;else pc.day=v==="last"?"last":Number(v);cfgNow();keepScroll(renderPaydaySet)},"pay_day")));
  if(pc.day&&pc.day!=="last")box.appendChild(checkIn("If it falls on a weekend, we're paid the Friday before",pc.weekend!==false,function(v){pc.weekend=v;cfgNow();keepScroll(renderPaydaySet)},"pay_wk"));
  if(pc.day){var nx=nextPayday(payCfg());
    if(nx)box.appendChild(el("div","banner good","Next payday: "+DAYS[dow(nx.date)]+" "+fmtDate(nx.date)+" ("+relDays(daysUntil(nx.date))+"). It pays for "+mLabel(nx.month)+"."));
    box.appendChild(el("div","small muted","From 10 days before a payday, Dovetail opens on the month that pay is for. Bank holidays aren't taken into account."))}
}
function renderPayLine(){
  var box=clear($("payLine")),pd=paydayFor(payCfg(),monthKey);
  if(!pd){var b=el("button","linkbtn","Set your payday so Dovetail opens on the right month");b.addEventListener("click",function(){openSettings("sPayday")});box.appendChild(b);return}
  var n=daysUntil(pd);box.textContent=(n>0?"Payday: ":n===0?"Payday is today: ":"Paid on ")+DAYS[dow(pd)]+" "+fmtDate(pd)+(n!==0?" ("+relDays(n)+")":"");
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
  box.appendChild(el("div","small muted","Dovetail can remind you the day before payday, when a bill renewal or one of your reminders becomes due soon and on the day itself, and the day before a dated one-off. The notifications come from this phone; nothing is sent anywhere."));
  var l=checkIn("Notify me about reminders",on,function(v){if(notifyBusy){sw.checked=!v;return}notifyBusy=true;notifyRefused=false;renderNotifySet();nativeCall(function(){NATIVE.setNotificationsEnabled(v)})},"notify_on"),sw=l.querySelector("input");
  if(notifyBusy)sw.setAttribute("aria-disabled","true");box.appendChild(l);
  if(notifyBusy)box.appendChild(el("div","small muted","Waiting for your phone…"));
  else if(notifyRefused)box.appendChild(el("div","banner","Notifications are blocked for Dovetail on this phone. To use them, allow notifications for Dovetail in your phone's Settings › Apps › Dovetail › Notifications, then turn this on again."));
  var tm=el("input","inp");tm.type="time";tm.id="notify_time";tm.step="900";tm.min="06:00";tm.max="22:00";tm.value=nt.time;
  tm.addEventListener("change",function(){if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(tm.value))return;nt.time=notifyTime(tm.value);tm.value=nt.time;saveCfg(true);flushSchedule();updateSums()});
  box.appendChild(labeled("Time of day (between 06:00 and 22:00)",tm));
  box.appendChild(checkIn("Show amounts in notifications",nt.amounts,function(v){nt.amounts=v;saveCfg(true);flushSchedule()},"notify_amounts"));
  box.appendChild(el("div","small muted","Notifications can show on the lock screen, so amounts are left out unless you turn this on."+(payCfg().day?"":" Set your payday in Settings › Payday to get a reminder the day before.")));
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
  box.appendChild(el("div",null,"Dovetail version "+VERSION+". Your figures are stored on this phone and the app has no internet access."+(NATIVE?" Automatic backups are kept on this phone too.":"")+" Back up in Settings › Backup, export & restore before changing phones."));
  box.appendChild(el("div",null,"Found a problem or have an idea? \u201cSend feedback\u201d opens your email app with the app details filled in: the version and your phone's screen size, never your names or amounts. Or write to "+FEEDBACK_EMAIL+"."));
  var b=el("button","btn ghost","Copy app details");b.id="copyDetails";b.addEventListener("click",function(){copyText(appDetails(),"App details copied")});var r=el("div","btnrow");r.appendChild(feedbackButton("sendFeedback"));r.appendChild(b);box.appendChild(r);
  box.appendChild(el("div",null,"Dovetail is free software under the GNU General Public License, version 3 or later."));
  // What changed in this version: the same lines as "What's new". The app keeps no history of earlier versions.
  var wc=el("details","changed-v");wc.id="whatChanged";wc.appendChild(el("summary",null,"What changed"));wc.appendChild(el("div",null,"In version "+VERSION+":"));
  var ul=el("ul");WHATS_NEW.forEach(function(t){ul.appendChild(el("li",null,t))});wc.appendChild(ul);wc.appendChild(el("div",null,"Only this version's changes are listed here."));box.appendChild(wc)}
/* people */
function renderPeopleSet(){
  var box=clear($("setPeople"));box.appendChild(el("div","small muted","Everyone whose take-home pay goes into the household. You type each person's pay on the Pay tab each month."));
  cfg.people.forEach(function(p,i){var d=el("div","box"),g=el("div","grid2");d.id="person_"+safeId(p.id);
    g.appendChild(labeled("Name",textIn(p.name,function(v){p.name=v;queueCfg()},"pp_n_"+safeId(p.id))));
    g.appendChild(labeled("Usual take-home pay (£)",textIn(p.usualPay?money2(p.usualPay):"",function(v){var r=parseMoney(v,false);if(r.invalid)return;p.usualPay=r.value||0;queueCfg()},"pp_u_"+safeId(p.id),true)));d.appendChild(g);
    d.appendChild(labeled("Paid into",selectIn(accountOptions(cfg),p.payAccount,function(v){p.payAccount=v;cfgNow();keepScroll(renderSettings)},"pp_a_"+safeId(p.id))));
    d.appendChild(el("div","small muted","Usual pay is used until you type the pay that actually arrived."));
    if(cfg.people.length>1){var br=el("div","btnrow");br.appendChild(confirmBtn("person"+p.id,"Remove "+(p.name||"person"),function(){cfg.people.splice(i,1);cfgNow();keepScroll(renderSettings)}));d.appendChild(br)}
    box.appendChild(d)});
  var add=el("button","linkbtn","+ Add a person");add.addEventListener("click",function(){var np={id:uid("p"),name:"",payAccount:(cfg.accounts[0]||{}).id,usualPay:0};cfg.people.push(np);cfgNow();keepScroll(renderPeopleSet);var f=$("pp_n_"+safeId(np.id));if(f){reveal($("person_"+safeId(np.id)));f.focus()}});box.appendChild(add);
}
/* accounts */
function itemsOn(id){return {bills:cfg.bills.filter(function(b){return b.account===id}).length,income:cfg.income.filter(function(x){return x.account===id}).length,
  budgets:cfg.budgets.filter(function(x){return x.account===id}).length,savings:cfg.savings.filter(function(x){return x.fromAccount===id}).length,people:cfg.people.filter(function(x){return x.payAccount===id}).length}}
function renderAccountsSet(){
  var box=clear($("setAccounts"));
  box.appendChild(el("div","small muted","The bank accounts your money moves between. Each payday, pay lands in an account, which pays its own bills first. What's left moves on to the account you choose under \u201cWhat's left moves to\u201d. The account that keeps what's left holds your left over: your money for the month."));
  var fb=el("div","box flowbox"),fh=el("h3",null,"How money moves between them");fh.id="acFlowH";fb.appendChild(fh);fb.appendChild(flowDiagram(cfg,"acFlowH"));box.appendChild(fb);
  cfg.accounts.forEach(function(a){box.appendChild(acctEditor(a))});
  var add=el("button","linkbtn","+ Add an account");add.addEventListener("click",function(){var roots=rootIds(cfg),na={id:uid("a"),name:"",colour:COLOURS[cfg.accounts.length%COLOURS.length][0],leftoverTo:roots[0]||null};cfg.accounts.push(na);cfgNow();keepScroll(renderSettings);var f=$("ac_n_"+safeId(na.id));if(f){reveal($("acct_"+safeId(na.id)));f.focus()}});box.appendChild(add);
}
function acctEditor(a){
  var d=el("div","box"),sid=safeId(a.id);d.id="acct_"+sid;
  var g=el("div","grid2");
  g.appendChild(labeled("Name",textIn(a.name,function(v){a.name=v;queueCfg()},"ac_n_"+sid)));
  g.appendChild(labeled("Colour",selectIn(COLOURS,a.colour||"grey",function(v){a.colour=v;cfgNow();keepScroll(renderAccountsSet)},"ac_c_"+sid)));d.appendChild(g);
  // What's left can't go to itself or to an account that already sends its money here (that would be a loop).
  var bad=[a.id].concat(descendants(cfg,a.id));
  var opts=[["","Keeps what's left (your left over)"]].concat(accountOptions(cfg,bad));
  d.appendChild(labeled("What's left moves to",selectIn(opts,parentId(cfg,a.id)||"",function(v){a.leftoverTo=v||null;cfgNow();keepScroll(renderSettings)},"ac_l_"+sid)));
  var n=itemsOn(a.id),parts=[];if(n.people)parts.push(plural(n.people,"person's pay","people's pay"));if(n.bills)parts.push(plural(n.bills,"bill"));if(n.income)parts.push(plural(n.income,"income"," incomes"));if(n.budgets)parts.push(plural(n.budgets,"budget"));if(n.savings)parts.push(plural(n.savings,"savings transfer"));
  d.appendChild(el("div","small muted",parts.length?"Uses: "+parts.join(", ")+".":"Nothing uses this account yet."));
  if(cfg.accounts.length>1){
    if(delAcct===a.id){var mv=el("div","box");mv.style.background="var(--surface)";
      var others=accountOptions(cfg,[a.id]),target=others[0][0];
      mv.appendChild(el("div","small",parts.length?"Move everything that uses "+(a.name||"this account")+" to:":"Nothing uses this account, so nothing needs to move."));
      if(parts.length)mv.appendChild(labeled("Move to",selectIn(others,target,function(v){target=v},"ac_mv_"+sid)));
      var br2=el("div","btnrow"),go=el("button","btn danger","Delete "+(a.name||"account"));go.id="ac_del_go_"+sid;
      go.addEventListener("click",function(){deleteAccount(a.id,target)});
      var cn=el("button","btn ghost","Cancel");cn.addEventListener("click",function(){delAcct=null;keepScroll(renderAccountsSet)});br2.appendChild(go);br2.appendChild(cn);mv.appendChild(br2);d.appendChild(mv)}
    else{var br=el("div","btnrow"),db=el("button","btn danger","Delete account…");db.addEventListener("click",function(){delAcct=a.id;keepScroll(renderAccountsSet);reveal($("acct_"+sid))});br.appendChild(db);d.appendChild(br)}}
  return d}
function deleteAccount(id,target){
  var a=accById(cfg,id);if(!a||!accById(cfg,target)||target===id)return;
  cfg.bills.forEach(function(b){if(b.account===id)b.account=target});cfg.income.forEach(function(x){if(x.account===id)x.account=target});
  cfg.budgets.forEach(function(x){if(x.account===id)x.account=target});cfg.savings.forEach(function(x){if(x.fromAccount===id)x.fromAccount=target});
  cfg.people.forEach(function(x){if(x.payAccount===id)x.payAccount=target});
  // accounts that sent their leftover here now send it where this one did
  var up=parentId(cfg,id);cfg.accounts.forEach(function(x){if(x.leftoverTo===id)x.leftoverTo=up&&up!==x.id?up:null});
  cfg.accounts=cfg.accounts.filter(function(x){return x.id!==id});
  Object.keys(months).forEach(function(k){arr(months[k]&&months[k].oneOffs).forEach(function(o){if(o&&o.account===id)o.account=target})});
  if(cur)arr(cur.oneOffs).forEach(function(o){if(o.account===id)o.account=target});
  saveMonths();delAcct=null;cfgNow();keepScroll(renderSettings);toast((a.name||"Account")+" deleted")}
/* bills */
var billQuery="",billFilter="",quickRows=null;
function renderBillsSet(){
  var box=clear($("setBills")),tools=el("div","billtools");
  var q=el("input","inp");q.type="search";q.id="billSearch";q.placeholder="Search bills";q.autocomplete="off";q.setAttribute("aria-label","Search bills by name or category");q.value=billQuery;
  q.addEventListener("input",function(){billQuery=q.value;keepScroll(renderBillsList)});tools.appendChild(q);
  var qa=el("button","btn ghost",quickRows?"Close quick add":"Quick add");qa.id="quickAddBtn";qa.setAttribute("aria-expanded",quickRows?"true":"false");
  qa.addEventListener("click",function(){quickRows=quickRows?null:newQuickRows(3,defaultBillAccount(cfg));keepScroll(renderBillsSet);if(quickRows){reveal($("qa_box"));var f=$("qa_n_0");if(f)f.focus()}});
  tools.appendChild(qa);box.appendChild(tools);
  var fc=el("div","fchips"),nm=el("button","fchip","Not monthly");nm.id="billNotMonthly";nm.type="button";nm.setAttribute("aria-pressed",billFilter==="notmonthly"?"true":"false");
  nm.addEventListener("click",function(){billFilter=billFilter?"":"notmonthly";nm.setAttribute("aria-pressed",billFilter?"true":"false");keepScroll(renderBillsList)});fc.appendChild(nm);box.appendChild(fc);
  if(quickRows)box.appendChild(quickAddBox(quickRows,accountOptions(cfg),"qa",{title:"Quick add bills",intro:"One row per bill. They're added as paid every month; open a bill afterwards to change its months or renewal date.",
    addLabel:"Add these",onAdd:function(list){list.forEach(function(nb){cfg.bills.push(nb)});quickRows=null;saveCfg(true);afterCfgChange();keepScroll(renderBillsSet);updateBadge();toast("Added "+plural(list.length,"bill"))}}));
  var list=el("div");list.id="billList";list.className="tab";list.style.gap="10px";box.appendChild(list);renderBillsList();
}
function billMatches(b,q){if(billFilter==="notmonthly"&&perYear(b)>=12)return false;return !q||String(b.name||"").toLowerCase().indexOf(q)>=0||(b.category&&categoryName(b.category).toLowerCase().indexOf(q)>=0)}
function renderBillsList(){
  var box=$("billList");if(!box)return;clear(box);var q=billQuery.trim().toLowerCase(),shown=0,narrowed=!!(q||billFilter);
  cfg.accounts.forEach(function(a){var bills=cfg.bills.filter(function(b){return b.account===a.id&&billMatches(b,q)});if(narrowed&&!bills.length)return;
    var h=el("div","accthead");h.appendChild(acctTag(a.id));if(bills.length)h.appendChild(el("span","num small muted",fmt(bills.reduce(function(t,b){return t+monthlyEquivalent(b)},0))+" a month"));box.appendChild(h);
    bills.forEach(function(b){shown++;box.appendChild(billEditor(b))});
    if(!narrowed){var add=el("button","linkbtn","+ Add a bill paid from "+(a.name||"this account"));add.addEventListener("click",function(){var nb={id:uid("b"),name:"New bill",amount:0,account:a.id,months:[]};cfg.bills.push(nb);openBill=nb.id;cfgNow();keepScroll(renderBillsList);reveal($("bill_"+safeId(nb.id)));var f=$("bn_"+nb.id);if(f){f.focus();f.select()}});box.appendChild(add)}});
  var orphans=cfg.bills.filter(function(b){return !accById(cfg,b.account)&&billMatches(b,q)});
  if(orphans.length){box.appendChild(el("div","accthead","Not linked to an account"));orphans.forEach(function(b){shown++;box.appendChild(billEditor(b))})}
  if(narrowed&&!shown)box.appendChild(el("div","empty",q?"No bills match “"+billQuery.trim()+"”"+(billFilter?" among the bills that aren't monthly.":"."):"Every bill is paid monthly."));
}
function billWhen(b){return whenText(b)+(b.category?" · "+categoryName(b.category):"")+(validDate(b.renews)?" · renews "+fmtDate(b.renews):"")}
function costText(b){return perYear(b)===12?"":fmt(annualCost(b))+" a year · "+fmt(monthlyEquivalent(b))+" a month equivalent"}
function billEditor(b){
  var wrap=el("div","bill"),head=el("button"),sid=safeId(b.id);wrap.id="bill_"+sid;head.setAttribute("aria-expanded",openBill===b.id?"true":"false");
  var hn=el("span",null,b.name),hv=el("span","num",fmt(num(b.amount))),hw=el("span","when",billWhen(b));head.appendChild(hn);head.appendChild(hv);head.appendChild(hw);
  head.addEventListener("click",function(){openBill=openBill===b.id?null:b.id;arm=null;keepScroll(renderBillsList);if(openBill===b.id)reveal($("bill_"+sid))});wrap.appendChild(head);
  if(openBill!==b.id)return wrap;
  var ed=el("div","ed"),g=el("div","grid2"),cost=el("div","small muted",costText(b)),catSel,catHint;cost.id="bc_"+b.id;
  function refreshCat(){catSel.value=b.category||"";catHint.textContent=b.categoryAuto?"Suggested from the name. Change it if it's wrong.":"";hw.textContent=billWhen(b);
    var ls=$("bl_"+b.id);if(ls&&b.lead==null&&!validDate(b.renews))ls.value=String(defaultLead(b))}
  g.appendChild(labeled("Name",textIn(b.name,function(v){b.name=v;hn.textContent=v;applyCategorySuggestion(b);refreshCat();queueCfg()},"bn_"+b.id)));
  g.appendChild(labeled("Amount each payment (£)",textIn(money2(b.amount),function(v){var r=parseMoney(v,false);if(r.invalid)return;b.amount=r.value||0;hv.textContent=fmt(b.amount);cost.textContent=costText(b);queueCfg()},"ba_"+b.id,true)));ed.appendChild(g);
  ed.appendChild(cost);
  var g2=el("div","grid2");
  g2.appendChild(labeled("Paid from",selectIn(accountOptions(cfg),b.account,function(v){b.account=v;cfgNow();keepScroll(renderBillsList);reveal($("bill_"+sid))},"bs_"+b.id)));
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
      if(!cm.length){toast("A bill needs at least one month");return}b.months=cm.length>=12?[]:cm.sort(function(x,y){return x-y});cfgNow();keepScroll(renderBillsList)});mg.appendChild(bt)})(mi)}
  mw.appendChild(mg);var ev=el("button","linkbtn","Every month");ev.addEventListener("click",function(){b.months=[];cfgNow();keepScroll(renderBillsList)});mw.appendChild(ev);ed.appendChild(mw);
  ed.appendChild(checkIn("This is savings, not a bill (for example, a Junior ISA)",b.savings,function(v){setSavingsFlag(b,v,thisMonth());refreshCat();cfgNow()},"bsv_"+b.id));
  var br=el("div","btnrow");br.appendChild(confirmBtn("bill"+b.id,"Delete bill",function(){openBill=null;
    removeWithUndo(cfg.bills,b,(b.name||"Bill")+" deleted",function(){saveCfg(true);afterCfgChange();updateBadge();rerender()},"#bill_"+sid+" > button")}));ed.appendChild(br);
  wrap.appendChild(ed);refreshCat();return wrap;
}
/* Quick add: a compact table for entering several bills at once (Settings › Bills and setup step 4). */
function newQuickRows(n,acct){var out=[];for(var i=0;i<n;i++)out.push({name:"",amount:"",account:acct||""});return out}
/* Check quick-list rows (Settings › Quick add, and setup's bills, budgets and savings): each needs a name and an amount
   over zero, or both empty to be ignored; a row with r.freq (setup's bills) also needs its months (billMonths).
   Returns {items, errors}: items are the rows that can be saved, as {r, name, amount, months}; errors [{i, f}]. */
function readRows(rows){var items=[],errors=[];
  rows.forEach(function(r,i){var name=String(r.name||"").trim(),a=parseMoney(r.amount,false);if(!name&&a.empty)return;var ok=true;
    if(!name){errors.push({i:i,f:"name"});ok=false}if(a.empty||a.invalid||!(a.value>0)){errors.push({i:i,f:"amount"});ok=false}
    var months=r.freq?billMonths(r.freq,r.month,r.picked):[];if(months===null){errors.push({i:i,f:"months"});ok=false}
    if(ok)items.push({r:r,name:name,amount:a.value,months:months})});
  return {items:items,errors:errors}}
function rowUsed(r){return String(r.name||"").trim()!==""||String(r.amount||"").trim()!==""}
/* Quick add's bills: all of them, or none while any row has a problem. */
function readQuickRows(rows,ids){rows.forEach(function(r){if(ids&&ids.indexOf(r.account)<0)r.account=ids[0]||""});var res=readRows(rows);
  var bills=res.items.map(function(x){var b={id:uid("b"),name:x.name,amount:x.amount,account:x.r.account,months:x.months};applyCategorySuggestion(b);return b});
  return {bills:res.errors.length?[]:bills,errors:res.errors}}
/* One row of a quick list: name and amount, then as asked the account (o.acct: [[id, name]…]), how often a bill is paid
   (o.freq, setup only) and Remove. Shared by Settings › Bills › Quick add and setup's bills, budgets and savings.
   o: {id(field) → the element id, noun and n ("Bill", 1) for labels, group (a label for the whole row), namePh,
   acctLabel, acctShown (a visible label instead of aria-label), onEnter, onRemove, onFreq, onName (as the name is typed)}. */
var FREQS=[["monthly","Every month"],["yearly","Once a year"],["some","Some months"]];
function quickRow(r,o){var row=el("div","qa-row"),N=o.noun+" "+o.n;
  if(o.group){row.setAttribute("role","group");row.setAttribute("aria-label",o.group)}
  var n=el("input","inp");n.id=o.id("n");n.value=r.name;n.placeholder=o.namePh||o.noun+" name";n.autocomplete="off";n.setAttribute("aria-label",N+" name");n.addEventListener("input",function(){r.name=n.value;if(o.onName)o.onName()});
  var mb=el("input","inp num");mb.id=o.id("a");mb.value=r.amount;mb.placeholder="£";mb.inputMode="decimal";mb.autocomplete="off";mb.setAttribute("aria-label",N+" amount in pounds");mb.setAttribute("enterkeyhint","next");
  mb.addEventListener("input",function(){r.amount=mb.value});mb.addEventListener("keydown",function(e){if(e.key==="Enter"){e.preventDefault();o.onEnter()}});
  row.appendChild(n);row.appendChild(mb);
  if(o.acct){var sel=selectIn(o.acct,r.account,function(v){r.account=v},o.id("s"));
    if(o.acctShown)row.appendChild(labeled(o.acctLabel,sel));else{sel.setAttribute("aria-label",N+" "+o.acctLabel.toLowerCase());row.appendChild(sel)}}
  if(o.freq)row.appendChild(labeled("How often",selectIn(FREQS,r.freq||"monthly",function(v){r.freq=v;o.onFreq()},o.id("f"))));
  var x=el("button","btn ghost","Remove");x.setAttribute("aria-label","Remove "+N.toLowerCase());x.addEventListener("click",o.onRemove);row.appendChild(x);
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
/* simple lists: other income, spending budgets, savings transfers */
function listSet(o){
  var box=clear($(o.box));box.appendChild(el("div","small muted",o.intro));
  cfg[o.key].forEach(function(it,i){var d=el("div","box"),g=el("div","grid2"),sid=safeId(it.id);d.id=o.pfx+"_"+sid;
    g.appendChild(labeled("Name",textIn(it.name,function(v){it.name=v;queueCfg()},o.pfx+"_n_"+sid)));
    g.appendChild(labeled("Amount (£)",textIn(money2(it.amount),function(v){var r=parseMoney(v,false);if(r.invalid)return;it.amount=r.value||0;queueCfg()},o.pfx+"_a_"+sid,true)));d.appendChild(g);
    d.appendChild(labeled(o.acctLabel,selectIn(accountOptions(cfg),it[o.acctField],function(v){it[o.acctField]=v;cfgNow()},o.pfx+"_s_"+sid)));
    var br=el("div","btnrow");br.appendChild(confirmBtn(o.pfx+it.id,"Remove",function(){removeWithUndo(cfg[o.key],it,(it.name||o.noun)+" removed",function(){saveCfg(true);afterCfgChange();rerender()},"#"+o.pfx+"_n_"+sid)}));d.appendChild(br);box.appendChild(d)});
  var add=el("button","linkbtn",o.addText);add.addEventListener("click",function(){var n={id:uid(o.pfx),name:"",amount:0};n[o.acctField]=o.defAcct();if(o.key==="savings")n.since=thisMonth();cfg[o.key].push(n);cfgNow();keepScroll(function(){listSet(o)});
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
    box.appendChild(el("div","small muted","Dovetail saves a backup on this phone whenever you change something. It keeps the last 10 changes and one from each of the last 14 days."));
    var list=nativeBackups();
    if(!list.length)box.appendChild(el("div","small muted","No automatic backups yet. One is made the next time you change anything."));
    list.forEach(function(b){var row=el("div","spread");row.style.cssText="padding:6px 0;border-bottom:1px solid var(--line)";
      var lab=el("div");lab.appendChild(el("div",null,backupWhen(b)));lab.appendChild(el("div","small muted",Math.max(1,Math.round(num(b.bytes)/1024))+" KB"+(b.kept?" · saved before a restore, kept 30 days":"")));row.appendChild(lab);
      row.appendChild(confirmBtn("nb:"+b.name,"Restore",function(){restoreNative(b.name)}));box.appendChild(row)});
    box.appendChild(el("h3",null,"Share or open a backup file"));
    var sr=el("div","btnrow"),sh=el("button","btn","Share backup file…");sh.id="shareBackup";
    sh.addEventListener("click",function(){var d=todayStr();var ok=nativeCall(function(){return NATIVE.share(backupText(),"dovetail-backup-"+d+".json")},false);if(!ok)toast("Couldn't prepare the backup file")});
    sr.appendChild(sh);sr.appendChild(importButton());box.appendChild(sr);
    box.appendChild(el("div","small muted","Save the file to Drive, email it to yourself or keep it in Files. To put Dovetail on another phone, share the backup file to it (WhatsApp, Quick Share, email) and open the file there. It's a copy: changes made on one phone don't reach the other. Share on the Pay tab sends the same file with the month's transfers, to bring the other phone up to date."));
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
  // Start again: only on the phone, where the current figures can be kept as a backup first; never for the example.
  if(NATIVE&&typeof NATIVE.keepBackup==="function"&&!cfg.example){box.appendChild(el("h3",null,"Start again"));
    box.appendChild(el("div","small muted","Set Dovetail up from scratch. Your current figures are saved as a backup on this phone first, kept for 30 days, and setup will offer to bring them back."));
    var sa=confirmBtn("startAgain","Start again",startAgain,"Tap again to start again");sa.id="startAgain";var sr=el("div","btnrow");sr.appendChild(sa);box.appendChild(sr)}
}
/* Settings › Backup, export & restore › Start again. Anything still waiting to be saved is saved, then the figures are
   kept as a backup on the phone; if that fails nothing changes. Reminders for the old figures are cleared, the months
   are removed and the settings are cut down to this phone's own (appearance and notifications), never touching the old
   Wealth data, and setup starts, offering to bring the backup back. App lock, notifications on or off, the notification
   time and the appearance stay as they are, even if the app is closed before setup finishes: settings without
   setupDone open setup, with that appearance, and the newest automatic backup offered (boot). */
function startAgain(){
  try{if(saveT){clearTimeout(saveT);saveT=null;flushMonth()}if(cfgT||remT){clearTimeout(cfgT);clearTimeout(remT);cfgT=remT=null;saveCfg(true);afterCfgChange()}}catch(e){}
  if(nativeCall(function(){return NATIVE.keepBackup(backupText())},false)!==true){toast("Couldn't save a backup, so nothing was changed.");return}
  clearTimeout(nbT);nbT=null;clearTimeout(schT);schT=null;
  if(notifyNative())nativeCall(function(){NATIVE.setNotificationSchedule(JSON.stringify({version:1,time:cfg.notify.time,amounts:!!cfg.notify.amounts,entries:[]}))});
  var mine={schema:SCHEMA,appearance:clone(cfg.appearance),notify:clone(cfg.notify)};
  lsDel(K_CFG);lsDel(K_MON);cfg=normCfg(mine);months={};cur=null;lsSet(K_CFG,mine,true);
  openBill=null;openOne=null;openRem=null;renewing=null;quickRows=null;billQuery="";billFilter="";importOffer=null;showBackup=false;restoreText="";restoreArm=false;restoreMsg="";arm=null;delAcct=null;whatsNew=false;paySig="";hideUndo();
  var nb=nativeBackups(),kept=nb.filter(function(b){return b.kept})[0]||nb[0];restoreOffer=kept?Object.assign({again:true},kept):null;
  startSetup();goTab("setup");var h=$("suTitle");if(h)try{h.focus()}catch(e){}}
function restoreBox(box,label){
  var ti=el("textarea","inp");ti.id="backupIn";ti.placeholder='Paste a backup here: {"app":"payday-transfers", …}';ti.value=restoreText;ti.addEventListener("input",function(){restoreText=ti.value;restoreArm=false});
  box.appendChild(labeled(label||"Restore from a backup",ti));
  var rb=el("button","btn danger",restoreArm?"Tap again to replace everything":"Restore");rb.id="restoreBtn";rb.addEventListener("click",doRestore);var r2b=el("div","btnrow");r2b.appendChild(rb);box.appendChild(r2b);
  var m=el("div","hint"+(restoreMsg&&restoreMsg.indexOf("restored")<0?" err":""),restoreMsg);m.id="restoreMsg";box.appendChild(m)}
function backupText(){var o={app:"payday-transfers",version:BACKUP_VERSION,savedAt:new Date().toISOString(),config:cfg,months:months};if(wealthRaw!=null)o.wealth=wealthRaw;return JSON.stringify(o)}
/* Restoring runs the same upgrade as opening the app, so backups from any earlier version still work. */
function applyBackup(data,fromFile){
  if(num(data.version)>BACKUP_VERSION)return "newer";
  var c2,m2,wm;try{c2=normCfg(data.config);m2=normMonths(data.months);wm=data.wealth!=null?clone(data.wealth):wealthRaw}catch(e){logError("restore",e&&e.message);return "bad"}
  // Notification settings belong to this phone (its permission, its lock screen), so a restore never changes them.
  // Appearance comes back with a restore, but not from a file opened from someone else's phone, nor from a backup
  // made before 2.2 (which has none).
  if(cfg&&cfg.notify)c2.notify=clone(cfg.notify);
  if(cfg&&cfg.appearance&&(fromFile||!data.config||data.config.appearance==null))c2.appearance=clone(cfg.appearance);
  try{migrate(c2,m2,wm);defaultMonth(c2.payday)}catch(e){logError("restore",e&&e.message);return "bad"}if(!c2.accounts.length)return "empty";
  // The old Wealth data on this phone is never replaced; a backup's copy is only kept when the phone has none.
  var w2=wealthRaw!=null?wealthRaw:wm;
  if(!lsSet(K_CFG,c2,true)||!lsSet(K_MON,m2,true)||(wealthRaw==null&&w2!=null&&!lsSet(K_W,w2)))return false;
  cfg=c2;months=m2;wealthRaw=w2;openBill=null;openOne=null;setup=null;paySig="";quickRows=null;billQuery="";billFilter="";importOffer=null;hideUndo();return true}
/* Just before a restore or an opened file replaces everything: an automatic backup that's kept for 30 days. */
function keepCurrent(){if(!backupsAllowed())return true;clearTimeout(nbT);nbT=null;
  // true unless the kept backup couldn't be written (with no keepBackup, saveBackup skips a copy it already has: still kept).
  return nativeCall(function(){if(typeof NATIVE.keepBackup==="function")return NATIVE.keepBackup(backupText())===true;NATIVE.saveBackup(backupText());return true},false)}
function restoreError(r){return r==="newer"?"This backup was made by a newer version of Dovetail. Update the app first.":r==="empty"?"This backup has no accounts in it.":r==="bad"?"That backup couldn't be opened, so nothing was changed.":"Couldn't save the backup on this phone."}
function parseBackup(text){try{var d=JSON.parse(text);return d&&d.config&&Array.isArray(d.config.bills)?d:null}catch(e){return null}}
function afterRestore(msg){applyAppearance();queueSchedule();if(cfg.lastVersion!==VERSION){cfg.lastVersion=VERSION;saveCfg(true)}monthKey=defaultMonth(payCfg());if(tab==="setup"||location.hash==="#setup"){try{history.replaceState(null,"","#pay")}catch(e){}}route();paySig=peopleSig();goMonth(monthKey);if(tab==="settings")renderSettings();toast(msg||"Backup restored")}
function restoreNative(name){var d=parseBackup(nativeCall(function(){return NATIVE.readBackup(name)},""));
  if(!d){toast("That backup couldn't be read");return false}
  var was=restoreOffer;keepCurrent();restoreOffer=null;var res=applyBackup(d);if(res!==true){restoreOffer=was;toast(restoreError(res));return false}
  afterRestore();queueNativeBackup();return true}
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
  if(nb.length){var l=el("div","btnrow");nb.forEach(function(b,i){var rb=el("button","btn"+(i?" ghost":""),"Restore backup from "+backupWhen(b)+(b.kept?" (kept before a restore)":""));rb.id="recover_"+i;
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
  if(num(d.version)>BACKUP_VERSION){toast(restoreError("newer"));return}
  var c2,m2,w2;try{c2=normCfg(d.config);m2=normMonths(d.months);w2=d.wealth!=null?clone(d.wealth):lsGet(K_W);migrate(c2,m2,w2);defaultMonth(c2.payday);c2.notify=normCfg({}).notify}catch(e){logError("recover",e&&e.message);toast("That backup couldn't be opened, so nothing was changed.");return}
  if(!c2.accounts.length){toast(restoreError("empty"));return}
  if(!setAside()){toast(ASIDE_FAILED);return}if(!lsSet(K_CFG,c2,true)||!lsSet(K_MON,m2,true)){toast("Couldn't save the backup on this phone.");return}
  if(lsGet(K_W)==null&&d.wealth!=null)lsSet(K_W,clone(d.wealth));
  location.reload()}
function renderRestoreOffer(target){
  var box=clear(target||$("restoreOffer"));if(!restoreOffer)return;
  var c=el("div","banner col");
  // After "Start again": the figures that were there a moment ago.
  if(restoreOffer.again){c.appendChild(el("b",null,"Bring back what you had before?"));c.appendChild(el("div",null,"Your figures from "+backupWhen(restoreOffer)+" are saved on this phone."))}
  else c.appendChild(el("div",null,"Found an automatic backup from "+backupWhen(restoreOffer)+". Restore your bills, months and settings from it?"));
  var r=el("div","btnrow"),y=el("button","btn","Restore backup"),n=el("button","btn ghost","Start fresh");
  y.addEventListener("click",function(){restoreNative(restoreOffer.name)});
  n.addEventListener("click",function(){restoreOffer=null;rerender();toast("Starting fresh. Your old backups are still in Settings")});
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
  if(num(data.version)>BACKUP_VERSION){toast(restoreError("newer"));return}
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
    if(res!==true){importOffer.msg=restoreError(res);rerender();return}importOffer=null;afterRestore(up?"Updated":null);goTab("pay");queueNativeBackup();if(up)focusPayH()});
  var n=el("button","btn ghost","Cancel");n.id="importNo";n.addEventListener("click",function(){importOffer=null;rerender();toast("Nothing was changed");if(up)focusPayH()});
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
  if(!restoreArm&&cfg.setupDone){restoreArm=true;restoreMsg=cfg.setupDone?"This replaces all people, accounts, bills and saved months on this phone.":"";rerender();return}
  keepCurrent();restoreOffer=null;var res=applyBackup(data);
  if(res!==true){restoreMsg=restoreError(res);restoreArm=false;rerender();return}
  restoreText="";restoreArm=false;restoreMsg="Backup restored.";afterRestore();queueNativeBackup();
}

/* ---------- FIRST-RUN SETUP ----------
   Seven steps: welcome, pay, payday, accounts, bills, spending and saving, and a preview of the first payday. Nothing is
   saved until setup finishes: "Looks right, start" on the last step, or "Finish later" (or "Skip setup for now") on any
   other, which keeps whatever has been entered and fills in the rest (finishSetup). The Pay tab then shows a "Finish
   setting up" card for what's still missing. Back keeps everything typed; "Skip this step" (payday, bills, spending and
   saving) moves on and leaves that step out, until Next is pressed on it again. */
var setup=null,SETUP_STEPS=7;
var SETUP_TITLES=["Welcome to Dovetail","Your pay","Your payday","Your accounts","Your bills","Spending and saving","Your first payday"];
function startSetup(){setup={step:1,people:[{id:uid("p"),name:"",pay:"",payAccount:null}],income:[],sameDay:null,payday:{day:"",weekend:true},skip:{},
  shape:null,pending:null,edited:false,accounts:[],bills:{},billOpen:{},budgets:[],savings:[],payWarned:false,bad:[],msg:"",note:false,focusBad:false}}
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
/* Suggestions in the bills and spending steps (tap one to fill in a row). Council Tax is usually paid April to January;
   a TV Licence and car insurance once a year. */
var BILL_SUGGESTIONS=[["Rent"],["Mortgage"],["Council Tax",{freq:"some",picked:[4,5,6,7,8,9,10,11,12,1]}],["Energy"],["Water"],["Broadband"],["Mobile phone"],
  ["TV Licence",{freq:"yearly"}],["Car insurance",{freq:"yearly"}],["Home insurance"],["Streaming"],["Gym"]];
var BUDGET_SUGGESTIONS=["Food shopping","Fuel","Travel","Going out","Clothes","Gifts","Pets","Children"];
var SAVINGS_SUGGESTIONS=["Emergency fund","Holiday","Christmas","Car","House deposit"];
var DAY_NAMES=["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"],NUMBER_WORDS=["no","one","two","three","four","five","six","seven","eight","nine"];
function longDate(s){var p=s.split("-").map(Number);return DAY_NAMES[dow(s)]+" "+p[2]+" "+MN[p[1]-1]+(String(p[0])!==todayStr().slice(0,4)?" "+p[0]:"")}
/* Setup's household so far, with names filled in, for the flow helpers (parentId, flowOrder, flowStory). */
function suAcctName(a){return String(a.name||"").trim()||"Account "+(setup.accounts.indexOf(a)+1)}
function suPeople(){return setup.people.map(function(p,i){return {id:p.id,name:personName(p,i),payAccount:p.payAccount}})}
function suCfg(){var s=setup;return {accounts:s.accounts.map(function(a){return {id:a.id,name:suAcctName(a),colour:a.colour,leftoverTo:a.leftoverTo}}),
  people:suPeople(),income:s.income.filter(function(x){return String(x.name||"").trim()}).map(function(x){return {id:x.id,name:x.name.trim(),account:x.account}})}}
function suAcct(id){return setup.accounts.filter(function(a){return a.id===id})[0]||null}
function suRoot(c){return rootIds(c)[0]||(c.accounts[0]&&c.accounts[0].id)||null}
/* Point everything at an account that exists: people at the first account, other income, budgets and savings at the one
   that keeps what's left, and bills typed for an account that's gone at the usual bills account. */
function fixSetupRefs(){var s=setup;if(!s.accounts.length)return;
  var ids=s.accounts.map(function(a){return a.id});s.accounts.forEach(function(a){if(a.leftoverTo&&ids.indexOf(a.leftoverTo)<0)a.leftoverTo=null});
  var c=suCfg(),first=flowOrder(c)[0],root=suRoot(c),to=defaultBillAccount({people:c.people.map(function(p){return {payAccount:ids.indexOf(p.payAccount)<0?first:p.payAccount}}),accounts:c.accounts});
  s.people.forEach(function(p){if(ids.indexOf(p.payAccount)<0)p.payAccount=first});
  s.income.concat(s.budgets,s.savings).forEach(function(x){if(ids.indexOf(x.account)<0)x.account=root});
  Object.keys(s.bills).forEach(function(k){if(ids.indexOf(k)>=0)return;var rows=s.bills[k].filter(rowUsed);delete s.bills[k];delete s.billOpen[k];
    if(rows.length){s.bills[to]=(s.bills[to]||[]).filter(rowUsed).concat(rows);s.billOpen[to]=true}})}
/* A starting point fills in the accounts. An account with the same role as one already there (Alex's own account, the
   joint bills account…) keeps that account's id, so what was typed for it (bills, budgets, savings, other income) stays
   with it when the starting point is filled in again, after someone is added in step 2, say. Anything typed for an
   account that's gone moves on (fixSetupRefs). */
function applyShape(kind){var s=setup,sh=setupShape(kind,suPeople()),had={},taken={},map={};
  s.accounts.forEach(function(a){taken[a.id]=1;if(a.role)had[a.role]=a.id});
  // A new account never takes the id of one that's there: ids are made from the time and a random number, and the time
  // can be the same.
  sh.accounts.forEach(function(a){var id=had[a.role];if(!id){id=a.id;while(taken[id])id=uid("a")}taken[id]=1;map[a.id]=id});
  sh.accounts.forEach(function(a){a.id=map[a.id];if(a.leftoverTo)a.leftoverTo=map[a.leftoverTo]});Object.keys(sh.payAccount).forEach(function(k){sh.payAccount[k]=map[sh.payAccount[k]]});
  s.accounts=sh.accounts;s.people.forEach(function(p){p.payAccount=sh.payAccount[p.id]});s.shape=kind;s.pending=null;s.edited=false;fixSetupRefs()}
function pickShape(kind){var s=setup;if(kind===s.shape&&!s.pending)return;
  if(kind===s.shape){s.pending=null}else if(s.edited&&s.accounts.length)s.pending=kind;else applyShape(kind);suRedraw("su_shape_"+kind)}
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
function goStep(n){var s=setup;s.step=n;s.bad=[];s.msg="";s.note=false;s.pending=null;renderSetup();toTop();var h=$("suTitle");if(h)try{h.focus({preventScroll:true})}catch(e){}}
/* Redraw the step in place, keeping the scroll position and focus (on the element with that id, or where it was). */
function suRedraw(focusId){var a=document.activeElement,id=focusId||(a&&a.id);keepScroll(renderSetup);var e=id&&$(id);if(e)try{e.focus({preventScroll:true})}catch(x){}}
/* A failed Next: say what's wrong next to the buttons and mark the fields. */
function suFail(msg,bad){var s=setup;s.msg=msg;s.note=false;s.bad=bad||[];s.focusBad=true;keepScroll(renderSetup)}
function suCard(box,hid,title,intro){var c=el("section","card");c.setAttribute("aria-labelledby",hid);var h=el("h2",null,title);h.id=hid;c.appendChild(h);if(intro)c.appendChild(el("p","small muted",intro));box.appendChild(c);return c}
function suMoney(v,on,id){var i=textIn(v,on,id,true);i.placeholder="0.00";i.addEventListener("blur",function(){on(i.value)});return i}
function setupNav(box,o){var s=setup;
  var msg=el("div",s.note?"banner":"hint err");msg.id="su_msg";msg.setAttribute("aria-live","polite");box.appendChild(msg);
  if(s.msg){var t=s.msg;setTimeout(function(){if($("su_msg")===msg)msg.textContent=t},30)}else msg.hidden=true;
  var nb=el("div","btnrow su-nav");
  if(o.back!==false){var bk=el("button","btn ghost","Back");bk.id="su_back";bk.addEventListener("click",function(){goStep(s.step-1)});nb.appendChild(bk)}
  var nx=el("button","btn",o.next||"Next");nx.id=o.nextId||"su_next";nx.addEventListener("click",o.onNext);nb.appendChild(nx);box.appendChild(nb);
  var links=el("div","su-links");
  if(o.skip){var sk=el("button","linkbtn","Skip this step");sk.id="su_skip";sk.addEventListener("click",o.skip);links.appendChild(sk)}
  if(o.later!==false){var lt=el("button","linkbtn","Finish later");lt.id="su_later";lt.addEventListener("click",finishLater);links.appendChild(lt)}
  if(links.firstChild)box.appendChild(links)}
function renderSetup(){
  var box=clear($("setup")),s=setup;if(!s){startSetup();s=setup}
  var head=el("div","pagehead su-head"),h1=el("h1",null,SETUP_TITLES[s.step-1]);h1.id="suTitle";h1.tabIndex=-1;head.appendChild(h1);
  var sn=el("div","su-stepn");sn.appendChild(el("span",null,"Step "+s.step+" of "+SETUP_STEPS));
  var dots=el("div","steps-dots");dots.setAttribute("aria-hidden","true");for(var i=1;i<=SETUP_STEPS;i++)dots.appendChild(el("i",i<=s.step?"on":""));sn.appendChild(dots);head.appendChild(sn);box.appendChild(head);
  [suWelcome,suPay,suPayday,suAccounts,suBills,suSpend,suPreview][s.step-1](box,s);
  s.bad.forEach(function(id,j){var e=$(id);if(!e)return;e.classList.add("bad");e.setAttribute("aria-invalid","true");e.setAttribute("aria-describedby","su_msg");
    if(!j&&s.focusBad){s.focusBad=false;var f=e.matches("input,select,textarea,button")?e:e.querySelector("button,input,select");try{f.focus()}catch(x){}reveal(e.closest(".qa-row,.box,.card")||e)}})}

/* Step 1: welcome, with the three ways in. An automatic backup or an opened file is offered at the top. */
function suWelcome(box,s){
  if(importOffer)box.appendChild(importOfferCard());
  var ro=el("div");ro.id="restoreOfferSetup";box.appendChild(ro);renderRestoreOffer(ro);
  box.appendChild(el("p","su-lead","Dovetail works out the transfers to make between your accounts each payday, so every bill is covered and you can see what's left. Setting up takes about five minutes, and you can change anything later."));
  var c=el("div","card su-choices");
  var go=el("button","btn","Set up my household");go.id="su_start";go.addEventListener("click",function(){goStep(2)});c.appendChild(go);
  var rd=el("details","su-restore");rd.id="su_restore";rd.appendChild(el("summary","btn ghost","Restore from a backup"));
  var ri=el("div","su-restore-in");ri.appendChild(el("p","small muted","Open a backup file you saved or were sent, or paste a backup you copied."));
  var ib=el("div","btnrow");ib.appendChild(importButton("Open a backup file","su_import"));ri.appendChild(ib);restoreBox(ri,"Or paste a backup");rd.appendChild(ri);
  if(restoreText||restoreMsg)rd.open=true;rd.addEventListener("toggle",function(){if(rd.open)reveal(rd)});c.appendChild(rd);
  var ex=el("button","btn ghost","Explore an example");ex.id="su_example";ex.addEventListener("click",loadExample);c.appendChild(ex);box.appendChild(c);
  var lr=el("div","su-links"),later=el("button","linkbtn","Skip setup for now");later.id="su_later";later.addEventListener("click",finishLater);lr.appendChild(later);box.appendChild(lr)}

/* Step 2: who's paid, and how much. Other regular income is optional, behind a link until there is some. */
function suPay(box,s){
  var c=suCard(box,"su_h_pay","Who gets paid?");
  c.appendChild(el("p","small","Take-home pay is the money that actually reaches your bank account, after tax, National Insurance and pension. It's the ‘net pay’ on a payslip, or check your bank statement."));
  c.appendChild(el("p","small","Paid a different amount each month? Use a typical month. You'll type the real figure each payday."));
  c.appendChild(el("p","small muted","Not employed? Use what you usually receive each month, such as benefits, a pension or self-employed income."));
  s.people.forEach(function(p,ix){var row=el("div","box");row.setAttribute("role","group");row.setAttribute("aria-label","Person "+(ix+1));var g=el("div","su-pair");
    var n=textIn(p.name,function(v){p.name=v},"su_p_"+ix);n.autocomplete="off";n.placeholder="Person "+(ix+1);g.appendChild(labeled("Name",n));
    g.appendChild(labeled("Usual take-home pay (£)",suMoney(p.pay,function(v){p.pay=v},"su_pu_"+ix)));row.appendChild(g);
    if(s.people.length>1){var x=el("button","btn ghost","Remove");x.setAttribute("aria-label","Remove person "+(ix+1));x.addEventListener("click",function(){s.people.splice(ix,1);suRedraw("su_addp")});
      var xr=el("div","btnrow");xr.appendChild(x);row.appendChild(xr)}
    c.appendChild(row)});
  var add=el("button","linkbtn","+ Add someone");add.id="su_addp";add.addEventListener("click",function(){s.people.push({id:uid("p"),name:"",pay:"",payAccount:null});suRedraw("su_p_"+(s.people.length-1));reveal($("su_p_"+(s.people.length-1)).closest(".box"))});c.appendChild(add);
  function addIncome(){s.income.push({id:uid("i"),name:"",amount:"",account:null});suRedraw("su_in_"+(s.income.length-1));reveal($("su_in_"+(s.income.length-1)).closest(".box"))}
  if(!s.income.length){var ai=el("button","linkbtn su-alone","+ Add other income");ai.id="su_addi";ai.addEventListener("click",addIncome);box.appendChild(ai)}
  else{var c2=suCard(box,"su_h_inc","Any other regular income?","Money that comes in every month besides pay, such as Child Benefit. You'll choose the account it goes into in step 4.");
    s.income.forEach(function(x,ix){var row=el("div","box");row.setAttribute("role","group");row.setAttribute("aria-label","Other income "+(ix+1));var g=el("div","su-pair");
      var n=textIn(x.name,function(v){x.name=v},"su_in_"+ix);n.autocomplete="off";n.placeholder="e.g. Child Benefit";g.appendChild(labeled("Name",n));
      g.appendChild(labeled("Amount a month (£)",suMoney(x.amount,function(v){x.amount=v},"su_inv_"+ix)));row.appendChild(g);
      var rm=el("button","btn ghost","Remove");rm.setAttribute("aria-label","Remove other income "+(ix+1));rm.addEventListener("click",function(){s.income.splice(ix,1);suRedraw("su_addi")});
      var rr=el("div","btnrow");rr.appendChild(rm);row.appendChild(rr);c2.appendChild(row)});
    var more=el("button","linkbtn","+ Add other income");more.id="su_addi";more.addEventListener("click",addIncome);c2.appendChild(more)}
  setupNav(box,{back:true,onNext:function(){var bad=[];
    s.people.forEach(function(p,ix){if(parseMoney(p.pay,false).invalid)bad.push("su_pu_"+ix)});
    if(bad.length)return suFail("Type pay as an amount, like 1850.00.",bad);
    var res=readRows(s.income);if(res.errors.length)return suFail("Each income needs a name and an amount a month, like 110.00.",res.errors.map(function(e){return (e.f==="name"?"su_in_":"su_inv_")+e.i}));
    var noPay=s.people.some(function(p){return !(num(p.pay)>0)});
    if(noPay&&!s.payWarned){s.payWarned=true;s.msg="Without pay, Dovetail can't show what's left. You can add it later.";s.note=true;s.bad=[];suRedraw();return}
    s.people.forEach(function(p,ix){p.name=personName(p,ix)});s.income=s.income.filter(rowUsed);goStep(3)}})}

/* Step 3: one payday for the household (the day transfers are made). Skipping it leaves months following the calendar. */
function suNextPayday(pc){var nx=nextPayday(pc);return nx?"Your next payday: "+longDate(nx.date)+". That pay is for "+mLabel(nx.month)+".":""}
function suPaydayCfg(){var pd=setup.payday;return pd.day?{day:pd.day==="last"?"last":Number(pd.day),weekend:pd.weekend!==false}:{}}
function suPayday(box,s){var multi=s.people.length>1,pd=s.payday;
  var c=suCard(box,"su_h_day","When does pay arrive?");
  if(multi){var fs=segRadios("su_same","Are you all paid on the same day?",[["yes","Yes"],["no","No"]],s.sameDay===true?"yes":s.sameDay===false?"no":"",function(v){s.sameDay=v==="yes";suRedraw("su_same_"+v)});
    fs.classList.add("su-q");fs.querySelector(".segrow").classList.add("two");c.appendChild(fs)}
  if(!multi||s.sameDay!=null){
    var opts=[["","Choose a day"]];for(var i=1;i<=31;i++)opts.push([String(i),ordinal(i)+" of the month"]);opts.push(["last","Last working day of the month"]);
    c.appendChild(labeled(multi&&s.sameDay===false?"Pick the day you'll make the transfers, once everyone's pay is in.":"Payday",selectIn(opts,String(pd.day||""),function(v){pd.day=v;suRedraw("su_day")},"su_day")));
    if(pd.day&&pd.day!=="last")c.appendChild(checkIn("If it falls on a weekend, we're paid the Friday before",pd.weekend!==false,function(v){pd.weekend=v;suRedraw("su_wk")},"su_wk"));
    var line=pd.day?suNextPayday(suPaydayCfg()):"";if(line){var nl=el("div","banner good",line);nl.id="su_next_payday";c.appendChild(nl)}}
  setupNav(box,{back:true,skip:function(){s.skip[3]=true;enterAccounts();goStep(4)},onNext:function(){delete s.skip[3];enterAccounts();goStep(4)}})}

/* Step 4: accounts, and how money moves between them. A starting point fills in the accounts (setupShape in calc.js);
   they can then be renamed, added, removed and re-pointed. Each person must be paid into an account. */
function enterAccounts(){var s=setup;if(s.shape&&!s.edited)applyShape(s.shape);else fixSetupRefs()}
function suAccounts(box,s){
  var c=suCard(box,"su_h_move","How does your money move?");
  c.appendChild(el("p",null,"Each payday, pay lands in an account. That account pays its own bills first. Whatever's left moves on to the next account, and so on. The last account keeps what's left over: your money for the month."));
  var fs=el("fieldset","su-shapes");fs.setAttribute("role","radiogroup");fs.appendChild(el("legend","lbl","Pick a starting point"));
  var cur=s.pending||s.shape,words=SHAPE_TEXT[s.people.length>1?"more":"one"],ppl=suPeople();
  SETUP_SHAPES.forEach(function(kind){var l=el("label","su-shape"),r=el("input");r.type="radio";r.name="su_shape";r.id="su_shape_"+kind;r.value=kind;r.checked=cur===kind;
    r.addEventListener("change",function(){if(r.checked)pickShape(kind)});
    var b=el("span","su-shape-b");b.appendChild(el("span","su-radio"));b.appendChild(miniDiagram(setupShape(kind,ppl),ppl));
    var t=el("span","su-shape-t");t.appendChild(el("b",null,words[kind][0]));t.appendChild(el("span",null,words[kind][1]));b.appendChild(t);
    l.appendChild(r);l.appendChild(b);fs.appendChild(l)});
  c.appendChild(fs);
  if(s.pending){var pb=el("div","banner col");pb.id="su_replace";var q=el("div",null,"Replace the accounts below?");q.setAttribute("role","alert");pb.appendChild(q);
    var br=el("div","btnrow"),y=el("button","btn","Replace them"),n=el("button","btn ghost","Keep mine");y.id="su_replace_yes";n.id="su_replace_no";
    y.addEventListener("click",function(){applyShape(s.pending);suRedraw("su_shape_"+s.shape)});
    n.addEventListener("click",function(){s.pending=null;suRedraw(s.shape?"su_shape_"+s.shape:null)});br.appendChild(y);br.appendChild(n);pb.appendChild(br);c.appendChild(pb)}
  // What the choice means comes first (the diagram), then the details to check.
  if(s.accounts.length){
    var sc=suCfg(),order=flowOrder(sc),nm=function(id){return (accById(sc,id)||{}).name||""},opts=order.map(function(id){return [id,nm(id)]});
    c.appendChild(suDiagramBox(sc));
    var c2=suCard(box,"su_h_check","Check your accounts","Rename them to match your bank, if you like. You can change all of this later in Settings.");
    var wb=el("div","box su-where");wb.setAttribute("role","group");wb.setAttribute("aria-labelledby","su_h_where");var wh=el("h3",null,"Where does each pay arrive?");wh.id="su_h_where";wb.appendChild(wh);
    s.people.forEach(function(p,ix){wb.appendChild(labeled(possessive(personName(p,ix))+" pay goes into",selectIn(opts,p.payAccount,function(v){p.payAccount=v;s.edited=true;suRedraw("su_pa_"+ix)},"su_pa_"+ix)))});
    s.income.forEach(function(x,ix){if(!String(x.name||"").trim())return;wb.appendChild(labeled(x.name.trim()+" goes into",selectIn(opts,x.account,function(v){x.account=v;s.edited=true;suRedraw("su_ia_"+ix)},"su_ia_"+ix)))});
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
      var bad=[id].concat(descendants(sc,id)),lo=[["","…stays here (this is your left over)"]].concat(order.filter(function(x){return bad.indexOf(x)<0}).map(function(x){return [x,"…moves to "+nm(x)]}));
      b.appendChild(labeled("When this account's bills are paid, what's left…",selectIn(lo,parentId(sc,id)||"",function(v){a.leftoverTo=v||null;s.edited=true;suRedraw("su_l_"+ix)},"su_l_"+ix)));
      c2.appendChild(b)});
    var add=el("button","linkbtn","+ Add an account");add.id="su_adda";add.addEventListener("click",function(){var na={id:uid("a"),name:"",colour:COLOURS[s.accounts.length%COLOURS.length][0],leftoverTo:suRoot(suCfg())};
      s.accounts.push(na);s.edited=true;suRedraw("su_a_"+(s.accounts.length-1));reveal($("su_a_"+(s.accounts.length-1)).closest(".box"))});c2.appendChild(add)}
  setupNav(box,{back:true,onNext:function(){
    if(!s.accounts.length)return suFail("Pick how your money moves first. “Something else” starts you with one account.",["su_shape_joint"]);
    var names=s.accounts.map(suAcctName);s.accounts.forEach(function(a,i){a.name=names[i]});s.pending=null;
    var order=flowOrder(suCfg());s.accounts.sort(function(a,b){return order.indexOf(a.id)-order.indexOf(b.id)});fixSetupRefs();enterBills();goStep(5)}})}
/* The diagram, the worked example and, when more than one account keeps what's left, a plain note. */
function suDiagramBox(sc){var dg=el("div","box su-dia");dg.id="su_dia";var dh=el("h3",null,"How money moves between them");dh.id="su_h_dia";dg.appendChild(dh);dg.appendChild(flowDiagram(sc,"su_h_dia"));
  var ex=suExample(sc);if(ex){var ep=el("p","small",ex);ep.id="su_example_line";dg.appendChild(ep)}
  var roots=rootIds(sc).length;if(roots>1){var rn=NUMBER_WORDS[roots]||String(roots),cap=rn.charAt(0).toUpperCase()+rn.slice(1);var mr=el("div","banner",cap+" accounts keep what's left, so you'll see "+rn+" left-over amounts. That's fine if it's what you want.");mr.id="su_roots";dg.appendChild(mr)}
  return dg}
/* An account renamed: its name in every list and in the diagram, without redrawing the field being typed in. */
function suRefreshNames(a){var name=suAcctName(a);
  document.querySelectorAll('#setup select[id^="su_pa_"] option,#setup select[id^="su_ia_"] option,#setup select[id^="su_l_"] option').forEach(function(o){
    if(o.value===a.id)o.textContent=(o.parentNode.id.indexOf("su_l_")===0?"\u2026moves to ":"")+name});
  var old=$("su_dia");if(old)old.parentNode.replaceChild(suDiagramBox(suCfg()),old)}
/* "For example: if Alex's account has £20 of bills, the rest of Alex's pay, £2,080.00, moves to Joint bills." Real bills
   typed for that account are used when there are some. */
function suExample(sc){var s=setup,order=flowOrder(sc),nm=function(id){return (accById(sc,id)||{}).name||""};
  var withPar=order.filter(function(id){return parentId(sc,id)}),paid=function(id){return s.people.filter(function(p){return p.payAccount===id})};
  var pick=withPar.filter(function(id){return paid(id).length})[0]||withPar[0];
  if(!pick){var r=order[0],who=paid(r).map(function(p){return possessive(personName(p,s.people.indexOf(p)))});
    return who.length?"For example: "+listAnd(who)+" pay "+(who.length>1?"arrive":"arrives")+" in "+nm(r)+". Bills and spending come out of it, and what's left stays there.":""}
  var m=mNum(thisMonthFor()),ppl=paid(pick),got=readRows(s.bills[pick]||[]).items.reduce(function(t,x){return applies({months:x.months},m)?t+x.amount:t},0);
  var billTxt=got>0?fmt(got):"£20",pay=ppl.reduce(function(t,p){return t+num(p.pay)},0),bills=got>0?got:20;
  var whose=ppl.length?"the rest of "+listAnd(ppl.map(function(p){return possessive(personName(p,s.people.indexOf(p)))}))+" pay"+(pay>bills?", "+fmt(pay-bills)+",":""):"the rest";
  return "For example: if "+nm(pick)+" has "+billTxt+" of bills, "+whose+" moves to "+nm(parentId(sc,pick))+"."}
function thisMonthFor(){return defaultMonth(setup.skip[3]?{}:suPaydayCfg())}

/* Step 5: bills, account by account in flow order. The usual bills accounts (nobody's paid into them and they pass what's
   left on) open with three rows; with none, the account everyone is paid into if it passes what's left on (one person's
   "bills account, then a spending account"), else the account that keeps what's left. The others are a link until opened. */
function enterBills(){var s=setup,sc=suCfg(),order=flowOrder(sc),paid=sc.people.map(function(p){return p.payAccount});
  var match=order.filter(function(id){return paid.indexOf(id)<0&&parentId(sc,id)});if(!match.length)match=[sharedPayAccount(sc)||suRoot(sc)];
  order.forEach(function(id){if(s.billOpen[id]===undefined){s.billOpen[id]=match.indexOf(id)>=0;
    if(s.billOpen[id]&&!(s.bills[id]||[]).length)s.bills[id]=[newBillRow(),newBillRow(),newBillRow()]}})}
/* Suggestions: plain buttons. One hides once a row in its section has that name, whether it was tapped or typed
   (suChipsRefresh runs as names are typed). */
function suChips(sec,names,rows,label,onPick){var g=el("div","fchips su-chips");g.setAttribute("role","group");g.setAttribute("aria-label",label);
  names.forEach(function(n){var b=el("button","fchip"),pl=el("span",null,"+ ");pl.setAttribute("aria-hidden","true");b.appendChild(pl);b.appendChild(document.createTextNode(n));b.type="button";
    b.setAttribute("data-name",n.trim().toLowerCase());b.addEventListener("click",function(){onPick(n)});g.appendChild(b)});
  sec.appendChild(g);suChipsRefresh(g,rows);return g}
function suChipsRefresh(g,rows){var taken=takenNames(rows),any=false;
  g.querySelectorAll("button[data-name]").forEach(function(b){var t=taken.indexOf(b.getAttribute("data-name"))>=0;b.hidden=t;if(!t)any=true});g.hidden=!any}
function takenNames(rows){return rows.map(function(r){return String(r.name||"").trim().toLowerCase()}).filter(Boolean)}
function suBills(box,s){
  box.appendChild(el("p",null,"Add the bills that go out regularly. Rough amounts are fine: you can change them any time."));
  var tip=el("div","su-tip");tip.appendChild(el("b",null,"Not sure what your bills are? "));tip.appendChild(document.createTextNode("Look at last month's bank statement. Payments marked DD (Direct Debit) or SO (Standing Order) are usually regular bills."));box.appendChild(tip);
  var sc=suCfg();
  flowOrder(sc).forEach(function(id){var a=suAcct(id),ai=s.accounts.indexOf(a),name=suAcctName(a),rows=s.bills[id]||(s.bills[id]=[]),bid=function(i,f){return "su_b_"+ai+"_"+i+"_"+f};
    // Accounts that aren't usually for bills (enterBills) and have none yet are one line each, opened in place.
    if(!s.billOpen[id]&&!rows.length){var ln=el("div","su-bline");ln.style.setProperty("--c",colourVar(a.colour));ln.appendChild(el("b",null,name));
      var dash=el("span","muted","\u2014");dash.setAttribute("aria-hidden","true");ln.appendChild(dash);
      var op=el("button","linkbtn","+ Add a bill");op.type="button";op.id="su_b_"+ai+"_open";op.setAttribute("aria-label","Add a bill paid from "+name);
      op.addEventListener("click",function(){s.billOpen[id]=true;rows.push(newBillRow());suRedraw(bid(0,"n"))});ln.appendChild(op);box.appendChild(ln);return}
    var sec=suCard(box,"su_h_b"+ai,"Paid from "+name);sec.classList.add("su-bsec");sec.style.setProperty("--c",colourVar(a.colour));
    var chips=suChips(sec,BILL_SUGGESTIONS.map(function(x){return x[0]}),rows,"Common bills paid from "+name,function(n){
      var i=rows.findIndex(function(r){return !rowUsed(r)});if(i<0){rows.push(newBillRow());i=rows.length-1}
      var pre=(BILL_SUGGESTIONS.filter(function(x){return x[0]===n})[0]||[])[1];rows[i].name=n;if(pre){rows[i].freq=pre.freq;if(pre.picked)rows[i].picked=pre.picked.slice()}
      suRedraw(bid(i,pre&&pre.freq==="yearly"?"m":"a"));reveal($(bid(i,"n")).closest(".qa-row"))});
    var hdr=el("div","qa-head");hdr.setAttribute("aria-hidden","true");hdr.appendChild(el("span",null,"Bill name"));hdr.appendChild(el("span",null,"Amount (£)"));sec.appendChild(hdr);
    var list=el("div","qa-rows");rows.forEach(function(r,i){list.appendChild(quickRow(r,{id:function(f){return bid(i,f)},noun:"Bill",n:i+1,group:"Bill "+(i+1)+", paid from "+name,freq:true,
      onFreq:function(){suRedraw(bid(i,"f"))},onName:function(){suChipsRefresh(chips,rows)},
      onEnter:function(){if(i===rows.length-1){rows.push(newBillRow());suRedraw(bid(i+1,"n"))}else $(bid(i+1,"n")).focus()},
      onRemove:function(){rows.splice(i,1);suRedraw(rows.length?bid(Math.min(i,rows.length-1),"n"):"su_b_"+ai+"_more")}}))});sec.appendChild(list);
    var more=el("button","linkbtn","+ Add another bill");more.id="su_b_"+ai+"_more";more.setAttribute("aria-label","Add another bill paid from "+name);more.addEventListener("click",function(){rows.push(newBillRow());suRedraw(bid(rows.length-1,"n"))});sec.appendChild(more)});
  box.appendChild(el("p","small muted","Renewal dates, reminders and categories can be added later in Settings › Bills."));
  setupNav(box,{back:true,skip:function(){s.skip[5]=true;enterSpend();goStep(6)},onNext:function(){var bad=[],why={};
    s.accounts.forEach(function(a,ai){var rows=s.bills[a.id]||[];readRows(rows).errors.forEach(function(e){var f=e.f==="months"?rows[e.i].freq:e.f;why[f==="name"?"amount":f]=1;
      bad.push("su_b_"+ai+"_"+e.i+"_"+(e.f==="name"?"n":e.f==="amount"?"a":"m"))})});
    if(bad.length)return suFail([why.amount&&"Each bill needs a name and an amount like 42.50.",why.yearly&&"Choose the month each yearly bill is paid in.",why.some&&"Pick at least one month for each bill paid in some months."].filter(Boolean).join(" "),bad);
    delete s.skip[5];enterSpend();goStep(6)}})}

/* Step 6: spending budgets and savings transfers, kept in or sent from the account that keeps what's left unless changed. */
function enterSpend(){var s=setup,root=suRoot(suCfg());if(!s.budgets.length)s.budgets.push(newRow(root));if(!s.savings.length)s.savings.push(newRow(root))}
function suSpend(box,s){var sc=suCfg(),order=flowOrder(sc),opts=order.map(function(id){return [id,(accById(sc,id)||{}).name]}),root=suRoot(sc);
  function list(rows,o){var c=suCard(box,"su_h_"+o.key,o.title,o.intro),rid=function(i,f){return "su_"+o.key+"_"+i+"_"+f};
    var chips=suChips(c,o.chips,rows,"Common "+o.title.toLowerCase(),function(n){var i=rows.findIndex(function(r){return !rowUsed(r)});if(i<0){rows.push(newRow(root));i=rows.length-1}rows[i].name=n;suRedraw(rid(i,"a"))});
    var hdr=el("div","qa-head");hdr.setAttribute("aria-hidden","true");hdr.appendChild(el("span",null,"Name"));hdr.appendChild(el("span",null,"A month (£)"));c.appendChild(hdr);
    var l=el("div","qa-rows");rows.forEach(function(r,i){l.appendChild(quickRow(r,{id:function(f){return rid(i,f)},noun:o.noun,n:i+1,group:o.noun+" "+(i+1),namePh:o.ph,acct:opts,acctLabel:o.acctLabel,acctShown:true,
      onName:function(){suChipsRefresh(chips,rows)},
      onEnter:function(){if(i===rows.length-1){rows.push(newRow(r.account||root));suRedraw(rid(i+1,"n"))}else $(rid(i+1,"n")).focus()},
      onRemove:function(){rows.splice(i,1);suRedraw(rows.length?rid(Math.min(i,rows.length-1),"n"):"su_add"+o.key)}}))});c.appendChild(l);
    var add=el("button","linkbtn",o.add);add.id="su_add"+o.key;add.addEventListener("click",function(){rows.push(newRow(root));suRedraw(rid(rows.length-1,"n"))});c.appendChild(add);
    c.appendChild(el("p","small muted",o.after))}
  list(s.budgets,{key:"g",title:"Spending budgets",noun:"Budget",ph:"e.g. Food shopping",acctLabel:"Kept in",add:"+ Add a budget",chips:BUDGET_SUGGESTIONS,
    intro:"Money set aside each month for everyday spending, like food shopping or fuel. Setting an amount helps day-to-day spending stay clear of your bill money.",
    after:"Not sure how much? Look at what you spent last month and start there. You can adjust it as you go."});
  list(s.savings,{key:"v",title:"Savings transfers",noun:"Savings transfer",ph:"e.g. Emergency fund",acctLabel:"Sent from",add:"+ Add a savings transfer",chips:SAVINGS_SUGGESTIONS,
    intro:"Money you move to a savings account each payday, before it gets spent. Even a small amount adds up.",
    after:"Many people start with an emergency fund: money for unexpected costs, like a broken boiler."});
  setupNav(box,{back:true,skip:function(){s.skip[6]=true;goStep(7)},onNext:function(){var bad=[];
    [["g",s.budgets],["v",s.savings]].forEach(function(x){readRows(x[1]).errors.forEach(function(e){bad.push("su_"+x[0]+"_"+e.i+"_"+(e.f==="name"?"n":"a"))})});
    if(bad.length)return suFail("Each one needs a name and an amount a month, like 150.00.",bad);
    delete s.skip[6];goStep(7)}})}

/* Step 7: the first payday, worked out from the household finishSetup will save, with each person's usual pay. With a
   payday, the month the next payday pays for (suFirstMonth); without one, the month the app opens on. */
function suFirstMonth(pc){var nx=nextPayday(pc);return nx?nx.month:defaultMonth(pc)}
function suPreview(box,s){var c=setupResult(),nx=nextPayday(c.payday),k=suFirstMonth(c.payday),pay={},any=false;
  c.people.forEach(function(p){pay[p.id]=num(p.usualPay);if(pay[p.id]>0)any=true});
  // With no pay at all, the transfers are worked out with a large figure for everyone, just to show their order.
  var big={};c.people.forEach(function(p){big[p.id]=1e6});var r=calc(c,mNum(k),any?pay:big,[]),nm=function(id){var a=accById(c,id);return a?a.name:""};
  var card=suCard(box,"su_h_first","Transfers to make, in this order");
  if(nx){var fp=el("p","su-firstday","Your first payday: "+longDate(nx.date)+", for "+mLabel(k)+".");fp.id="su_first";card.appendChild(fp)}
  if(any||!nx){var lead=el("p",null,nx?"With the pay you entered:":any?"For "+mLabel(k)+", with the pay you entered:":"For "+mLabel(k)+":");lead.id="su_for";card.appendChild(lead)}
  if(!any){var np=el("div","banner","Add pay to see real amounts.");np.id="su_nopay";card.appendChild(np)}
  else{var missing=c.people.filter(function(p){return !(pay[p.id]>0)}).map(function(p){return possessive(p.name)});
    if(missing.length)card.appendChild(el("p","small muted",listAnd(missing)+" pay isn't in yet, so it counts as £0."))}
  var ol=el("ol","su-tlist");ol.id="su_transfers";
  r.steps.forEach(function(st){var li=el("li"),rt=el("span","r");rt.appendChild(acctTagIn(c,st.from));var ar=el("span","arr","→");ar.setAttribute("aria-hidden","true");rt.appendChild(ar);rt.appendChild(el("span","sr"," to "));
    if(st.to)rt.appendChild(acctTagIn(c,st.to));else rt.appendChild(el("span","acct",st.toText));li.appendChild(rt);if(any)li.appendChild(moneyEl(Math.abs(st.amt),"v"));ol.appendChild(li)});
  if(!r.steps.length)ol.appendChild(el("li","small muted","No transfers needed: everything stays in "+nm(c.accounts[0].id)+"."));
  card.appendChild(ol);
  if(any){var lf=el("div","su-left"+(r2(r.flt)<0?" neg":""));lf.id="su_left";lf.appendChild(el("span","lbl","Left over"));lf.appendChild(moneyEl(r.flt,"hv"));
    lf.appendChild(el("span","small muted",r.floats.length===1?"in "+nm(r.floats[0].id):listAnd(r.floats.map(function(f){return fmt(f.amt)+" in "+nm(f.id)}))));card.appendChild(lf);
    if(r2(r.flt)<0){var sb=el("div","banner bad","That's "+fmt(-r.flt)+" short. You can trim a budget or a bill, or carry on and adjust later.");sb.id="su_short";card.appendChild(sb)}}
  var how=suCard(box,"su_h_how","What happens each payday");var hl=el("ol","su-how");
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
    if(x.arrives.length){var ins=el("div","fd-in");x.arrives.forEach(function(w){ins.appendChild(el("span","chip",w))});v.appendChild(ins)}
    var cd=el("div","fd-card");cd.appendChild(el("b",null,(a&&a.name)||""));if(!x.to)cd.appendChild(el("span","fd-keep","Keeps what's left: your left over"));v.appendChild(cd);
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

/* The household setup will save: what was entered, with defaults for anything not reached or skipped. Rows that can't be
   saved (a name with no amount, say) are left out; info.dropped (when info is given) counts them, leaving out steps that
   were skipped. Used for the first-payday preview and by finishSetup. Savings transfers start ("since") in the month the
   Pay tab first opens on: the next payday's month when fromPreview is true (after "Looks right, start"), otherwise the
   month the app opens on as usual. */
function setupResult(fromPreview,info){var dropped=0;
  function rows(list){var r=readRows(list||[]),bad={};r.errors.forEach(function(e){bad[e.i]=1});dropped+=Object.keys(bad).length;return r.items}
  var s=setup,c={schema:SCHEMA,setupDone:true,setupTips:true,tourDone:false,lastVersion:VERSION,appearance:cfg&&cfg.appearance,notify:cfg&&cfg.notify,
    people:s.people.map(function(p,i){var v=parseMoney(p.pay,false);return {id:p.id,name:personName(p,i),payAccount:p.payAccount,usualPay:v.value>0?r2(v.value):0}})};
  // Nobody entered yet (setup skipped, or rows left blank): one person, "You".
  if(!s.people.some(function(p){return String(p.name||"").trim()||String(p.pay||"").trim()}))c.people=[{id:(s.people[0]&&s.people[0].id)||uid("p"),name:"You",payAccount:s.people[0]&&s.people[0].payAccount,usualPay:0}];
  var order=flowOrder(suCfg());c.accounts=order.map(function(id){var a=suAcct(id);return {id:a.id,name:suAcctName(a),colour:a.colour,leftoverTo:a.leftoverTo||null}});
  if(!c.accounts.length)c.accounts=[{id:uid("a"),name:"Current account",colour:COLOURS[0][0],leftoverTo:null}];
  c.accounts.forEach(function(a){a.leftoverTo=parentId(c,a.id)});
  var ids=c.accounts.map(function(a){return a.id}),first=ids[0],root=rootIds(c)[0]||first,ok=function(id,def){return ids.indexOf(id)>=0?id:def};
  c.people.forEach(function(p){p.payAccount=ok(p.payAccount,first)});
  c.income=rows(s.income).map(function(x){return {id:x.r.id||uid("i"),name:x.name,amount:x.amount,account:ok(x.r.account,root)}});
  c.payday=s.skip[3]?{}:suPaydayCfg();
  var billTo=defaultBillAccount(c);c.bills=[];
  if(!s.skip[5])c.accounts.forEach(function(a){rows(s.bills[a.id]).forEach(function(x){var b={id:uid("b"),name:x.name,amount:x.amount,account:a.id,months:x.months};applyCategorySuggestion(b);c.bills.push(b)})});
  if(!s.skip[5])Object.keys(s.bills).forEach(function(k){if(ids.indexOf(k)<0)rows(s.bills[k]).forEach(function(x){var b={id:uid("b"),name:x.name,amount:x.amount,account:billTo,months:x.months};applyCategorySuggestion(b);c.bills.push(b)})});
  c.budgets=s.skip[6]?[]:rows(s.budgets).map(function(x){return {id:uid("g"),name:x.name,amount:x.amount,account:ok(x.r.account,root)}});
  var since=fromPreview===true?suFirstMonth(c.payday):defaultMonth(c.payday);
  c.savings=s.skip[6]?[]:rows(s.savings).map(function(x){return {id:uid("s"),name:x.name,amount:x.amount,fromAccount:ok(x.r.account,root),since:since}});
  if(info)info.dropped=dropped;
  return normCfg(c)}
/* One way out of setup, for "Looks right, start", "Finish later" and "Skip setup for now". After "Looks right, start"
   the Pay tab opens once on the month the preview showed (the next payday's); afterwards, and after Finish later, the
   app opens on defaultMonth as usual. Rows that weren't complete are left out, and a message says so, once the tour
   (which starts straight away) has ended. */
var setupNote=null;
function droppedText(n){return n===1?"One row wasn't complete, so it was left out. You can add it in Settings.":n+" rows weren't complete, so they were left out. You can add them in Settings."}
function finishLater(){finishSetup(false)}
function finishSetup(fromPreview){var info={};
  cfg=setupResult(fromPreview,info);months={};setup=null;restoreOffer=null;whatsNew=false;hideUndo();saveCfg(true);saveMonths();paySig=peopleSig();
  try{history.replaceState(null,"","#pay")}catch(e){}monthKey=fromPreview===true?suFirstMonth(payCfg()):defaultMonth(payCfg());route();goMonth(monthKey);
  queueNativeBackup(0);
  // A new household gets the tour straight away (it says what to do next, so no "All set" message).
  var note=info.dropped?droppedText(info.dropped):null;
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
var sheetOpen=false,sheetFrom=null,sheetSkip=false,sheetHist=false,sheetRefocus=null;
/* Everything behind a sheet or the tour: unreachable by touch, keyboard and screen reader while it's open. */
function setInert(on){["main","tabbar"].forEach(function(id){var n=$(id);if(on)n.setAttribute("inert","");else n.removeAttribute("inert")})}
function openSheet(title,nodes,from,o){o=o||{};var sh=$("sheet"),b=clear($("sheetB"));$("sheetH").textContent=title;
  nodes.forEach(function(n){b.appendChild(typeof n==="string"?el("p",null,n):n)});
  if(o.describe)sh.setAttribute("aria-describedby","sheetB");else sh.removeAttribute("aria-describedby");
  sheetFrom={el:from||null,key:o.key||null,id:(from&&from.id)||null};$("sheetClose").className="btn"+(o.quietClose?" ghost":"");
  if(!sheetOpen){sheetOpen=true;hideUndo();setInert(true);$("sheetWrap").hidden=false;
    // An entry in the history, so the phone's Back button closes the sheet rather than leaving the screen.
    try{history.pushState(Object.assign({},history.state||{},{sheet:true}),"");sheetHist=true}catch(e){sheetHist=false}}
  sh.scrollTop=0;try{$("sheetH").focus({preventScroll:true})}catch(e){}}
function closeSheet(fromBack){if(!sheetOpen)return;sheetOpen=false;$("sheetWrap").hidden=true;setInert(false);
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
  if(cfg.accounts.length)n.push(flowDiagram(cfg,"howFlowH"));
  n.push(el("h3",null,"What left over means"));
  n.push("Left over is what's left once every bill, spending budget and savings transfer is covered. It stays in the account that keeps what's left.");
  if(r&&r.totalIn>0.004)n.push(fig(r2(r.flt)<0?mLabel(monthKey)+" is "+fmt(-r.flt)+" short.":mLabel(monthKey)+": "+fmt(r.flt)+" left over."));
  n.push(el("h3",null,"Pay months"));
  n.push("A pay month runs from one payday to the next. It's named after the month that pay is for.");
  openSheet("How Dovetail works",n,from)}
var WORDS=[["Take-home pay","The pay that actually reaches your bank account, after tax, National Insurance and pension. Also called net pay."],
  ["Pay month","The month your pay is for. It runs from one payday to the next."],
  ["Transfer","Money you move from one of your accounts to another, in your banking app."],
  ["Left over","What's left once every bill, spending budget and savings transfer is covered. It's yours to spend for the month."],
  ["One-off","Money that goes out or comes in just once, like a car repair or a refund."],
  ["Spending budget","Money set aside each month for everyday spending, like food shopping or fuel."],
  ["Savings transfer","Money you move to savings each payday, before it gets spent."],
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
    return r2(r.flt)<0?"This month is "+fmt(-r.flt)+" short: more is going out than coming in. You can fix it by changing a budget or a bill.":"After every bill, budget and savings transfer, this is what's left for the month: "+fmt(r.flt)+"."}},
  {id:"pay",target:"#payCard",tab:"pay",title:"Type your pay each payday",text:"When pay arrives, type what actually reached your bank. Until then, Dovetail uses your last typed pay, or your usual pay."},
  {id:"transfers",target:"#trSec",tab:"pay",title:"Then make these transfers",text:function(r){return r.steps.length?"These are the payments to make in your banking app, in this order, so every bill is covered. Tick each one off when it's done."+(cfg.people.length>1?" Share sends the list to "+(cfg.people.length===2?"the other person":"everyone else")+(sendsUpdate()?", or a file that brings Dovetail on their phone up to date.":"."):""):
    "When money needs to move between your accounts, the transfers show here, in order. Tick each one off when it's done."}},
  {id:"oneoffs",target:"#oneOffCard",tab:"pay",open:openPayDetails,title:"Something different this month?",text:"A birthday, a car repair, a refund: add it here and the transfers change to cover it."},
  {id:"notevery",target:"#nmCard",tab:"pay",open:openPayDetails,when:function(){return notEveryMonth(cfg,monthKey,0).any},title:"Bills that aren't monthly",text:"Yearly or occasional bills show up in the month they're due, so they don't catch you out."},
  {id:"analysis",target:"#t-analysis",tab:"analysis",title:"See where your money goes",text:"Which months will be tight, what your bills add up to, and how much you've saved."},
  {id:"reminders",target:"#t-due",tab:"due",title:"Never miss a renewal",text:"Insurance, phone contracts and MOTs, with a nudge before they renew, so you can shop around."},
  {id:"settings",target:"#t-settings",tab:"settings",title:"Change anything",text:"Your bills, budgets, accounts and payday all live here, and so do backups. You can see this tour again in Settings › Help."}];
var tour=null,tabWait=null;
/* Go to a tab, then run cb once it's on screen (going back to Pay can wait for the browser's history). */
function afterTab(t,cb){if(tab===t){cb();return}var w={t:t,cb:cb};tabWait=w;goTab(t);if(tabWait!==w)return;
  if(tab===t){tabWait=null;cb();return}
  setTimeout(function(){if(tabWait!==w)return;tabWait=null;if(tab!==t){try{history.replaceState(null,"","#"+t)}catch(e){}route()}cb()},700)}
function tourCalc(){try{return calc(cfg,mNum(monthKey),readPay().vals,curOneOffs())}catch(e){return lastR}}
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
function showTab(){
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
    var sc=rc?rc.value:null;wealthRaw=lsGet(K_W);months=normMonths(rm?rm.value:null);markSeen();
    if(sc){cfg=normCfg(sc);if(migrate(cfg,months,wealthRaw)){lsSet(K_CFG,cfg);lsSet(K_MON,months)}}
    else{cfg=normCfg({schema:SCHEMA});months={}}
    // Not set up: a new install, or "Start again" (whose settings keep only this phone's appearance and notifications).
    if(!cfg.setupDone){startSetup();offerNewestBackup()}
    applyAppearance();
    if(cfg.setupDone&&cfg.lastVersion!==VERSION){whatsNew=!cfg.example&&!!sc;cfg.lastVersion=VERSION;lsSet(K_CFG,cfg)}
    paySig=peopleSig();monthKey=defaultMonth(payCfg());
    if(!location.hash){try{history.replaceState(null,"","#pay")}catch(e){}}
    if(cfg.setupDone)goMonth(monthKey);route();
    queueNativeBackup(1500);queueSchedule(1500);
    if(!storageOK)toast("This phone isn't letting the app save. Changes will be lost when you close it.");
  }catch(e){showRecovery("error",e)}
})();
