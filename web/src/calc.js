/* Dovetail: money, date and household helpers and the transfer calculation.
   Pure functions only: no DOM, no storage, no app state. The Node unit tests load this file directly. */
var MN=["January","February","March","April","May","June","July","August","September","October","November","December"];
var MS=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
var gbp=new Intl.NumberFormat("en-GB",{style:"currency",currency:"GBP"});
function r2(x){return Math.round((x+Number.EPSILON)*100)/100}
/* r2 can give -0 (from -0.004, say), which Intl prints as "-£0.00": treat it as zero. */
function fmt(x){var v=r2(x);if(v===0)v=0;return gbp.format(v).replace("-","−")}
function fmtS(x){return (x>0.004?"+":x<-0.004?"−":"")+gbp.format(Math.abs(r2(x)))}
function num(v){var n=parseFloat(String(v==null?"":v).replace(/[£,\s]/g,""));return isFinite(n)?n:0}
function parseMoney(v,allowNeg){var t=String(v==null?"":v).trim();if(t==="")return {empty:true,value:null};
  t=t.replace(/[£,\s]/g,"").replace(/^−/,"-");var re=allowNeg?/^-?\d+(\.\d{0,2})?$|^-?\.\d{1,2}$/:/^\d+(\.\d{0,2})?$|^\.\d{1,2}$/;
  if(!re.test(t))return {empty:false,value:null,invalid:true};return {empty:false,value:parseFloat(t)}}
function clone(o){return JSON.parse(JSON.stringify(o))}
/* Ids: the time, 64 random bits (crypto where there is one) and a counter, so ids made in the same millisecond
   (setup and quick-add make many at once) can't collide. */
var uidN=0;
function uid(p){var r;try{var a=new Uint32Array(2);crypto.getRandomValues(a);r=a[0].toString(36)+a[1].toString(36)}catch(e){r=Math.floor(Math.random()*1e12).toString(36)}
  uidN=(uidN+1)%1296;return p+Date.now().toString(36)+r+uidN.toString(36)}
/* months & payday */
var DAYS=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
function pad(n){return String(n).padStart(2,"0")}
function ymd(y,m,d){return y+"-"+pad(m)+"-"+pad(d)}
function dim(y,m){return new Date(Date.UTC(y,m,0)).getUTCDate()}
function dow(s){var p=s.split("-").map(Number);return new Date(Date.UTC(p[0],p[1]-1,p[2])).getUTCDay()}
/* England and Wales bank holidays (2.16.1), worked out by rule: no table, so one-off holidays (a jubilee, a coronation,
   a state funeral, a moved May holiday) aren't known, and nor are Scotland's or Northern Ireland's.
   Easter Sunday in year y, "YYYY-MM-DD" (the Gregorian computus). */
function easterSunday(y){var a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),
  h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),n=h+l-7*m+114;
  return ymd(y,Math.floor(n/31),n%31+1)}
/* The year's bank holidays, sorted: New Year's Day (the Monday after if it's a weekend), Good Friday, Easter Monday, the
   first and last Mondays in May, the last Monday in August, Christmas Day and Boxing Day (moved to the next weekdays when
   either falls at a weekend). [] for a year that isn't a whole number from 1900 to 2999. Worked out once a year; a copy. */
var BH_EW={};
function bankHolidaysEW(y){if(!Number.isInteger(y)||y<1900||y>2999)return [];
  if(!BH_EW[y]){var out=[],nyd=dow(ymd(y,1,1)),ea=easterSunday(y),c=dow(ymd(y,12,25)),m1=dow(ymd(y,5,1)),m31=dow(ymd(y,5,31)),a31=dow(ymd(y,8,31));
    out.push(ymd(y,1,nyd===6?3:nyd===0?2:1),addDays(ea,-2),addDays(ea,1),ymd(y,5,1+(8-m1)%7),ymd(y,5,31-(m31+6)%7),ymd(y,8,31-(a31+6)%7));
    if(c===6)out.push(ymd(y,12,27),ymd(y,12,28));else if(c===0)out.push(ymd(y,12,26),ymd(y,12,27));
    else if(c===5)out.push(ymd(y,12,25),ymd(y,12,28));else out.push(ymd(y,12,25),ymd(y,12,26));
    BH_EW[y]=out.sort()}
  return BH_EW[y].slice()}
/* Whether a "YYYY-MM-DD" date is an England and Wales bank holiday. */
function isBankHolidayEW(s){return validDate(s)&&bankHolidaysEW(Number(s.slice(0,4))).indexOf(s)>=0}
/* A working day: not a Saturday, a Sunday or a bank holiday. */
function isWorkingDay(s){if(!validDate(s))return false;var w=dow(s);return w!==0&&w!==6&&!isBankHolidayEW(s)}
/* The date itself if it's a working day, otherwise the working day before it (across a month or year end if need be). */
function workingDayOnOrBefore(s){if(!validDate(s))return s;for(var i=0;i<10&&!isWorkingDay(s);i++)s=addDays(s,-1);return s}
/* The payday in month m of year y, capped at the month's length: "last", and a numbered day unless the weekend box is
   unticked, move to the working day before a weekend or bank holiday. */
function paydayIn(pc,y,m){pc=pc||{};var d,move=true;
  if(pc.day==="last")d=dim(y,m);
  else{var D=Number(pc.day);if(!D)return null;d=Math.min(D,dim(y,m));move=pc.weekend!==false}
  var s=ymd(y,m,d);return move?workingDayOnOrBefore(s):s}
function paysNextMonth(pc){pc=pc||{};return pc.day==="last"||Number(pc.day)>=15}
function paydayFor(pc,k){if(!pc||!pc.day)return null;var src=paysNextMonth(pc)?shiftMonth(k,-1):k,q=src.split("-").map(Number);return paydayIn(pc,q[0],q[1])}
function budgetMonthOfPay(pc,k){return paysNextMonth(pc)?shiftMonth(k,1):k}
/* The budget month the app opens on. Without a payday: from the 15th, next month. With one: the month the next
   payday pays for once it's 10 days away or less, otherwise the month the last payday paid for. */
function defaultMonth(pc,today){var t=today||todayStr();pc=pc||{};
  if(!pc.day){var p=t.split("-").map(Number);return Number(p[2])>=15?shiftMonth(t.slice(0,7),1):t.slice(0,7)}
  var cur=t.slice(0,7);
  var c=[-1,0,1].map(function(o){var k=shiftMonth(cur,o),q=k.split("-").map(Number);return {date:paydayIn(pc,q[0],q[1]),bm:budgetMonthOfPay(pc,k)}});
  var next=c.filter(function(x){return x.date>=t})[0],prev=c.filter(function(x){return x.date<t}).pop();
  if(next&&daysUntil(next.date,t)<=10)return next.bm;return prev?prev.bm:next.bm}
/* The next payday on or after today, and the pay month it pays for: {date, month}. null without a payday. */
function nextPayday(pc,today){var t=today||todayStr(),cm=t.slice(0,7);if(!pc||!pc.day)return null;
  for(var o=0;o<3;o++){var k=shiftMonth(cm,o),q=k.split("-").map(Number),d=paydayIn(pc,q[0],q[1]);if(d&&d>=t)return {date:d,month:budgetMonthOfPay(pc,k)}}
  return null}
/* The years the month picker offers (2.10): last year to two years ahead, stretched back to the earliest saved month (30
   years at most) and to take in the month on screen. keys = saved month keys; now, shown = "YYYY-MM". */
function pickerYears(keys,now,shown){var y0=Number(now.slice(0,4)),lo=y0-1,hi=y0+2,ys=Number(shown.slice(0,4));
  arr(keys).forEach(function(k){if(/^\d{4}-\d{2}$/.test(k))lo=Math.min(lo,Math.max(y0-30,Number(k.slice(0,4))))});
  lo=Math.min(lo,ys);hi=Math.max(hi,ys);var out=[];for(var y=lo;y<=hi;y++)out.push(y);return out}
function shiftMonth(k,by){var p=k.split("-").map(Number);var m=p[1]-1+by;var y=p[0]+Math.floor(m/12);m=((m%12)+12)%12;return y+"-"+String(m+1).padStart(2,"0")}
function mNum(k){return Number(k.split("-")[1])}
function mLabel(k){var p=k.split("-");return MN[Number(p[1])-1]+" "+p[0]}
function mShort(k){var p=k.split("-");return MS[Number(p[1])-1]+" "+p[0]}
function applies(b,m){return !b.months||!b.months.length||b.months.length>=12||b.months.indexOf(m)>=0}
function perYear(b){return (!b.months||!b.months.length||b.months.length>=12)?12:b.months.length}
function whenText(b){if(!b.months||!b.months.length||b.months.length>=12)return "Every month";return b.months.slice().sort(function(a,c){return a-c}).map(function(i){return MS[i-1]}).join(", ")}
function todayStr(){var d=new Date();return d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate())}
function validDate(s){return /^\d{4}-\d{2}-\d{2}$/.test(s||"")}
function dUTC(s){var p=s.split("-").map(Number);return Date.UTC(p[0],p[1]-1,p[2]||1)}
function daysUntil(s,today){return Math.round((dUTC(s)-dUTC(today||todayStr()))/864e5)}
function fmtDate(s){var p=s.split("-").map(Number);return p[2]+" "+MS[p[1]-1]+" "+p[0]}
function addYear(s){var p=s.split("-").map(Number),d=p[2];if(p[1]===2&&d===29)d=28;return (p[0]+1)+"-"+pad(p[1])+"-"+pad(d)}
function nextFuture(s,today){var t=today||todayStr(),g=0;while(s<=t&&g<50){s=addYear(s);g++}return s}
/* The date n days after (or before) a "YYYY-MM-DD" date. */
function addDays(s,n){var p=s.split("-").map(Number),d=new Date(Date.UTC(p[0],p[1]-1,p[2]+n));return d.getUTCFullYear()+"-"+pad(d.getUTCMonth()+1)+"-"+pad(d.getUTCDate())}
function plusDays(n){var d=new Date();d.setDate(d.getDate()+n);return d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate())}
function relDays(n){if(n===0)return "today";if(n===1)return "tomorrow";if(n===-1)return "yesterday";if(n<0)return (-n)+" days ago";if(n<=60)return "in "+n+" days";return "in about "+Math.round(n/30.4)+" months"}
function ordinal(i){return i+(i===1||i===21||i===31?"st":i===2||i===22?"nd":i===3||i===23?"rd":"th")}

function arr(x){return Array.isArray(x)?x:[]}
function isObj(x){return !!x&&typeof x==="object"&&!Array.isArray(x)}
/* Only plain objects count as items: anything else in a list (null, a number, text) from a damaged or hand-edited
   backup is dropped rather than crashing the page later. */
function objs(x){return arr(x).filter(isObj)}
/* A payday day is "last" or a whole number 1–31. Anything else means "not set" (""), which the app can always open on. */
function validPayDay(d){if(d==="last")return true;if(typeof d!=="number"&&typeof d!=="string")return false;if(d==="")return false;var n=Number(d);return Number.isInteger(n)&&n>=1&&n<=31&&String(d).trim()!==""}
/* A bill's months: whole numbers 1–12, each once, in the order given. Empty means every month. */
function normMonthList(ms){var out=[];arr(ms).forEach(function(x){var n=Number(x);if(Number.isInteger(n)&&n>=1&&n<=12&&out.indexOf(n)<0)out.push(n)});return out}
/* What normCfg and normMonths report (2.13): they take an optional list and add a plain description of everything they
   drop or fix (never a name or an amount), so a restore can say what it couldn't use. Sound data reports nothing. */
function normSay(rep,t){if(Array.isArray(rep))rep.push(t)}
/* The report as one sentence for the screen: each kind once, at most three, then "and N more". "" when there's nothing. */
function reportSentence(rep){var d=arr(rep).filter(function(t,i,a){return a.indexOf(t)===i});if(!d.length)return "";
  var s=d.length>3?d.slice(0,3).join(", ")+" and "+(d.length-3)+" more":d.length>1?d.slice(0,-1).join(", ")+" and "+d[d.length-1]:d[0];
  return "Some things couldn't be used: "+s+"."}
var LIST_WORDS={bills:"a bill",income:"other income",savings:"a savings transfer",budgets:"a spending budget",reminders:"a reminder",doneLog:"an entry in Recently done",people:"a person",accounts:"an account",estimates:"a rough figure"};
/* A negative amount on a bill, budget, savings transfer or income is kept in the data (badAmount) but counted as £0 (the
   amount handed on is 0); badAmount is let go once the item has an amount again. */
function normAmount(l,x,rep){if(num(x.amount)<0){x.badAmount=x.amount;x.amount=0;normSay(rep,LIST_WORDS[l]+" with a negative amount (counted as £0)")}
  else if(x.badAmount!==undefined&&num(x.amount)!==0)delete x.badAmount}
function normCfg(c,rep){c=clone(c||{});
  ["bills","income","savings","reminders","doneLog","people","accounts","budgets"].forEach(function(k){var n=arr(c[k]).length;c[k]=objs(c[k]);for(var i=c[k].length;i<n;i++)normSay(rep,LIST_WORDS[k]+" that couldn't be read")});
  c.payday=isObj(c.payday)?c.payday:{};if(c.payday.day!=null&&c.payday.day!==""&&!validPayDay(c.payday.day)){c.payday.day="";normSay(rep,"a payday that isn't a day of the month")}
  c.bills.forEach(function(b,i){if(!b.id)b.id="b"+i+uid("");if(arr(b.months).some(function(x){var n=Number(x);return !(Number.isInteger(n)&&n>=1&&n<=12)}))normSay(rep,"a bill month that isn't January to December");b.months=normMonthList(b.months)});
  c.income.forEach(function(x){if(!x.id)x.id=uid("i")});c.budgets.forEach(function(x){if(!x.id)x.id=uid("g")});
  // 2.14, optional: rough figures for accounts' bills (estimates), stored only when there's one, so every other
  // household's settings stay exactly as they were.
  if(c.estimates!==undefined){if(!Array.isArray(c.estimates))normSay(rep,"a rough figure that couldn't be read");var es=normEstimates(c.estimates,c,rep);if(es.length)c.estimates=es;else delete c.estimates}
  Object.keys(ITEM_DATED).forEach(function(l){arr(c[l]).forEach(function(x){normAmount(l,x,rep)})});
  c.accounts.forEach(function(a){if(!a.id)a.id=uid("a");if(a.leftoverTo===undefined)a.leftoverTo=null});
  c.people.forEach(function(p){if(!p.id)p.id=uid("p");if(p.boarder!==true)delete p.boarder;if(p.pattern!==undefined)normPattern(p,rep);if(p.was!==undefined)normPersonWas(p,rep)});
  // 2.12: an account paid for by people under a rule. Optional; anything that can't be used is taken out.
  c.accounts.forEach(function(a){if(a.funding===undefined)return;var f=normFunding(a.funding,c,rep);if(f)a.funding=f;else delete a.funding});
  // 2.12: changes of how the household manages its money, from a month (flows), and accounts closed by one (closedFrom).
  c.accounts.forEach(function(a){if(a.closedFrom!==undefined&&!validMonth(a.closedFrom)){delete a.closedFrom;normSay(rep,"a closed account with a bad month")}});
  if(c.flows!==undefined){if(!Array.isArray(c.flows))normSay(rep,"a change of style that couldn't be read");var fl=normFlows(c.flows,c,rep);if(fl.length)c.flows=fl;else delete c.flows}
  // 2.12 (stage 4): items' earlier values (was), first month (start), and items ended from a month (ended).
  Object.keys(ITEM_DATED).forEach(function(l){arr(c[l]).forEach(function(x){normDated(l,x,rep)})});
  if(c.ended!==undefined){var en={};if(!isObj(c.ended))normSay(rep,"a deleted item that couldn't be read");else Object.keys(ITEM_DATED).forEach(function(l){var n=arr(c.ended[l]).length,xs=objs(c.ended[l]).filter(function(x){return x.id&&validMonth(x.ended)});
      for(var i=xs.length;i<n;i++)normSay(rep,"a deleted item with a bad month");
      // 2.14: an ended rough figure needs what a live one does (an account in the household, an amount of £0 or more).
      if(l==="estimates")xs=xs.filter(function(x){if(estimateOk(x,c))return true;normSay(rep,"a rough figure that couldn't be used");return false});
      xs.forEach(function(x){normAmount(l,x,rep);normDated(l,x,rep);if(l==="bills")x.months=normMonthList(x.months)});if(xs.length)en[l]=xs});
    if(Object.keys(en).length)c.ended=en;else delete c.ended}
  // 2.2: appearance travels with the settings (and so in backups). Unknown values fall back to the defaults.
  var ap=c.appearance&&typeof c.appearance==="object"?c.appearance:{};
  c.appearance={theme:["system","light","dark"].indexOf(ap.theme)>=0?ap.theme:"system",textSize:["small","normal","large"].indexOf(ap.textSize)>=0?ap.textSize:"normal"};
  // 2.2: reminder notifications (Settings › Reminders & notifications). Off unless turned on; 09:00; no amounts.
  var nt=c.notify&&typeof c.notify==="object"?c.notify:{};
  c.notify={on:nt.on===true,time:notifyTime(nt.time),amounts:nt.amounts===true};
  // 2.6, both optional and stored only when they matter: setupTips true shows the "Finish setting up" card (missing: off),
  // tourDone false means the guided tour hasn't been shown yet (missing: already seen). Existing households and older
  // backups have neither, so they see neither uninvited, and their saved settings stay exactly as they were.
  if(c.setupTips!==true)delete c.setupTips;if(c.tourDone!==false)delete c.tourDone;
  // 2.13, optional: wealthRemoved true once the old Wealth data has been removed (Settings › Backup), so no restore or
  // opened file brings it back by itself.
  if(c.wealthRemoved!==true)delete c.wealthRemoved;
  return c}
/* The saved months, with anything that isn't the right shape taken out: a month must be an object, its ticks (done)
   and pay must be objects and its one-offs a list of objects. Nothing is added that wasn't there, so data from any
   version goes through unchanged when it's sound (migrate handles the old shapes). A month whose key isn't a real
   "YYYY-MM" is kept (and reported) but left out of the calculations (validMonth). */
function normMonths(m,rep){var out={};if(!isObj(m)){if(m!=null)normSay(rep,"saved months that couldn't be read");return out}m=clone(m);
  Object.keys(m).forEach(function(k){var d=m[k];if(!isObj(d)){normSay(rep,"a month that couldn't be read");return}
    if(!validMonth(k))normSay(rep,"a month with a bad date (left out)");
    if(d.done!=null&&!isObj(d.done)){d.done={};normSay(rep,"ticks that couldn't be read")}if(d.pay!=null&&!isObj(d.pay)){delete d.pay;normSay(rep,"pay that couldn't be read")}
    if(d.oneOffs!=null){var n=Array.isArray(d.oneOffs)?d.oneOffs.length:1;d.oneOffs=objs(d.oneOffs);for(var i=d.oneOffs.length;i<n;i++)normSay(rep,"a one-off that couldn't be read")}
    if(d.results!=null&&!isObj(d.results))delete d.results;
    // 2.16: extra paydays (extra {personId: {amount, counted?}}): an entry needs an amount of £0 or more; counted is kept
    // only as true, and anything else inside an entry is kept as it is (layer 2 may add to it, E16).
    if(d.extra!==undefined){var ex={};if(isObj(d.extra))Object.keys(d.extra).forEach(function(pid){var e=d.extra[pid];
        if(isObj(e)&&typeof e.amount==="number"&&isFinite(e.amount)&&e.amount>=0){e=Object.assign({},e);if(e.counted!==undefined&&e.counted!==true)delete e.counted;ex[pid]=e}
        else normSay(rep,"an extra payday that couldn't be read")});
      else normSay(rep,"an extra payday that couldn't be read");
      if(Object.keys(ex).length)d.extra=ex;else delete d.extra}
    // 2.17 (docs/payperiods.md 13.2, L13): edited is kept only as true (an amount the household typed, or "Not an extra
    // payday").
    if(isObj(d.extra))Object.keys(d.extra).forEach(function(pid){var e=d.extra[pid];if(e.edited!==undefined&&e.edited!==true)delete e.edited});
    // 2.17: paydays {personId: a whole number 0 to 6}, the count frozen when a person's pay was first typed or ticked.
    if(d.paydays!==undefined){var pd={};if(isObj(d.paydays))Object.keys(d.paydays).forEach(function(pid){var v=d.paydays[pid];
        if(typeof v==="number"&&Number.isInteger(v)&&v>=0&&v<=6)pd[pid]=v;else normSay(rep,"a payday count that couldn't be read")});
      else normSay(rep,"a payday count that couldn't be read");
      if(Object.keys(pd).length)d.paydays=pd;else delete d.paydays}
    // 2.17: a one-off "Use it this month" added is marked extraFrom (the month whose extra payday it is) and extraOf (the
    // person): kept as a pair, or both dropped (the one-off itself stays).
    arr(d.oneOffs).forEach(function(o){if(o.extraFrom===undefined&&o.extraOf===undefined)return;
      if(!(validMonth(o.extraFrom)&&typeof o.extraOf==="string")){delete o.extraFrom;delete o.extraOf;normSay(rep,"an extra payday used later that couldn't be read")}});
    out[k]=d});
  return out}
/* ---------- backup and update files (2.13) ----------
   version says which pages read a file correctly. 5: anything from 2.0 on. 6: the settings use something a phone before
   2.13 would misread or drop (shares, closed accounts, changes of style, board, dated or deleted items; 2.14: a rough
   figure, which needs 2.14; 2.15: dated pay, which needs 2.15; 2.16: a pay pattern, now or in an earlier pay, which
   needs 2.16; 2.17: a recent payday, or a one-off
   "Use it this month" added, which needs 2.17), so older pages refuse it with their own "made by a newer version" message rather than show different figures. A version 6 file also
   says which app version it needs (needs), so later pages can name it. A version 5 file is written exactly as before. */
var BACKUP_NEEDS="2.13";
function backupVersionFor(c,months){c=isObj(c)?c:{};
  var v6=arr(c.accounts).some(function(a){return isObj(a)&&(a.funding!==undefined||!!a.closedFrom)})||arr(c.flows).length>0||
    arr(c.people).some(function(p){return isObj(p)&&p.boarder===true})||hasDated(c)||hasEstimates(c)||hasPersonDated(c)||patternsEver(c)||extraUsedLater(months);
  return v6?6:5}
/* The app version a version 6 file needs, the highest that applies: "2.16" when someone is paid weekly, every two weeks
   or every four weeks, now or in an earlier pay (an older page would plan on a month's pay and count an extra payday in);
   "2.15" when someone's pay is dated (a 2.14 page
   would drop the earlier pay and so change earlier months' shares), "2.14" when the settings have a rough figure (live
   or ended), which a 2.13 page would drop and so show different figures; otherwise BACKUP_NEEDS. */
var ESTIMATE_NEEDS="2.14",DATED_PAY_NEEDS="2.15";
var PATTERN_NEEDS="2.16";
/* 2.17 (13.2, L14): "2.17" first when someone has a recent payday (a 2.16 page would ignore it and the counts), or when a
   saved month (months, optional: callers without it get what they got before) has a one-off that "Use it this month" added
   (a 2.16 page doesn't lock the earlier month's extra payday, so it could be counted there as well). */
var PAYDAY_DATE_NEEDS="2.17";
function backupNeedsFor(c,months){c=isObj(c)?c:{};return hasPaydayDates(c)||extraUsedLater(months)?PAYDAY_DATE_NEEDS:patternsEver(c)?PATTERN_NEEDS:hasPersonDated(c)?DATED_PAY_NEEDS:hasEstimates(c)?ESTIMATE_NEEDS:BACKUP_NEEDS}
/* 2.17: whether anyone has a recent payday (pattern.on). */
function hasPaydayDates(c){return arr(c&&c.people).some(function(p){return !!datedPattern(p)})}
/* 2.17: whether any saved month has a one-off marked extraFrom ("Use it this month"). months may be missing. */
function extraUsedLater(months){return isObj(months)&&Object.keys(months).some(function(k){return arr(isObj(months[k])&&months[k].oneOffs).some(function(o){return isObj(o)&&o.extraFrom!=null})})}
/* A backup or update file's text: settings c, months m, the old Wealth data w (left out when null), saved at savedAt. */
function backupJson(c,m,w,savedAt){var v=backupVersionFor(c,m),o={app:"payday-transfers",version:v};if(v>5)o.needs=backupNeedsFor(c,m);
  o.savedAt=savedAt;o.config=c;o.months=m;if(w!=null)o.wealth=w;return JSON.stringify(o)}
/* 2.13: the old Wealth tab's data (payday.wealth.v1) as a file of its own, to keep before it's removed: readable JSON
   saying what it is. today: "YYYY-MM-DD"; savedAt: an ISO time. It isn't a backup, so Dovetail won't open it. */
function wealthFile(w,today,savedAt){return {name:"dovetail-wealth-"+today+".json",mime:"application/json",
  text:JSON.stringify({about:"Figures from the old Wealth tab in Dovetail (called Payday before 2.8): balances from version 1, not shown anywhere since 2.0.",savedAt:savedAt,wealth:w},null,2)}}
/* Why a page that reads files up to version maxVersion, and is app version appVersion, can't open file d: "newer" (a
   later version, or a version above 5 without needs, which no Dovetail writes), the app version the file needs when
   that's later than appVersion, or null when it can open it. */
function backupRefusal(d,maxVersion,appVersion){var v=num(d&&d.version),n=d&&d.needs,ok=typeof n==="string"&&/^\d+(\.\d+)*$/.test(n);
  if(v>maxVersion||(v>5&&!ok))return "newer";return ok&&versionBefore(appVersion,n)?n:null}
/* Whether version a ("2.11", "2.12.1") is before b. Missing counts as before. */
function versionBefore(a,b){if(!a)return true;var x=String(a).split(".").map(Number),y=String(b).split(".").map(Number);
  for(var i=0;i<Math.max(x.length,y.length);i++){var p=x[i]||0,q=y[i]||0;if(p!==q)return p<q}return false}
/* A notification time "HH:MM" between 06:00 and 22:00 (clear of midnight); anything unreadable is 09:00. */
function notifyTime(t){if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(t||""))return "09:00";return t<"06:00"?"06:00":t>"22:00"?"22:00":t}
function accById(c,id){for(var i=0;i<c.accounts.length;i++)if(c.accounts[i].id===id)return c.accounts[i];return null}
/* Whether two sets of settings are the same household (2.10: an update file from the other phone): they share an account.
   Account ids are random (uid), so households set up separately never share one; 1.x upgrades keep the 1.x ids, but 1.x
   was never released. */
function sameHousehold(a,b){var ids={};arr(a&&a.accounts).forEach(function(x){if(x&&x.id)ids[x.id]=true});
  return arr(b&&b.accounts).some(function(x){return !!(x&&x.id&&ids[x.id]===true)})}
/* Whether a month on this phone was saved after a backup was (2.10: an update file that would undo newer ticks or pay).
   savedAt and each month's updatedAt are ISO times; anything unreadable counts as not newer. */
function changedSince(months,savedAt){var t=Date.parse(savedAt);if(isNaN(t))return false;
  return Object.keys(months||{}).some(function(k){var m=months[k],u=m&&typeof m.updatedAt==="string"?Date.parse(m.updatedAt):NaN;return !isNaN(u)&&u>t})}
/* An account's parent is where its leftover goes. Missing accounts, itself and loops count as "keeps its leftover". */
function parentId(c,id){var a=accById(c,id);if(!a||!a.leftoverTo||a.leftoverTo===id||!accById(c,a.leftoverTo))return null;
  var seen={},x=a.leftoverTo,g=0;seen[id]=1;
  while(x&&g<200){if(seen[x])return null;seen[x]=1;var xa=accById(c,x);x=(xa&&xa.leftoverTo&&accById(c,xa.leftoverTo))?xa.leftoverTo:null;g++}
  return a.leftoverTo}
function descendants(c,id){var out=[],stack=[id],g=0;while(stack.length&&g<500){var x=stack.pop();c.accounts.forEach(function(a){if(parentId(c,a.id)===x&&out.indexOf(a.id)<0){out.push(a.id);stack.push(a.id)}});g++}return out}
function rootIds(c){return c.accounts.filter(function(a){return !parentId(c,a.id)}).map(function(a){return a.id})}
/* Accounts in flow order: those furthest from the account that keeps what's left first (usually where pay arrives),
   the ones that keep what's left last. Ties keep their order in the list. */
function accountDepth(c,id){var d=0,x=parentId(c,id),g=0;while(x&&g<200){d++;x=parentId(c,x);g++}return d}
/* 2.12: shares count as flowing too, so a pay account that pays into a joint account comes before it. Without funding,
   the same as accountDepth. */
function flowDepth(c,id,seen){seen=seen||{};if(seen[id])return 0;seen[id]=1;var d=0,x=parentId(c,id);if(x)d=flowDepth(c,x,seen)+1;
  arr(c.accounts).forEach(function(j){if(j.id!==id&&isObj(j.funding)&&fundingPeople(c,j.id).some(function(p){return p.payAccount===id}))d=Math.max(d,flowDepth(c,j.id,seen)+1)});
  delete seen[id];return d}
function flowOrder(c){var ix={},funded=c.accounts.some(function(a){return isObj(a.funding)});c.accounts.forEach(function(a,i){ix[a.id]=i});
  return c.accounts.map(function(a){return {id:a.id,d:funded?flowDepth(c,a.id):accountDepth(c,a.id)}}).sort(function(a,b){return b.d-a.d||ix[a.id]-ix[b.id]}).map(function(x){return x.id})}
/* Money-flow preview: one line per chain, e.g. "Current account → Joint account → Savings" */
function flowLines(c){var lines=[],leaves=c.accounts.filter(function(a){return !c.accounts.some(function(b){return parentId(c,b.id)===a.id})});
  leaves.forEach(function(a){var path=[a.id],x=parentId(c,a.id),g=0;while(x&&g<200){path.push(x);x=parentId(c,x);g++}lines.push(path)});return lines}
function calc(c,m,pay,oneOffs){
  var A={},order=c.accounts.map(function(a){return a.id}),t={pay:0,income:0,oneIn:0,bills:0,soSav:0,budgets:0,savings:0,oneOut:0,board:0,unlisted:0};
  order.forEach(function(id){A[id]={inn:0,out:0,pay:[],income:[],bills:[],budgets:[],savings:[],oneIn:[],oneOut:[],figure:null,unlisted:0}});
  // 2.12.1: a boarder's own account (style 16) is their money, not the household's: what's in it and out of it isn't in
  // the household's totals or its left over, and the board they pay in counts as money coming in (t.board).
  var outside=boarderAccounts(c),home=function(id){return !outside[id]};
  c.people.forEach(function(p){var v=num(pay[p.id]);if(home(p.payAccount))t.pay+=v;var s=A[p.payAccount];if(s){s.inn+=v;s.pay.push({p:p,v:v})}});
  c.income.forEach(function(i){var v=num(i.amount);if(home(i.account))t.income+=v;var s=A[i.account];if(s){s.inn+=v;s.income.push(i)}});
  arr(oneOffs).forEach(function(o){var v=num(o.amount),s=A[o.account],h=home(o.account);if(o.kind==="in"){if(h)t.oneIn+=v;if(s){s.inn+=v;s.oneIn.push(o)}}else{if(h)t.oneOut+=v;if(s){s.out+=v;s.oneOut.push(o)}}});
  c.bills.forEach(function(b){if(!applies(b,m))return;var v=num(b.amount);if(home(b.account)){t.bills+=v;if(b.savings)t.soSav+=v}var s=A[b.account];if(s){s.out+=v;s.bills.push(b)}});
  // 2.14: an account's rough figure for its bills. What it has over the account's listed bills that come in 7 or more
  // months a year is "not listed yet": money out of the account every month (figure and unlisted on the account), kept
  // in its own total (t.unlisted) so the figures still reconcile.
  var est=estimateTotals(c);Object.keys(est).forEach(function(id){var s=A[id],e=est[id];if(!s)return;s.figure=e.figure;s.unlisted=e.unlisted;s.out+=e.unlisted;if(home(id))t.unlisted+=e.unlisted});
  c.budgets.forEach(function(b){var v=num(b.amount);if(home(b.account))t.budgets+=v;var s=A[b.account];if(s){s.out+=v;s.budgets.push(b)}});
  c.savings.forEach(function(x){var v=num(x.amount);if(home(x.fromAccount))t.savings+=v;var s=A[x.fromAccount];if(s){s.out+=v;s.savings.push(x)}});
  var par={},kids={},dep={},sub={};
  order.forEach(function(id){par[id]=parentId(c,id);kids[id]=[]});order.forEach(function(id){if(par[id])kids[par[id]].push(id)});
  function depthOf(id){if(dep[id]!=null)return dep[id];var d=0,x=par[id],g=0;while(x&&g<200){d++;x=par[x];g++}return (dep[id]=d)}
  // Contributions (2.12) move money from people's pay accounts into accounts they pay for: cin and cout per account.
  var cin={},cout={};order.forEach(function(id){cin[id]=0;cout[id]=0;A[id].cIn=[];A[id].cOut=[]});
  function subOf(id){if(sub[id]!=null)return sub[id];var s=A[id].inn-A[id].out;if(cin[id])s+=cin[id];if(cout[id])s-=cout[id];kids[id].forEach(function(k){s+=subOf(k)});return (sub[id]=s)}
  order.forEach(subOf);
  var contribs=fundedOrder(c,order,depthOf).map(function(id){sub={};order.forEach(subOf);
    var x=fundingShares(c,id,sub,pay,cout);
    x.people.forEach(function(q){if(q.stays||q.amt<0.005)return;cout[q.from]+=q.amt;cin[id]+=q.amt;A[q.from].cOut.push({p:q.p,to:id,v:q.amt,set:q.set});A[id].cIn.push({p:q.p,v:q.amt,set:q.set})});
    return x});
  if(contribs.length){sub={};order.forEach(subOf)}
  var steps=[],nonRoot=order.filter(function(id){return par[id]});
  contribs.forEach(function(x){x.people.forEach(function(q){if(!q.stays&&q.amt>=0.005)steps.push({id:"c:"+q.p.id+">"+x.account,kind:"contribute",from:q.from,to:x.account,amt:q.amt,person:q.p.id,share:q.share,set:q.set})})});
  nonRoot.slice().sort(function(a,b){return depthOf(b)-depthOf(a)||order.indexOf(a)-order.indexOf(b)}).forEach(function(id){
    if(r2(sub[id])>0.004)steps.push({id:"t:"+id+">"+par[id],kind:"move",from:id,to:par[id],amt:sub[id]})});
  nonRoot.slice().sort(function(a,b){return depthOf(a)-depthOf(b)||order.indexOf(a)-order.indexOf(b)}).forEach(function(id){
    if(r2(sub[id])<-0.004)steps.push({id:"t:"+par[id]+">"+id,kind:"topup",from:par[id],to:id,amt:-sub[id]})});
  // A top-up can only send what its account has by then (money in, and what's reached it in the steps before). The part
  // it can't send stays a shortfall in the account that needed it (short: on the step, or the step goes when there's
  // nothing to send); the account that would have sent it keeps that much more. 2.12.1 did this for households with
  // shares; since 2.13 (the owner's decision) every household, so no transfer is ever listed from an empty account.
  var bal={},held={},cant=[];order.forEach(function(id){bal[id]=A[id].inn});
  steps=steps.filter(function(s){if(s.kind==="topup"){var has=r2(Math.max(0,bal[s.from]));
      if(has<r2(s.amt)-0.004){var x=r2(s.amt-has);held[s.from]=(held[s.from]||0)+x;held[s.to]=(held[s.to]||0)-x;s.short=x;s.amt=has;if(has<0.005){cant.push(s);return false}}}
    bal[s.from]-=s.amt;if(s.to)bal[s.to]+=s.amt;return true});
  c.savings.forEach(function(x){steps.push({id:"s:"+x.id,kind:"save",from:x.fromAccount,toText:x.name||"Savings",amt:num(x.amount)})});
  // What's left: accounts that keep it, and any account a top-up couldn't fully reach (short).
  var all=order.filter(function(id){return !par[id]}).concat(order.filter(function(id){return par[id]&&Math.abs(held[id]||0)>0.004})).map(function(id){var f={id:id,amt:par[id]?(held[id]||0):sub[id]+(held[id]||0)};if(par[id])f.short=true;return f});
  var floats=all.filter(function(f){return home(f.id)}),others=all.filter(function(f){return !home(f.id)});
  // Board in (and anything sent the other way) moves money between the household and a boarder's own account.
  steps.forEach(function(s){if(s.kind!=="contribute")return;if(!home(s.from)&&home(s.to))t.board+=s.amt;else if(home(s.from)&&!home(s.to))t.board-=s.amt});
  var flt=floats.reduce(function(s,f){return s+f.amt},0),totalIn=t.pay+t.income+t.oneIn+t.board,totalOut=t.bills+t.unlisted+t.budgets+t.savings+t.oneOut,check=totalIn-totalOut;
  return {A:A,par:par,kids:kids,sub:sub,steps:steps,floats:floats,outside:others,cant:cant,flt:flt,ok:Math.abs(r2(flt)-r2(check))<0.005,diff:check-flt,t:t,
    totalIn:totalIn,billsExSav:t.bills-t.soSav+t.unlisted,totalSaving:t.savings+t.soSav,spend:t.budgets,oneOut:t.oneOut,unlisted:t.unlisted,contribs:contribs};
}
/* 2.12.1: accounts that are a boarder's own (a person with boarder: true paid into it, nobody else; it keeps what's left,
   nothing passes into it, and nobody else pays shares or set amounts into it): {accountId: true}. Empty for a household
   without boarders. */
function boarderAccounts(c){var out={},by={};arr(c.people).forEach(function(p){if(!p.payAccount)return;by[p.payAccount]=by[p.payAccount]!==false&&p.boarder===true});
  Object.keys(by).forEach(function(id){var a=accById(c,id);if(!by[id]||!a||parentId(c,id)||arr(c.accounts).some(function(x){return parentId(c,x.id)===id}))return;
    if(isObj(a.funding)&&arr(a.funding.people).some(function(pid){var p=personById(c,pid);return p&&p.payAccount!==id}))return;
    out[id]=true});
  return out}

/* ---------- contributions (2.12: household money styles) ----------
   An account can be paid for by named people, each under a rule: funding {people: [personId…], rule, set?: {personId:
   {amount} or {pct}}}. rule: "equal" (half each, or a third…), "pay" (in proportion to usual pay, or this month's when
   there's none), "afterOwn" (in proportion to what each person's own account has left after its own bills), "sameLeft"
   (so everyone keeps the same; someone who'd keep less pays nothing) or "set" (everyone pays a set amount). Set amounts
   (or a percentage of that month's pay) are paid first, whatever the account needs; what it still needs is shared among
   the others by the rule. Money comes from each person's pay account. Someone paid into the account itself pays their
   share by leaving it there (no transfer). Someone whose pay already reaches the account through what's left (their
   chain passes into it) is left out: they'd pay twice (fundingProblem says so in Settings). */
var FUNDING_RULES=["equal","pay","afterOwn","sameLeft","set"];
/* A funding entry as saved, checked: people in this household (each once), a known rule, set amounts that are numbers
   of 0 or more (a percentage 0 to 100) for people in the list. null when nothing usable is left. */
/* rep (optional): what's dropped, as normCfg reports it. People who have left the household are dropped without a word:
   removing someone in Settings leaves them in the list. */
function normFunding(f,c,rep){if(!isObj(f)){normSay(rep,"a share rule that couldn't be read");return null}var ids={};arr(c&&c.people).forEach(function(p){if(p&&p.id)ids[p.id]=true});
  var ppl=[];arr(f.people).forEach(function(id){if(typeof id==="string"&&ids[id]===true&&ppl.indexOf(id)<0)ppl.push(id)});
  if(FUNDING_RULES.indexOf(f.rule)<0){normSay(rep,"a share rule Dovetail doesn't know");return null}
  if(!ppl.length)return null;var out={people:ppl,rule:f.rule};
  if(isObj(f.set)){var set={};ppl.forEach(function(id){var v=f.set[id];if(!isObj(v))return;
      if(typeof v.amount==="number"&&isFinite(v.amount)&&v.amount>=0)set[id]={amount:v.amount};
      else if(typeof v.pct==="number"&&isFinite(v.pct)&&v.pct>=0&&v.pct<=100)set[id]={pct:v.pct};
      else normSay(rep,"a set amount that couldn't be used (negative, or over 100%)")});
    if(Object.keys(set).length)out.set=set}
  return out}
/* ---------- dated bills, budgets, savings and income (2.12, stage 4) ----------
   An edit to an item's amount or account (and a bill's months) applies from the pay month the app opens on when the
   household has months saved before it: the item keeps what it was in was: [{until: "YYYY-MM", amount, account…}],
   oldest first (until = the last month it applied). An item added then starts that month (start); one deleted then
   moves to ended {bills: [item + ended: "YYYY-MM"]…} and still counts in earlier months. cfgFor gives each month its
   items. Without history (a new household), edits apply to every month, as before 2.12. 2.14: rough figures (estimates)
   are dated the same way. */
var ITEM_DATED={bills:["amount","account","months"],budgets:["amount","account"],savings:["amount","fromAccount"],income:["amount","account"],estimates:["amount","account"]};
/* rep (optional): what's dropped or fixed, as normCfg reports it. */
function normDated(list,x,rep){if(x.start!==undefined&&!validMonth(x.start)){delete x.start;normSay(rep,LIST_WORDS[list]+" with a bad first month")}
  if(x.was===undefined)return;var fs=ITEM_DATED[list],n=Array.isArray(x.was)?x.was.length:1,w=objs(x.was).filter(function(e){return validMonth(e.until)}).map(function(e){var y={until:e.until};
    fs.forEach(function(f){var v=e[f];if(f==="amount"){y[f]=typeof v==="number"&&isFinite(v)&&v>=0?v:num(x.amount);if(v!=null&&y[f]!==v)normSay(rep,"an earlier amount that couldn't be used")}
      else if(f==="months")y[f]=Array.isArray(v)?normMonthList(v):normMonthList(x.months);else y[f]=typeof v==="string"?v:x[f]});return y});
  for(var i=w.length;i<n;i++)normSay(rep,"an earlier amount with a bad month");
  w.sort(function(a,b){return a.until<b.until?-1:a.until>b.until?1:0});w=w.filter(function(e,i){if(i&&e.until===w[i-1].until){normSay(rep,"an earlier amount repeated for a month");return false}return true});
  if(w.length)x.was=w;else delete x.was}
/* An item's dated values: amount and account (and a bill's months). */
function itemSnap(list,x){return fieldSnap(ITEM_DATED[list],x)}
/* Fields fs of x, missing ones as null. */
function fieldSnap(fs,x){var o={};fs.forEach(function(f){o[f]=x[f]===undefined?null:clone(x[f])});return o}
/* The item as it was in month k: null before it started; its values then when they were different. */
function itemAt(list,x,k){if(!x||(x.start&&k<x.start))return null;var w=itemWasFor(x,k);if(!w)return x;
  var y=Object.assign({},x);ITEM_DATED[list].forEach(function(f){if(w[f]!==undefined&&w[f]!==null)y[f]=w[f]});return y}
/* The item's earlier values that apply to month k (the first entry whose until is k or later), or null. */
function itemWasFor(x,k){var w=arr(x&&x.was);for(var i=0;i<w.length;i++)if(w[i]&&w[i].until>=k)return w[i];return null}
/* Every item a list has had: today's and those ended (each once). */
function allItems(c,list){var ids={},out=arr(c[list]).filter(function(x){if(x&&x.id)ids[x.id]=1;return !!x});
  return out.concat(arr(c.ended&&c.ended[list]).filter(function(x){if(!x||ids[x.id])return false;ids[x.id]=1;return true}))}
/* Whether any item is dated. */
function hasDated(c){return !!(c&&isObj(c.ended))||Object.keys(ITEM_DATED).some(function(l){return arr(c&&c[l]).some(function(x){return x&&(x.was||x.start)})})}
/* Does the household have months saved before month cur (typed pay or a tick)? Then edits are dated. */
function hasHistory(months,cur){return Object.keys(months||{}).some(function(k){var d=months[k];if(!(k<cur)||!isObj(d)||!validMonth(k))return false;
  return Object.keys(isObj(d.pay)?d.pay:{}).some(function(p){return payIsTyped(d,p)})||Object.keys(isObj(d.done)?d.done:{}).some(function(id){return d.done[id]!=null&&d.done[id]!==false})})}
/* An edit to item x (before = itemSnap before it) from month cur: keep the old values for earlier months. Several edits in
   the same pay month keep the values from before the first; an edit back to them drops the entry. Returns true when x
   now has an entry for the months before cur. */
function dateEdit(list,x,before,cur){return dateFields(ITEM_DATED[list],x,before,cur)}
/* dateEdit's rules on the fields fs of x (an item, or a person: 2.15); now: x's values (default fieldSnap). */
function dateFields(fs,x,before,cur,now){if(!before||!validMonth(cur)||(x.start&&x.start>=cur))return false;now=now||fieldSnap(fs,x);var prev=shiftMonth(cur,-1),w=arr(x.was),last=w[w.length-1];
  // 2.16: values compare by fieldsKey, so a person's pattern (missing while paid every month) compares as it should.
  if(last&&last.until>=prev){if(fieldsKey(fs,last)===fieldsKey(fs,now)){w=w.slice(0,-1);if(w.length)x.was=w;else delete x.was;return false}return true}
  if(fieldsKey(fs,now)===fieldsKey(fs,before))return false;
  x.was=w.concat([Object.assign({until:prev},before)]);return true}
/* The fields fs of o as text for comparing: missing and null are the same, and an object's keys are in any order. */
function fieldsKey(fs,o){var y={};fs.forEach(function(f){if(o&&o[f]!==undefined&&o[f]!==null)y[f]=o[f]});return stableJson(y)}
function stableJson(v){if(Array.isArray(v))return "["+v.map(stableJson).join(",")+"]";
  if(isObj(v))return "{"+Object.keys(v).sort().map(function(k){return JSON.stringify(k)+":"+stableJson(v[k])}).join(",")+"}";return String(JSON.stringify(v))}
/* "Use these for earlier months too": the latest entry goes, so the item's values reach back to the change before it. */
function undateLast(x){var w=arr(x.was).slice(0,-1);if(w.length)x.was=w;else delete x.was}
/* The latest entry when it's for the months just before cur (the edit was made this pay month), else null. */
function datedNow(x,cur){var w=arr(x&&x.was),last=w[w.length-1];return last&&validMonth(cur)&&last.until===shiftMonth(cur,-1)?last:null}
/* Item x deleted from month cur: kept for earlier months unless it started then or later. Changes c. */
function endItem(c,list,x,cur){if(x.start&&x.start>=cur)return;c.ended=isObj(c.ended)?c.ended:{};
  (c.ended[list]=arr(c.ended[list]).filter(function(y){return y.id!==x.id})).push(Object.assign(clone(x),{ended:cur}))}
/* Put an ended item back (Undo). */
function unendItem(c,list,id){if(!isObj(c.ended))return;c.ended[list]=arr(c.ended[list]).filter(function(x){return x.id!==id});if(!c.ended[list].length)delete c.ended[list];if(!Object.keys(c.ended).length)delete c.ended}

/* ---------- dated pay (2.15, docs/payperiods.md 5.2 and 11.1) ----------
   people[].was: [{until: "YYYY-MM", usualPay}], oldest first, stored only when an edit to someone's usual pay is dated
   (the household has months saved before the pay month the app opens on). Earlier months then keep the usual pay they
   had: the "in proportion to pay" shares and the estimates of months with no pay typed in. People aren't in
   ITEM_DATED (normDated would treat usualPay as an item's field); they have their own rule, normPersonWas. undateLast
   and datedNow work on a person as they do on an item. 2.16: a person's pattern is dated with their usual pay; an
   entry without one means they were paid every month then. */
var PERSON_DATED=["usualPay","pattern"];
/* Whether anyone's pay is dated. */
function hasPersonDated(c){return arr(c&&c.people).some(function(p){return isObj(p)&&p.was!==undefined})}
/* A person's dated values, for datePersonEdit's before. Usual pay as a number (missing counts as £0, as payEstimate has
   it), and (2.16) their pattern when they have one. */
function personSnap(p){var o={usualPay:r2(num(p&&p.usualPay))};if(p&&p.pattern)o.pattern=patternCore(p.pattern);return o}
/* 2.17 (13.2, L4): the part of a pattern that's a change of pay, {every, each}, so the part that's dated and compared. A
   recent payday (on) and a first pay (since) are corrections, never dated. Anything else is kept as it is (E16). */
function patternCore(t){var o=clone(t);if(isObj(o)){delete o.on;delete o.since}return o}
/* An edit to person p's usual pay or (2.16) pattern (before = personSnap before it) from month cur: dateEdit's rules.
   Returns true when p now has an entry for the months before cur. */
function datePersonEdit(p,before,cur){return !!p&&dateFields(PERSON_DATED,p,before,cur,personSnap(p))}
/* Person p as they were in month k: a copy with the values from the first entry whose until is k or later, else p. An
   entry without a pattern means paid every month then (2.16). */
function personWas(p,k){var w=itemWasFor(p,k);if(!w)return p;var y=Object.assign({},p);
  PERSON_DATED.forEach(function(f){if(w[f]!==undefined&&w[f]!==null)y[f]=w[f];else if(f==="pattern")delete y[f]});
  // 2.17 (L4): an earlier pay at today's interval is the same series of paydays, so it has today's recent payday (not since).
  var now=patternOf(p);if(now&&now.on!=null&&isObj(y.pattern)&&y.pattern.every===now.every)y.pattern=Object.assign({},y.pattern,{on:now.on});
  return y}
/* The person with id pid as they were in month k, or null when there's no such person. */
function personAt(c,pid,k){var p=personById({people:arr(c&&c.people)},pid);return p?personWas(p,k):null}
/* normCfg's rule for a person's was: entries need a real month and a usual pay of £0 or more (rounded to pence); oldest
   first, one per month; none left, no was. 2.16: an entry's pattern is checked as a person's is (normPattern), and with
   one its usual pay is worked out from it. rep (optional): what's dropped, as normCfg reports it. */
function normPersonWas(p,rep){var w=[];
  (Array.isArray(p.was)?p.was:[null]).forEach(function(e){if(!isObj(e)||!validMonth(e.until)){normSay(rep,"an earlier pay that couldn't be used");return}
    var y={until:e.until,usualPay:e.usualPay};if(e.pattern!==undefined){y.pattern=e.pattern;normPattern(y,rep,true)}
    if(y.pattern||typeof y.usualPay==="number"&&isFinite(y.usualPay)&&y.usualPay>=0){y.usualPay=r2(y.usualPay);w.push(y)}else normSay(rep,"an earlier pay that couldn't be used")});
  w.sort(function(a,b){return a.until<b.until?-1:a.until>b.until?1:0});w=w.filter(function(e,i){if(i&&e.until===w[i-1].until){normSay(rep,"an earlier pay repeated for a month");return false}return true});
  if(w.length)p.was=w;else delete p.was}

/* ---------- pay patterns (2.16, docs/payperiods.md 5.3 and 11.2) ----------
   people[].pattern: {every: 7, 14 or 28 (days between paydays), each (usual take-home pay each time)}, stored only for
   someone who isn't paid every month. Their usualPay is always a month's pay over a year (usualMonthly), so everything
   that reads it (the "in proportion to pay" weights, the checklist) is unchanged. The household still makes its
   transfers once a month, on its transfer day (cfg.payday): such a person's pay for a month is everything that arrived
   since the transfer day before. A saved month's extra {personId: {amount, counted?}} is an extra payday: amount is set
   aside (in their account, not in the transfers) unless counted. Layer 1: no dates are worked out. n = the paydays every
   month has; year = paydays a year; word for "every …". */
var PAY_EVERY={7:{n:4,year:52,word:"week"},14:{n:2,year:26,word:"two weeks"},28:{n:1,year:13,word:"four weeks"}};
var PAY_EACH_MAX=1000000;
/* Whether x is a pattern that can be used: every 7, 14 or 28, and pay each time above £0 (to the penny) and up to £1,000,000. */
function validPattern(x){return isObj(x)&&typeof x.every==="number"&&!!PAY_EVERY[x.every]&&typeof x.each==="number"&&isFinite(x.each)&&r2(x.each)>0&&x.each<=PAY_EACH_MAX}
/* Person (or was entry) p's pattern when it can be used, else null (paid every month). */
function patternOf(p){return p&&validPattern(p.pattern)?p.pattern:null}
/* A month's pay over a year: r2(each × 52, 26 or 13 ÷ 12) for someone on a pattern, otherwise their usual pay. */
function usualMonthly(p){var t=patternOf(p);return t?r2(t.each*PAY_EVERY[t.every].year/12):num(p&&p.usualPay)}
/* Whether anyone is on a pattern now (the words: transfer day). */
function hasPatterns(c){return arr(c&&c.people).some(function(p){return !!patternOf(p)})}
/* Whether anyone is on a pattern now or was in an earlier pay (backups, and the estimates that skip those months). */
function patternsEver(c){return arr(c&&c.people).some(function(p){return !!patternOf(p)||arr(p&&p.was).some(function(w){return !!patternOf(w)})})}
/* normCfg's rule for o.pattern (a person, or a was entry): one that can't be used goes ("a pay pattern that couldn't be
   used"); otherwise pay each time is rounded to pence and usualPay is worked out from it, without a report (E9). Anything
   else inside a pattern is kept as it is. */
function normPattern(o,rep,inWas){if(!validPattern(o.pattern)){delete o.pattern;normSay(rep,"a pay pattern that couldn't be used");return}
  o.pattern=Object.assign({},o.pattern,{each:r2(o.pattern.each)});o.usualPay=usualMonthly(o);var t=o.pattern;
  // 2.17 (13.2, L13): a recent payday (on) and a first pay (since) are a person's only, so a was entry's are stripped. On a
  // person, a date that isn't real (or isn't in 2000 to 2099) goes on its own, leaving the pattern; so does since without on.
  if(inWas){delete t.on;delete t.since;return}
  if(t.on!==undefined&&!paydayDateOk(t.on)){delete t.on;normSay(rep,"a payday date that couldn't be used")}
  if(t.since!==undefined&&(!paydayDateOk(t.since)||t.on===undefined)){delete t.since;normSay(rep,"a payday date that couldn't be used")}}
/* 2.17: a payday date that can be stored: a real "YYYY-MM-DD" date in the years 2000 to 2099. */
function paydayDateOk(s){return typeof s==="string"&&validDate(s)&&addDays(s,0)===s&&s>="2000-01-01"&&s<="2099-12-31"}
/* "a week", "every two weeks", "every four weeks". */
function everyWords(every){var e=PAY_EVERY[every];return !e?"":every===7?"a week":"every "+e.word}
/* "£1,560.00 every four weeks". */
function patternWords(t){return validPattern(t)?fmt(t.each)+" "+everyWords(t.every):""}
/* The day the household makes its transfers, in words (6.1): "transfer day" once anyone is on a pattern, otherwise
   "payday". cap: with a capital letter. Labels only. */
function dayWord(c,cap){var w=hasPatterns(c)?"transfer day":"payday";return cap?w.charAt(0).toUpperCase()+w.slice(1):w}

/* ---------- counting paydays (2.17, layer 2: docs/payperiods.md 5.4 to 5.6 and 13.2) ----------
   A person on a pattern can also have one payday as it usually falls, pattern.on ("YYYY-MM-DD"; "A recent payday"), and a
   first pay, pattern.since (a new job: paydays before it aren't counted). Their paydays are on + j × every, for any whole
   j, each moved to the working day before a weekend or England and Wales bank holiday (workingDayOnOrBefore, as the
   transfer day is). Month k's paydays are those in its window, after the transfer day before it, up to and including its
   own. Nothing here is stored: freezePaydays stores a month's count when its pay is first typed or ticked. */
/* The window's transfer day with none set (a damaged file, E12): the 25th, not moved, for counting only. */
var NO_DAY_WINDOW={day:25,weekend:false};
/* Month k's window: {after: the transfer day before it, upTo: its own} ("YYYY-MM-DD"); a payday counts when after < it ≤ upTo. */
function transferWindow(c,k){var pc=c&&isObj(c.payday)&&c.payday.day?c.payday:NO_DAY_WINDOW;return {after:paydayFor(pc,shiftMonth(k,-1)),upTo:paydayFor(pc,k)}}
/* Person (or was entry) p's pattern when it has a recent payday (on), else null. */
function datedPattern(p){var t=patternOf(p);return t&&paydayDateOk(t.on)?t:null}
/* Pattern t's paydays in a window, oldest first: each date on + j × every moved to a working day (a), counted when after <
   a ≤ upTo and, with since, a ≥ since moved the same way (since is stored as typed, so a first pay typed on a bank holiday
   counts on the working day before, as it's paid: L20). since only removes paydays from the window that holds it: a
   window that ends before it counts as if there were none (L21: earlier months get the pattern only when the household
   says so, "Change earlier months too", so they were paid on it). It steps from the window, not from on, so any date in the series
   works. [] without a date. */
function paydaysIn(t,after,upTo){if(!isObj(t)||!PAY_EVERY[t.every]||!paydayDateOk(t.on)||!validDate(after)||!validDate(upTo))return [];
  var e=t.every,since=paydayDateOk(t.since)?workingDayOnOrBefore(t.since):null,out=[];if(since&&since>upTo)since=null;var j=Math.floor((dUTC(after)-dUTC(t.on))/864e5/e)+1,last=addDays(upTo,10);
  for(var g=0;g<20;g++,j++){var d=addDays(t.on,j*e);if(d>last)break;var a=workingDayOnOrBefore(d);if(a>after&&a<=upTo&&(!since||a>=since))out.push(a)}
  return out}
/* Person pid's paydays counted in month k's window today (their pattern as it was in month k, personAt), or null when they
   have no recent payday then. */
function paydaysFor(c,pid,k){var t=datedPattern(personAt(c,pid,k));if(!t)return null;var w=transferWindow(c,k);return paydaysIn(t,w.after,w.upTo)}
/* The pay month whose window holds a date (a first pay, say), with the date moved as a payday would be, or null. The second
   argument (a person's id or a pattern) is accepted for 13.2's call; the month doesn't depend on it. */
function patternStartMonth(c,who,date){if(!paydayDateOk(date))return null;var a=workingDayOnOrBefore(date),m=a.slice(0,7);
  for(var i=-1;i<=3;i++){var k=shiftMonth(m,i),w=transferWindow(c,k);if(w.after<a&&a<=w.upTo)return k}return null}
/* Pattern t's next payday on or after today (moved, and not before since), or null without a date. */
function nextPaydayOf(t,today){var s=isObj(t)&&paydayDateOk(t.since)?workingDayOnOrBefore(t.since):"";if(s>today)today=s;return paydaysIn(t,addDays(today,-1),addDays(today,60))[0]||null}
/* Pattern t's last payday on or before a date (moved, and not before since), or null. */
function lastPaydayBy(t,date){var l=paydaysIn(t,addDays(date,-60),date);return l.length?l[l.length-1]:null}
/* The first day the app opens on pay month k (defaultMonth: 10 days before its payday or transfer day; without one, the
   15th of the month before), "YYYY-MM-DD". */
function monthOpensOn(pc,k){for(var d=addDays(k+"-01",-50),g=0;g<120;g++,d=addDays(d,1))if(defaultMonth(pc,d)===k)return d;return null}
/* Dates in words (2.17). "Fri 30 Oct". */
var DAYS_LONG=["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
function shortDay(s){var p=s.split("-").map(Number);return DAYS[dow(s)]+" "+p[2]+" "+MS[p[1]-1]}
/* "Thursday 15 October" (no year). */
function dayDate(s){var p=s.split("-").map(Number);return DAYS_LONG[dow(s)]+" "+p[2]+" "+MN[p[1]-1]}
/* Dates grouped by month: "6, 13, 20 and 27 Nov", "30 Oct, 6 and 13 Nov", "30 Oct and 6 Nov", "27 and 31 Dec, 3 Jan".
   Groups are joined with "and" when each holds one date, otherwise with commas. full: whole month names, and each
   group's year when the dates span more than one year (for screen readers: "30 October, 6 and 13 November"). */
function datesWords(list,full){var g=[];arr(list).forEach(function(s){var k=s.slice(0,7),last=g[g.length-1];if(last&&last.k===k)last.d.push(Number(s.slice(8)));else g.push({k:k,d:[Number(s.slice(8))]})});
  var years=g.length&&g[0].k.slice(0,4)!==g[g.length-1].k.slice(0,4);
  var parts=g.map(function(x){var m=mNum(x.k)-1;return listAnd(x.d.map(String))+" "+(full?MN[m]:MS[m])+(full&&years?" "+x.k.slice(0,4):"")});
  return g.every(function(x){return x.d.length===1})?listAnd(parts):parts.join(", ")}
function datesWordsFull(list){return datesWords(list,true)}
/* ---------- layer 2's plain sentences (13.2, L6, L7, L15) ----------
   The Pay tab and Settings compose the sentences with dates in them (short dates hidden from screen readers, with full
   ones beside them) from the date words above and planPay's fields; these are the ones without. */
function nameOf(c,pid){var ps=arr(c&&c.people);for(var i=0;i<ps.length;i++)if(ps[i]&&ps[i].id===pid)return personName(ps[i],i);return "Someone"}
function paydaysN(n){return n===1?"1 payday":n+" paydays"}
/* A frozen count that today's dates no longer match (L15): "5 paydays (counted when this month was first saved)". */
function frozenWords(m){return paydaysN(m)+" (counted when this month was first saved)"}
/* "Not an extra payday": "All 5 of Jordan's paydays are in these transfers." */
function notExtraWords(name,m){return "All "+m+" of "+possessive(name)+" paydays are in these transfers."}
/* A line locked by "Use it this month": "Used in May 2027." */
function usedInWords(k){return "Used in "+mLabel(k)+"."}
/* The gap line's offer (with useExtraOffer's one-off o): "Last month's extra payday (£420.00) was set aside. If it's still
   in Sam's account, use it this month." */
function useExtraWords(c,pid,o){return "Last month's extra payday ("+fmt(o.amount)+") was set aside. If it's still in "+possessive(nameOf(c,pid))+" account, use it this month."}
/* The one-off in month k that uses person pid's extra payday from the month before, or null. */
function extraUsedIn(months,k,pid){return arr(months&&isObj(months[k])&&months[k].oneOffs).filter(function(o){return isObj(o)&&o.extraOf===pid&&o.extraFrom===shiftMonth(k,-1)})[0]||null}
/* Once used: "Sam's extra payday from April (£420.00) is in these transfers as a one-off." */
function usedExtraWords(c,pid,o){return possessive(nameOf(c,pid))+" extra payday from "+MN[mNum(o.extraFrom)-1]+" ("+fmt(o.amount)+") is in these transfers as a one-off."}
/* Setup step 3's banner, per person with a date (date: the next transfer day): "Kerry's last pay before then: Thursday 15
   October." With two: "Kerry's last pay before then: Thursday 15 October, and Lewis's: Friday 23 October." "" with none. */
function lastPayWords(c,date){var parts=[];arr(c&&c.people).forEach(function(p,i){var t=datedPattern(p),d=t&&lastPaydayBy(t,date);if(d)parts.push({n:possessive(personName(p,i)),d:dayDate(d)})});
  if(!parts.length)return "";return parts[0].n+" last pay before then: "+parts[0].d+parts.slice(1).map(function(x,i){return (i===parts.length-2?", and ":", ")+x.n+": "+x.d}).join("")+"."}
/* "weekly", "two-weekly", "four-weekly". */
function everyAdjective(every){return every===7?"weekly":every===14?"two-weekly":every===28?"four-weekly":""}
/* L7, the change sheet's first pay on a new pattern (every) for person pid: {k (the pay month it's for), opensOn (the first
   day the app opens on k), text: "Marc's first weekly pay is for February 2027. Make this change from Tuesday 19 January,
   when Dovetail moves on to February 2027."}, or null for a date that can't be used. The sheet shows text, and makes
   Change unavailable, only when k is after the month the app opens on. */
function firstPayChange(c,pid,every,date){var k=patternStartMonth(c,pid,date);if(!k)return null;var o=monthOpensOn(c&&c.payday,k);
  return {k:k,opensOn:o,text:possessive(nameOf(c,pid))+" first "+everyAdjective(every)+" pay is for "+mLabel(k)+". Make this change from "+(o?dayDate(o):"later")+", when Dovetail moves on to "+mLabel(k)+"."}}

/* ---------- a rough figure for an account's bills (2.14, docs/onboarding.md 5.2) ----------
   estimates: [{id, account, amount}], optional (stored only when there's one), a dated item like a bill (was, start,
   ended.estimates), so earlier months keep their figures and a change of style moves a figure with the account's bills.
   Two on one account add up. Each month, per account: not listed yet = the figure less the account's listed bills that
   come in 7 or more months a year (whether or not they're due that month), never below £0; the account's bills that
   month = not listed yet + the listed bills due. Bills that come in 6 or fewer months a year always count on top. So
   listing a bill within the figure changes no transfer. On screen it's "rough figure" and "not listed yet". */
var FIGURE_MONTHS=7;
/* Whether a bill counts within a rough figure: it comes in 7 or more months a year (an empty months list, or all 12, is
   every month). */
function inFigure(b){return perYear(b)>=FIGURE_MONTHS}
/* An estimate that can be used: an id, an account in the household (closed ones too) and an amount of £0 or more. */
function estimateOk(x,c){return isObj(x)&&typeof x.id==="string"&&!!x.id&&typeof x.account==="string"&&!!accById(c,x.account)&&typeof x.amount==="number"&&isFinite(x.amount)&&x.amount>=0}
/* The estimates as saved, checked (each id once, the first kept). rep (optional): what's dropped, as normCfg reports it. */
function normEstimates(list,c,rep){var seen={},out=[];arr(list).forEach(function(x){if(!isObj(x)){normSay(rep,"a rough figure that couldn't be read");return}
    if(!estimateOk(x,c)||seen[x.id]){normSay(rep,"a rough figure that couldn't be used");return}seen[x.id]=1;out.push(x)});
  return out}
/* Whether the settings have a rough figure, now or ended from a month (a backup then needs 2.14). */
function hasEstimates(c){return arr(c&&c.estimates).length>0||arr(c&&isObj(c.ended)&&c.ended.estimates).length>0}
/* Per account with a figure, in month settings c (cfgFor; the settings themselves for now): {accountId: {figure, listed
   (its bills that come in 7 or more months a year), unlisted (not listed yet)}}. Empty without a figure. */
function estimateTotals(c){var out={};arr(c&&c.estimates).forEach(function(x){if(!x||!x.account)return;var e=out[x.account]||(out[x.account]={figure:0,listed:0,unlisted:0});e.figure+=num(x.amount)});
  arr(c&&c.bills).forEach(function(b){var e=b&&out[b.account];if(e&&inFigure(b))e.listed+=num(b.amount)});
  Object.keys(out).forEach(function(id){var e=out[id];e.figure=r2(e.figure);e.listed=r2(e.listed);e.unlisted=r2(Math.max(0,e.figure-e.listed))});return out}
/* One account's figure in c: {has (a figure is set), figure, listed, unlisted, over (how far the listed bills have gone past
   the figure, else 0), passed (over > 0)}. All 0 and has false without a figure. */
function estimateParts(c,id){var e=estimateTotals(c)[id];if(!e)return {has:false,figure:0,listed:0,unlisted:0,over:0,passed:false};
  var over=r2(Math.max(0,e.listed-e.figure));return {has:true,figure:e.figure,listed:e.listed,unlisted:e.unlisted,over:over,passed:over>0}}
/* The figure for account id in c (0 without one). */
function estimateFor(c,id){return estimateParts(c,id).figure}
/* Whether the listed bills have gone past account id's figure in c ("Your bills now add up to £1,520, more than the £1,500
   you put. Is that all of them?"). estimateJustPassed: they hadn't in before and have in after (the moment to ask). */
function estimatePassed(c,id){return estimateParts(c,id).passed}
function estimateJustPassed(before,after,id){return !estimatePassed(before,id)&&estimatePassed(after,id)}
/* "There are more": the next £50 strictly above the listed bills (£1,520 → £1,550, £1,500 → £1,550). */
function estimateRoundUp(listed){return (Math.floor(r2(num(listed))/50+1e-9)+1)*50}
/* Whether account id may have a figure (design 5.9), or why not: null when it may; "board" for a boarder's own account
   (outside the household's figures); "share" for someone's own account when they pay a share into another account
   under "in proportion to what's left after own bills" (afterOwn) or "so we each keep the same" (sameLeft), where a
   figure would move the cost to the others. Someone's own account, for an account j paid for by people: the furthest
   account their money reaches while it's still only theirs (ownTop, what fundingShares counts as what they have left)
   and every account that passes what's left into it; not j itself (a bill payer's figure on their own account is fine). */
function estimateBlock(c,id){if(boarderAccounts(c)[id])return "board";
  var hit=arr(c.accounts).some(function(j){var f=j.funding;if(!isObj(f)||(f.rule!=="afterOwn"&&f.rule!=="sameLeft"))return false;
    return fundingPeople(c,j.id).some(function(p){if(p.payAccount===j.id)return false;var top=ownTop(c,p,j.id);return top!==j.id&&(top===id||descendants(c,top).indexOf(id)>=0)})});
  return hit?"share":null}
function estimateAllowed(c,id){return estimateBlock(c,id)===null}
/* "Gym deleted. Lower Joint's figure by £30 too?": deleting bill b (c = the settings with or without it) puts back into
   "not listed yet" the part of it that was within the figure: min(its amount, not listed yet once it's gone).
   {account, amount, figure (the figure now)}, or null when that's nothing (no figure, a bill that comes in 6 or fewer
   months, or the listed bills still past the figure). */
function estimateDeleteOffer(c,b){if(!b||!inFigure(b))return null;var id=b.account,without=Object.assign({},c,{bills:arr(c.bills).filter(function(x){return x&&x.id!==b.id})}),p=estimateParts(without,id);
  if(!p.has)return null;var amt=r2(Math.min(num(b.amount),p.unlisted));return amt>0?{account:id,amount:amt,figure:p.figure}:null}
/* Account id's figure set to amount from pay month cur: the first of its estimates takes it, any others end; with none, a
   new one. 0 or less (or blank) ends the figure ("That's all of them"). dated (hasHistory, as Settings dates edits):
   earlier months keep what they had (dateEdit, endItem, start); otherwise every month changes. Returns new settings
   (c is unchanged). */
function setEstimate(c,id,amount,cur,dated){var out=clone(c),v=r2(num(amount)),mine=arr(out.estimates).filter(function(x){return x.account===id}),keep=v>0?mine[0]:null;
  mine.forEach(function(x){if(x===keep)return;if(dated)endItem(out,"estimates",x,cur);out.estimates=out.estimates.filter(function(y){return y!==x})});
  if(keep){var before=itemSnap("estimates",keep);keep.amount=v;if(dated)dateEdit("estimates",keep,before,cur)}
  else if(v>0){var e={id:uid("e"),account:id,amount:v};if(dated&&validMonth(cur))e.start=cur;out.estimates=arr(out.estimates).concat([e])}
  if(!arr(out.estimates).length)delete out.estimates;return out}
/* "That's all of them": account id's figure ends from pay month cur (earlier months keep it when dated). */
function endEstimates(c,id,cur,dated){return setEstimate(c,id,0,cur,dated)}
/* "All of Joint's bills are in. … Alex's share goes down by £100 a month and Sam's by £100." What ending account id's figure
   from month k changes in month k, worked out with calc before and after (shares split the change): {before, after (calc's
   results), people: [{id, name, before, after, change}] (what each pays into accounts as shares, set amounts or board;
   change = after − before, so negative is good news), steps: [{id, kind, from, to, before, after, change}] (each transfer
   that changes, appears or goes; 0 for one that isn't there), float: the change in what's left}. */
function estimateEndEffect(c,months,k,id){var b=calcMonth(c,months,k),a=calcMonth(endEstimates(c,id,k,true),months,k),mc=cfgFor(c,k,monthOneOffs(months,k));
  var paid=function(r,pid){return r2(arr(r.steps).filter(function(s){return s.kind==="contribute"&&s.person===pid}).reduce(function(t,s){return t+s.amt},0))};
  var people=arr(mc.people).map(function(p,i){var x=paid(b,p.id),y=paid(a,p.id);return {id:p.id,name:personName(p,i),before:x,after:y,change:r2(y-x)}});
  var ids=[],by=function(r,sid){return arr(r.steps).filter(function(s){return s.id===sid})[0]};b.steps.concat(a.steps).forEach(function(s){if(ids.indexOf(s.id)<0)ids.push(s.id)});
  var steps=ids.map(function(sid){var x=by(b,sid),y=by(a,sid),s=x||y;return {id:sid,kind:s.kind,from:s.from,to:s.to||null,before:x?r2(x.amt):0,after:y?r2(y.amt):0,change:r2((y?y.amt:0)-(x?x.amt:0))}}).filter(function(s){return Math.abs(s.change)>0.004});
  return {before:b,after:a,people:people,steps:steps,float:r2(a.flt-b.flt)}}

/* ---------- changing how the household manages its money, from a month (2.12) ----------
   The settings hold the arrangement in use now (and from the latest change on): each account's leftoverTo and funding,
   and each person's payAccount. flows lists the changes, each with the arrangement used before it: {from: "YYYY-MM",
   was: {accounts: {accountId: {leftoverTo, funding?}}, pay: {personId: accountId}}}. A month before a change uses that
   change's "was"; a month on or after the latest change uses the settings. An account in a "was" was open then; one
   that isn't was opened later. closedFrom on an account: the change it was closed by. With no flows and nothing
   closed, every month uses the settings as they are, as before 2.12. Bills, budgets and savings aren't dated: moving
   one changes earlier months too (stage 4 of the plan). */
function validMonth(k){return typeof k==="string"&&/^\d{4}-(0[1-9]|1[0-2])$/.test(k)}
/* The lists whose items have an account: what a change records when it moves one (was.items), and the field. 2.14: rough
   figures (estimates) too, so a change of style moves a figure with the account's bills. The list is optional: code that
   goes through these lists uses arr() or allItems. */
var ITEM_LISTS=[["bills","account"],["budgets","account"],["savings","fromAccount"],["income","account"],["estimates","account"]];
/* Changes as saved, checked: a real month (each once, the first kept), an arrangement that's an object, account entries
   with a leftoverTo that's an id or null and a usable funding, pay that names accounts, items moved (an account id
   for each) and names changed (a name and colour). Sorted by month. rep (optional): what's dropped, as normCfg reports it. */
function normFlows(fl,c,rep){var out=[],seen={},ids=function(o){var r={};if(isObj(o))Object.keys(o).forEach(function(k){if(typeof o[k]==="string"&&o[k])r[k]=o[k]});return r};
  arr(fl).forEach(function(e){if(!isObj(e)||!isObj(e.was)){normSay(rep,"a change of style that couldn't be read");return}if(!validMonth(e.from)){normSay(rep,"a change of style with a bad month");return}
    if(seen[e.from]){normSay(rep,"a second change of style in the same month");return}var w=e.was,acc={},x={};
    if(isObj(w.accounts))Object.keys(w.accounts).forEach(function(id){var a=w.accounts[id];if(!isObj(a))return;
      var y={leftoverTo:typeof a.leftoverTo==="string"&&a.leftoverTo?a.leftoverTo:null};if(a.funding!==undefined){var f=normFunding(a.funding,c,rep);if(f)y.funding=f}acc[id]=y});
    x.accounts=acc;x.pay=ids(w.pay);
    if(isObj(w.items)){var it={};ITEM_LISTS.forEach(function(l){var m=ids(w.items[l[0]]);if(Object.keys(m).length)it[l[0]]=m});if(Object.keys(it).length)x.items=it}
    if(isObj(w.names)){var nm={};Object.keys(w.names).forEach(function(id){var n=w.names[id];if(isObj(n)&&typeof n.name==="string")nm[id]={name:n.name,colour:typeof n.colour==="string"?n.colour:"grey"}});if(Object.keys(nm).length)x.names=nm}
    // 2.12.1: who paid board before the change (people in the household; an empty list means nobody did).
    if(Array.isArray(w.boarders))x.boarders=w.boarders.filter(function(id,i,a){return typeof id==="string"&&a.indexOf(id)===i&&arr(c&&c.people).some(function(p){return p&&p.id===id})});
    seen[e.from]=true;out.push({from:e.from,was:x})});
  return out.sort(function(a,b){return a.from<b.from?-1:a.from>b.from?1:0})}
/* The change whose "was" applies to month k (the first change after k), or null when the settings apply. */
function flowFor(c,k){var fl=arr(c&&c.flows);for(var i=0;i<fl.length;i++)if(isObj(fl[i])&&fl[i].from>k)return fl[i];return null}
/* Whether account a is part of the arrangement for month k. */
function inEffect(c,a,k){var e=flowFor(c,k);return e?!!(e.was&&e.was.accounts&&e.was.accounts[a.id]):!(a.closedFrom&&a.closedFrom<=k)}
/* Where each item moved by a change was in month k: the changes after k, the latest first, so the earliest wins. Only
   items a change moved are listed (bills edited in Settings aren't dated: stage 4 of the plan). */
function itemsAt(c,k){var out={};ITEM_LISTS.forEach(function(l){out[l[0]]={}});
  arr(c.flows).filter(function(e){return isObj(e)&&e.from>k}).reverse().forEach(function(e){var it=e.was&&e.was.items;if(!isObj(it))return;
    ITEM_LISTS.forEach(function(l){var m=it[l[0]];if(isObj(m))Object.keys(m).forEach(function(id){if(accById(c,m[id]))out[l[0]][id]={acc:m[id],until:shiftMonth(e.from,-1)}})})});
  return out}
/* The settings for month k: the arrangement in use then, with items a change moved back where they were. Accounts that
   weren't part of it are left out, unless something that month still uses them (a bill due, a budget, a savings
   transfer, income, someone's pay, a one-off), in which case they keep what's left and nobody pays into them. With no
   changes and nothing closed, c itself. */
function cfgFor(c,k,oneOffs){if(!c||(!arr(c.flows).length&&!arr(c.accounts).some(function(a){return a&&a.closedFrom})&&!hasDated(c)&&!hasPersonDated(c)))return c;
  var e=flowFor(c,k),m=mNum(k),out=Object.assign({},c),used={},at=itemsAt(c,k);
  // Each item as it was that month (stage 4), then where a change of style had it (was.items).
  // When both say where an item was, the one recorded for the earlier month wins (it's nearer month k).
  // A household that has never had a rough figure gets no estimates list (2.14), as its settings have none.
  ITEM_LISTS.forEach(function(l){if(c[l[0]]===undefined&&!arr(isObj(c.ended)&&c.ended[l[0]]).length)return;var moved=at[l[0]];out[l[0]]=allItems(c,l[0]).filter(function(x){return !x.ended||x.ended>k}).map(function(x){var y=itemAt(l[0],x,k);if(!y)return null;
      var mv=moved[x.id],w=itemWasFor(x,k);if(mv&&(!w||mv.until<=w.until)){y=Object.assign({},y);y[l[1]]=mv.acc}
      if(y[l[1]]!==x[l[1]]&&!accById(c,y[l[1]])){y=Object.assign({},y);y[l[1]]=x[l[1]]}return y}).filter(Boolean)});
  // 2.15: each person's usual pay as it was that month (personWas).
  out.people=arr(c.people).map(function(p){var x=Object.assign({},personWas(p,k)),to=e&&e.was.pay&&e.was.pay[p.id];if(to&&accById(c,to))x.payAccount=to;
    // 2.12.1: who paid board then, when the change recorded it.
    if(e&&Array.isArray(e.was.boarders)){if(e.was.boarders.indexOf(p.id)>=0)x.boarder=true;else delete x.boarder}return x});
  out.people.forEach(function(p){used[p.payAccount]=1});
  arr(out.bills).forEach(function(b){if(applies(b,m))used[b.account]=1});arr(out.budgets).forEach(function(x){used[x.account]=1});
  arr(out.savings).forEach(function(x){used[x.fromAccount]=1});arr(out.income).forEach(function(x){used[x.account]=1});arr(out.estimates).forEach(function(x){used[x.account]=1});arr(oneOffs).forEach(function(o){if(o)used[o.account]=1});
  out.accounts=arr(c.accounts).filter(function(a){return inEffect(c,a,k)||used[a.id]}).map(function(a){var x=Object.assign({},a),on=inEffect(c,a,k);
    if(e&&on){var w=e.was.accounts[a.id];x.leftoverTo=w.leftoverTo||null;if(w.funding)x.funding=w.funding;else delete x.funding}
    if(!on){x.leftoverTo=null;delete x.funding}return x});
  return out}
/* The arrangement for month k, as a "was" records it (without items and names: applyChange adds those). */
function arrangementAt(c,k){var x=cfgFor(c,k),acc={},pay={};
  arr(x.accounts).forEach(function(a){if(!inEffect(c,a,k))return;var y={leftoverTo:a.leftoverTo||null};if(isObj(a.funding))y.funding=clone(a.funding);acc[a.id]=y});
  arr(x.people).forEach(function(p){if(p.payAccount)pay[p.id]=p.payAccount});return {accounts:acc,pay:pay}}
/* Account ids something in the settings uses (pay, bills, budgets, savings, income), plus keep (ids used elsewhere: the
   saved months' one-offs). */
function usedAccounts(c,keep){var u={};arr(keep).forEach(function(id){u[id]=1});arr(c.people).forEach(function(p){u[p.payAccount]=1});
  ITEM_LISTS.forEach(function(l){allItems(c,l[0]).forEach(function(x){u[x[l[1]]]=1;arr(x.was).forEach(function(w){if(w&&w[l[1]])u[w[l[1]]]=1})})});return u}
/* A change from month "from": next = {accounts: [{id, name, colour, leftoverTo, funding?}…] (the new arrangement, new
   accounts with ids of their own), pay: {personId: accountId}}; moves = {closedAccountId: accountId} for the bills,
   budgets, savings and income of accounts that aren't in it; keep = account ids the saved months' one-offs use. Returns
   new settings; c is unchanged. Months before "from" keep the arrangement they had, items it moves stay where they were
   then (was.items), and names it changes are kept for Undo (was.names). A change already saved from that month or
   later is replaced. An account that was never open before "from" and isn't in the new arrangement is removed when
   nothing uses it (a change it was opened by has been replaced). */
function applyChange(c,from,next,moves,keep){var out=clone(c),prev=shiftMonth(from,-1),was=arrangementAt(c,prev),before=cfgFor(c,prev),ids={};moves=moves||{};
  // 2.12.1: who pays board from "from" (next.boarders {personId: true/false}, for the people the change asked about);
  // the change keeps who did before, for earlier months and Undo.
  if(isObj(next.boarders)){was.boarders=arr(before.people).filter(function(p){return p.boarder===true}).map(function(p){return p.id});
    out.people.forEach(function(p){var b=next.boarders[p.id];if(b===true)p.boarder=true;else if(b===false)delete p.boarder})}
  arr(next.accounts).forEach(function(n){ids[n.id]=n});
  out.flows=arr(out.flows).filter(function(e){return e.from<from});
  var names={};out.accounts.forEach(function(a){var n=ids[a.id];if(n&&(n.name!==a.name||n.colour!==a.colour))names[a.id]={name:a.name||"",colour:a.colour||"grey"}});
  out.accounts.forEach(function(a){var n=ids[a.id];if(n){a.name=n.name;a.colour=n.colour;a.leftoverTo=n.leftoverTo||null;if(n.funding)a.funding=clone(n.funding);else delete a.funding;delete a.closedFrom}
    else{if(!(a.closedFrom&&a.closedFrom<=from))a.closedFrom=from;a.leftoverTo=null;delete a.funding}});
  arr(next.accounts).forEach(function(n){if(!accById(c,n.id)){var a={id:n.id,name:n.name,colour:n.colour,leftoverTo:n.leftoverTo||null};if(n.funding)a.funding=clone(n.funding);out.accounts.push(a)}});
  out.people.forEach(function(p){if(next.pay&&next.pay[p.id])p.payAccount=next.pay[p.id]});
  Object.keys(moves).forEach(function(id){var to=moves[id];if(!ids[to])return;
    ITEM_LISTS.forEach(function(l){arr(out[l[0]]).forEach(function(x){if(x[l[1]]===id)x[l[1]]=to})})});
  // Where each item was the month before, for any that are somewhere else now.
  var items={};ITEM_LISTS.forEach(function(l){var m={};arr(before[l[0]]).forEach(function(x){if(!x)return;var y=arr(out[l[0]]).filter(function(z){return z&&z.id===x.id})[0];
    if(y&&y[l[1]]!==x[l[1]]&&accById(c,x[l[1]]))m[x.id]=x[l[1]]});if(Object.keys(m).length)items[l[0]]=m});
  if(Object.keys(items).length)was.items=items;if(Object.keys(names).length)was.names=names;
  out.flows.push({from:from,was:was});
  // Accounts never open before "from" and not in the new arrangement: gone, unless something uses them.
  var used=usedAccounts(out,keep),inSome=function(id){return out.flows.some(function(e){return e.was.accounts[id]})};
  out.accounts=out.accounts.filter(function(a){return ids[a.id]||inSome(a.id)||used[a.id]});
  return normCfg(out)}
/* Undo the latest change: the arrangement before it comes back for every month, with the items it moved and the names it
   changed. Accounts it opened are removed when nothing uses them (keep: ids the saved months' one-offs use); otherwise
   they stay, keeping what's left. */
function removeLastChange(c,keep){var fl=arr(c.flows);if(!fl.length)return c;var e=fl[fl.length-1],out=clone(c),w=e.was;
  out.flows=fl.slice(0,-1);if(!out.flows.length)delete out.flows;
  out.people.forEach(function(p){var to=w.pay[p.id];if(to&&accById(c,to))p.payAccount=to});
  if(isObj(w.items))ITEM_LISTS.forEach(function(l){var m=w.items[l[0]];if(isObj(m))arr(out[l[0]]).forEach(function(x){if(m[x.id]&&accById(c,m[x.id]))x[l[1]]=m[x.id]})});
  if(isObj(w.names))out.accounts.forEach(function(a){var n=w.names[a.id];if(n){a.name=n.name;a.colour=n.colour}});
  if(Array.isArray(w.boarders))out.people.forEach(function(p){if(w.boarders.indexOf(p.id)>=0)p.boarder=true;else delete p.boarder});
  var used=usedAccounts(out,keep);
  out.accounts=out.accounts.filter(function(a){return w.accounts[a.id]||a.closedFrom&&a.closedFrom<e.from||used[a.id]}).map(function(a){var x=w.accounts[a.id];
    if(x){a.leftoverTo=x.leftoverTo||null;if(x.funding)a.funding=clone(x.funding);else delete a.funding;if(a.closedFrom&&a.closedFrom>=e.from)delete a.closedFrom}
    else if(!(a.closedFrom&&a.closedFrom<e.from)){a.leftoverTo=null;delete a.funding}return a});
  return normCfg(out)}
/* Roles for an existing household's accounts, so "Change how we manage our money" can keep them (setupShape's roles):
   someone's own account, then the joint account, or joint bills and joint spending; for one person, main, or pay,
   bills and spending, in flow order. Accounts closed already have none. */
function accountRoles(c){var ppl=arr(c.people),out={},live=arr(c.accounts).filter(function(a){return !a.closedFrom}),lc={accounts:live,people:ppl};
  var order=flowOrder(lc),rest=[];
  order.forEach(function(id){var paid=ppl.filter(function(p){return p.payAccount===id});if(ppl.length>1&&paid.length===1)out[id]="own:"+paid[0].id;else rest.push(id)});
  if(ppl.length>1){if(rest.length===1)out[rest[0]]="joint";else if(rest.length>1){out[rest[0]]="bills";out[rest[rest.length-1]]="spending"}}
  else{var names=rest.length===1?["main"]:rest.length===2?["bills","spending"]:["pay","bills","spending"];rest.slice(-names.length).forEach(function(id,i){out[id]=names[names.length-Math.min(rest.length,names.length)+i]})}
  return out}
/* 2.13: which of a household's own accounts each account of a new arrangement keeps, for "Change how you manage your
   money": roles = accountRoles(c) of the household (never the accounts a previous answer left, so the result depends only
   on the answer given, not on the answers before it); shape = setupShape's accounts. The same role first; then a
   stand-in (a joint account for joint bills or joint spending, and the other way round). {shapeAccountId: accountId}. */
var ROLE_STAND_INS={joint:["bills","spending","main"],bills:["joint","main"],spending:["joint","main"],main:["joint","bills","spending"]};
function matchAccounts(roles,shape){var had={},used={},out={};Object.keys(roles||{}).forEach(function(id){if(!had[roles[id]])had[roles[id]]=id});
  arr(shape).forEach(function(a){var id=had[a.role];if(id&&!used[id]){out[a.id]=id;used[id]=1}});
  arr(shape).forEach(function(a){if(out[a.id])return;(ROLE_STAND_INS[a.role]||[]).some(function(r){var id=had[r];if(id&&!used[id]){out[a.id]=id;used[id]=1;return true}})});
  return out}
/* Accounts with funding that calc uses, in flow order (deepest first), so an account's contributions are known before
   the account it passes what's left to is worked out. Accounts paid for only by set amounts come first (2.12.1): their
   amounts don't depend on anything else, and shares by what each person has left ("so we each keep the same") must
   see them, wherever the accounts sit. */
function fundedOrder(c,order,depthOf){var ix={},setOnly=function(id){return accById(c,id).funding.rule==="set"?0:1};order.forEach(function(id,i){ix[id]=i});
  return order.filter(function(id){var a=accById(c,id);return a&&isObj(a.funding)&&arr(a.funding.people).length})
    .sort(function(a,b){return setOnly(a)-setOnly(b)||depthOf(b)-depthOf(a)||ix[a]-ix[b]})}
/* Whether account x's chain (what's left, moving on) reaches account j. */
function passesInto(c,x,j){var g=0;x=parentId(c,x);while(x&&g<200){if(x===j)return true;x=parentId(c,x);g++}return false}
/* The people who pay for account id under its funding, in its order: those in the household with a pay account, and not
   those whose pay already passes into it. */
function fundingPeople(c,id){var a=accById(c,id),f=a&&a.funding;if(!isObj(f))return [];
  return arr(f.people).map(function(pid){return personById(c,pid)}).filter(function(p){return p&&accById(c,p.payAccount)&&(p.payAccount===id||!passesInto(c,p.payAccount,id))})}
/* What a set-up would get wrong, in words for Settings, or null: someone paying into an account their own pay already
   reaches. */
function fundingProblem(c,id){var a=accById(c,id),f=a&&a.funding;if(!isObj(f))return null;
  var bad=arr(f.people).map(function(pid){return personById(c,pid)}).filter(function(p){return p&&accById(c,p.payAccount)&&p.payAccount!==id&&passesInto(c,p.payAccount,id)});
  // 2.12.1: equal shares with someone who has no usual pay: their share would leave their account short.
  if(!bad.length&&f.rule==="equal"){var none=fundingPeople(c,id).filter(function(p){return !(num(p.usualPay)>0)&&!(isObj(f.set)&&f.set[p.id])});
    if(none.length&&none.length<fundingPeople(c,id).length){var n0=personName(none[0],c.people.indexOf(none[0]));return n0+" has no usual pay, so an equal share would leave "+(none[0].payAccount===id?"this account":possessive(n0)+" account")+" short. In proportion to usual pay leaves them out."}}
  if(!bad.length)return null;
  // 2.13: everyone it applies to: "Alex's pay already reaches Joint bills through Current account 1, and Sam's through
  // Current account 2, so they'd pay twice."
  var via=function(p){var acc=accById(c,p.payAccount);return " through "+(String(acc.name||"").trim()||"their account")};
  return bad.map(function(p,k){var n=possessive(personName(p,c.people.indexOf(p)));return k?(k===bad.length-1?"and ":"")+n+via(p):n+" pay already reaches "+(String(a.name||"").trim()||"this account")+via(p)}).join(", ")+", so they'd pay twice."}
/* The furthest account p's money reaches while it's still only p's: from their pay account up the chain of what's left,
   stopping before account j, and before an account someone else is paid into (or whose branch they're paid into). */
function ownTop(c,p,j){var x=p.payAccount,g=0,others=arr(c.people).filter(function(q){return q!==p}).map(function(q){return q.payAccount});
  while(g++<200){var up=parentId(c,x);if(!up||up===j)break;var br=[up].concat(descendants(c,up));if(others.some(function(o){return br.indexOf(o)>=0}))break;x=up}
  return x}
/* Split total into shares to the penny by weights w (all 0 or less: equal shares). The rounding (a penny or so either
   way) goes on the largest share, the first of them on a tie, so the shares add up exactly. */
function pennyShares(total,w){var n=w.length;if(!n)return [];var W=w.reduce(function(s,x){return s+Math.max(0,x)},0);
  var out=w.map(function(x){return r2(W>0?total*Math.max(0,x)/W:total/n)}),diff=r2(total-out.reduce(function(s,x){return s+x},0));
  if(diff){var big=0;out.forEach(function(x,i){if(x>out[big])big=i});out[big]=r2(out[big]+diff)}return out}
/* Shares so everyone keeps the same: given what each would keep (L), the level T where the shares max(0, L − T) add up
   to total. Someone who'd keep less than T pays nothing. */
function sameLeftShares(total,L){var n=L.length;if(!n)return [];if(!(total>0))return L.map(function(){return 0});
  var s=L.map(function(v,i){return {v:v,i:i}}).sort(function(a,b){return b.v-a.v}),T=0,sum=0;
  for(var k=0;k<n;k++){sum+=s[k].v;T=(sum-total)/(k+1);if(k===n-1||T>=s[k+1].v)break}
  return pennyShares(total,L.map(function(v){return Math.max(0,v-T)}))}
/* One funded account's contributions this month: {account, rule, need (what the shared part was), set (the total of set
   amounts), people: [{p, from (their pay account), amt, share (of what was paid in), set (true for a set amount),
   stays (true when they're paid into the account itself)}]}. sub = the subtotals so far; cout = what's already been
   paid out of each account as shares and set amounts. */
function fundingShares(c,id,sub,pay,cout){var f=accById(c,id).funding,ppl=fundingPeople(c,id),set=isObj(f.set)?f.set:{},out=(cout&&cout[id])||0;
  var payOf=function(p){return Math.max(0,num(pay[p.id]))},stay=ppl.filter(function(p){return p.payAccount===id});
  // What the account has without the pay of the people paying for it who are paid into it (that pay is theirs to share).
  // 2.12.1: what's gone out of it as their own set amount (money for a partner with no pay) is theirs too, not a cost
  // to share.
  var base=sub[id];stay.forEach(function(p){base-=num(pay[p.id])});if(stay.length)base+=out;
  var setAmt=function(p){var v=set[p.id];if(!v)return f.rule==="set"?0:null;return v.pct!=null?r2(payOf(p)*v.pct/100):r2(v.amount)};
  var fixed=ppl.filter(function(p){return setAmt(p)!=null}),shared=ppl.filter(function(p){return setAmt(p)==null});
  var S=fixed.reduce(function(s,p){return s+setAmt(p)},0),need=r2(Math.max(0,-(base+S)));
  // What each sharer would keep: their own accounts' subtotal so far (their pay account, and on up while the money is only
  // theirs: not the account they're paying into, and nothing anyone else is paid into), or their pay when they're paid
  // into this account.
  var left=function(p){return p.payAccount===id?payOf(p)-(stay.length===1?out:0):sub[ownTop(c,p,id)]};
  var amts=f.rule==="sameLeft"?sameLeftShares(need,shared.map(left))
    :pennyShares(need,shared.map(function(p){return f.rule==="pay"?(num(p.usualPay)>0?num(p.usualPay):payOf(p)):f.rule==="afterOwn"?Math.max(0,left(p)):1}));
  var all=r2(S+need),people=ppl.map(function(p){var fx=fixed.indexOf(p)>=0,v=fx?setAmt(p):amts[shared.indexOf(p)];
    return {p:p,from:p.payAccount,amt:v,share:all>0?v/all:0,set:fx,stays:p.payAccount===id}});
  return {account:id,rule:f.rule,need:need,set:r2(S),people:people}}


/* ---------- pay estimates ----------
   Pay not typed in yet: use the latest earlier month that has it, otherwise the person's usual pay (as it was that
   month: personAt, 2.15, so callers can pass the settings as they are). */
function personById(c,id){for(var i=0;i<c.people.length;i++)if(c.people[i].id===id)return c.people[i];return null}
/* 2.7: ticking a transfer before pay is typed saves the estimate in the pay box, and payEstimated {personId: true} marks
   it. A marked figure is used for that month's transfers but isn't pay that was typed in. Months saved before 2.7 have
   no payEstimated, so every saved figure there counts as typed, as before. */
function payIsTyped(d,pid){return !!(d&&d.pay&&d.pay[pid]!=null&&!(d.payEstimated&&d.payEstimated[pid]))}
/* {v, from}: the estimate for person pid in month k. 2.16: for someone on a pattern that month, pay each time × the
   paydays every month has (planPay's), from: null; for someone paid every month, the months they were on a pattern are
   skipped (their pay box held more than a month's pay, or less). */
function payEstimate(c,months,pid,k){var p=personAt(c,pid,k),t=patternOf(p);if(t)return {v:r2(t.each*PAY_EVERY[t.every].n),from:null};
  var ever=patternsEver(c),keys=Object.keys(months).filter(function(x){return x<k&&validMonth(x)&&payIsTyped(months[x],pid)&&(!ever||!patternOf(personAt(c,pid,x)))}).sort();
  if(keys.length){var last=keys[keys.length-1];return {v:num(months[last].pay[pid]),from:last}}
  return {v:num(p&&p.usualPay),from:null}}
/* ---------- the pay a month plans on (2.16, docs/payperiods.md 5.3.3, E6 and E7) ----------
   One function for every screen: per person in c.people, {kind: "month" or "pattern", arrived, setAside, used, typed, n,
   each, from}. arrived: the pay in the month's box (typed, or the estimate a tick filled in), else the estimate
   (payEstimate: someone on a pattern never gets an earlier month's total, which may have held an extra payday). setAside:
   for someone on a pattern whose pay is typed (payIsTyped), their extra payday's amount unless it's counted; otherwise 0
   (an estimate already leaves the extra out). used = arrived − setAside, never below 0: what the transfers use. typed:
   payIsTyped. n, each: the pattern's (null for monthly pay). from: the month an estimate came from (null: usual pay, or
   pay each time × n); k when the box has pay. live (optional): the month being typed, {pay: {personId: number or null},
   extra: {personId: {amount, counted}}, payEstimated?}, each given part in place of months[k]'s. */
function planPay(c,months,k,live,opts){months=months||{};var d=isObj(months[k])?months[k]:{},out={};
  if(isObj(live)){d=Object.assign({},d);
    if(live.pay!==undefined){var lp={};if(isObj(live.pay))Object.keys(live.pay).forEach(function(pid){if(live.pay[pid]!=null)lp[pid]=live.pay[pid]});d.pay=lp}
    if(live.extra!==undefined)d.extra=live.extra;if(live.payEstimated!==undefined)d.payEstimated=live.payEstimated;
    if(live.paydays!==undefined)d.paydays=live.paydays}
  arr(c&&c.people).forEach(function(p){out[p.id]=planPerson(c,months,d,p.id,k,opts)});return out}
/* One person's entry in planPay; d = the month as planPay reads it.
   2.17 (13.2, L1, L2, L9): when a person on a pattern's paydays are counted that month, their entry also has layer: 2,
   m (the month's paydays: the count frozen in d.paydays, else counted today), dates (today's counted dates, or null when
   they have no date now or today's count isn't the frozen one), expected (each × m) and extraDefault (each × max(0, m − n)),
   for words only. Any other entry is exactly 2.16's, with no new fields (layer 1: no layer). A month with a figure in the box reads only what's stored, exactly as 2.16 did (layer 2 when its count
   was frozen); an empty box with a date plans on each × min(m, n), nothing set aside, so never above each × n and a month
   with fewer paydays plans on what arrives. opts.typical: an empty box plans on each × n whatever the count (averageShort
   and standingOrders: a typical month). */
function planPerson(c,months,d,pid,k,opts){var t=patternOf(personAt(c,pid,k)),has=!!(isObj(d.pay)&&d.pay[pid]!=null),typed=payIsTyped(d,pid);
  var e=has?{v:num(d.pay[pid]),from:k}:payEstimate(c,months,pid,k);
  if(!t)return {kind:"month",arrived:e.v,setAside:0,used:e.v,typed:typed,n:null,each:null,from:e.from};
  var x=isObj(d.extra)?d.extra[pid]:null,aside=typed&&isObj(x)&&x.counted!==true?Math.max(0,num(x.amount)):0,n=PAY_EVERY[t.every].n;
  var o={kind:"pattern",arrived:e.v,setAside:aside,used:aside?Math.max(0,r2(e.v-aside)):e.v,typed:typed,n:n,each:t.each,from:e.from};
  var frozen=isObj(d.paydays)&&typeof d.paydays[pid]==="number"?d.paydays[pid]:null,dates=paydaysFor(c,pid,k);
  if(has?frozen==null:!dates||(opts&&opts.typical))return o;
  var m=frozen!=null?frozen:dates.length;
  o.layer=2;o.m=m;o.dates=dates&&dates.length===m?dates:null;o.expected=r2(t.each*m);o.extraDefault=r2(t.each*Math.max(0,m-n));
  if(!has){o.arrived=o.used=r2(t.each*Math.min(m,n));o.setAside=0}
  return o}
/* Each person's pay for month k: the pay used (planPay), which is what was typed for that month, or the estimate. opts as
   planPay's. */
function payFor(c,months,k,opts){var pl=planPay(c,months,k,undefined,opts),out={};c.people.forEach(function(p){out[p.id]=pl[p.id].used});return out}

/* ---------- the freeze and the extra payday line (2.17, 13.2 L3, L5, L6) ---------- */
/* Person pid's count in month d ("frozen"), or null. */
function frozenPaydays(d,pid){return isObj(d)&&isObj(d.paydays)&&typeof d.paydays[pid]==="number"?d.paydays[pid]:null}
/* The default set aside for person pid in month d (month k): r2(A × (m − n) ÷ m) with the frozen m, A = the typed pay, or
   each × m when a tick filled the box. null when there's no count above n or nothing in the box. */
function extraDefaultFor(c,months,k,pid,d){var t=patternOf(personAt(c,pid,k)),m=frozenPaydays(d,pid);if(!t||m==null)return null;var n=PAY_EVERY[t.every].n;
  if(!(m>n)||!(isObj(d.pay)&&d.pay[pid]!=null))return null;var A=payIsTyped(d,pid)?num(d.pay[pid]):t.each*m;return r2(A*(m-n)/m)}
/* The month whose one-off uses month k's extra payday of person pid ("Use it this month"), or null. */
function extraLock(months,k,pid){var ks=Object.keys(months||{}).sort();for(var i=0;i<ks.length;i++){var d=months[ks[i]];
    if(arr(isObj(d)&&d.oneOffs).some(function(o){return isObj(o)&&o.extraFrom===k&&o.extraOf===pid}))return ks[i]}return null}
/* The month to save, with person pid frozen if they should be and their default following their pay (L3). all = the saved
   months with month k as it will be (for the lock); force: freeze whatever the box held before (L5). Changes body. */
function freezePerson(c,all,k,body,old,pid,force){var t=patternOf(personAt(c,pid,k));if(!t)return;var n=PAY_EVERY[t.every].n,has=isObj(body.pay)&&body.pay[pid]!=null;
  if(has&&(force||!(isObj(old)&&isObj(old.pay)&&old.pay[pid]!=null))&&frozenPaydays(body,pid)==null){var dates=paydaysFor(c,pid,k);
    if(dates){var m=dates.length,had=isObj(body.extra)&&isObj(body.extra[pid]);body.paydays=Object.assign({},body.paydays);body.paydays[pid]=m;
      // L22 (a): a line that's already there (opened from "Had an extra payday?", perhaps typed before the date) is the
      // household's own: it's marked edited and never rewritten. Only a line the freeze opens follows typed pay.
      if(had){if(body.extra[pid].edited!==true){body.extra=Object.assign({},body.extra);body.extra[pid]=Object.assign({},body.extra[pid],{edited:true})}}
      else if(m>n){body.extra=Object.assign({},body.extra);body.extra[pid]={amount:extraDefaultFor(c,all,k,pid,body)}}}}
  var x=isObj(body.extra)?body.extra[pid]:null,def=x&&x.edited!==true?extraDefaultFor(c,all,k,pid,body):null;
  if(def!=null&&x.amount!==def&&!extraLock(all,k,pid)){body.extra=Object.assign({},body.extra);body.extra[pid]=Object.assign({},x,{amount:def})}}
/* 2.17 (L3): month k as it's to be saved (body), given the month as it was saved before (old; {} for a new month). For each
   person on a pattern: when their box goes from empty to a figure (typed or ticked) while they have a date in month k and
   no count is stored, the count is frozen (paydays[id] = m, counted now) and, with m above n and no extra payday line
   yet, the line opens with the default set aside (extra[id] = {amount}). Then, whenever the count is above n and their
   extra payday has no edited and isn't used in a later month (extraLock), its amount is the default for the pay in the
   box. Returns body itself when nothing changes, otherwise a copy with new paydays and extra objects. Ticks, one-offs and
   everything else are left as they are. */
function freezePaydays(c,months,k,body,old){if(!isObj(body))return body;var b=Object.assign({},body),all=Object.assign({},months);all[k]=b;
  arr(c&&c.people).forEach(function(p){freezePerson(c,all,k,b,old||{},p.id,false)});
  return b.paydays===body.paydays&&b.extra===body.extra?body:b}
/* The extra payday line for person pid in month d (month k): null without one; otherwise {opened: "freeze" (the count
   found more paydays than usual, so the line opened by itself: no Remove, "Not an extra payday" instead) or "link" (opened
   from "Had an extra payday?": exactly 2.16's line), lockedIn (the month whose one-off uses it, or null: "Used in …", no
   buttons, the amount read-only), not ("Not an extra payday": a freeze line with edited and £0), counted, m, n}. */
function extraState(c,months,k,pid,d){var x=isObj(d)&&isObj(d.extra)?d.extra[pid]:null;if(!isObj(x))return null;
  var t=patternOf(personAt(c,pid,k)),n=t?PAY_EVERY[t.every].n:null,m=frozenPaydays(d,pid),fr=n!=null&&m!=null&&m>n;
  return {opened:fr?"freeze":"link",lockedIn:extraLock(months,k,pid),not:fr&&x.edited===true&&num(x.amount)===0,counted:x.counted===true,m:m,n:n}}
/* Person pid's interval in month k under settings c: 7, 14, 28, or 0 for paid every month. */
function intervalAt(c,pid,k){var t=patternOf(personAt(c,pid,k));return t?t.every:0}
/* 2.17 (L5): the saved months whose interval for person pid differs between settings before and after (a change of
   interval, dated or not, or "Change earlier months too"), oldest first. */
function intervalChangedMonths(before,after,months,pid){return Object.keys(months||{}).filter(function(k){return validMonth(k)&&isObj(months[k])&&intervalAt(before,pid,k)!==intervalAt(after,pid,k)}).sort()}
/* 2.17 (L5, L22): after a change of interval, the months keys (and only those) frozen again with settings c (before: the
   settings before the change): person pid's count is cleared, and so is an extra payday the count opened (the old count was
   above the old interval's usual paydays) while it's neither edited, counted nor used later; then the month is frozen as if
   its box had just been filled (when pid has a date then and a figure in the box), which marks any line still there as
   the household's own (edited), except a counted line the count opened, which stays the count's and follows typed pay. A month with no count stored for pid isn't touched (the same object). Returns new months
   (others are the same objects). */
function refreezeInterval(c,months,pid,keys,before){var out=Object.assign({},months);arr(keys).forEach(function(k){if(!isObj(months[k]))return;
    // L22: only a month that already had a count is frozen again; one typed without a count (before a date was added, or a
    // household without a date) stays as it is, so a change of interval never gives it a count or an extra.
    var was=frozenPaydays(months[k],pid);if(was==null)return;var b=Object.assign({},months[k]);
    b.paydays=Object.assign({},b.paydays);delete b.paydays[pid];if(!Object.keys(b.paydays).length)delete b.paydays;
    // Only a line the count opened (the old count above the old interval's usual paydays: before, the settings before the
    // change) goes, and only while it's neither edited, counted nor used later; any other line is the household's own.
    var x=isObj(b.extra)?b.extra[pid]:null,t0=patternOf(personAt(before,pid,k)),opened=!!t0&&was>PAY_EVERY[t0.every].n;
    if(opened&&isObj(x)&&x.edited!==true&&x.counted!==true&&!extraLock(out,k,pid)){b.extra=Object.assign({},b.extra);delete b.extra[pid];if(!Object.keys(b.extra).length)delete b.extra}
    // A counted line the count opened stays the count's line (kept, still counted, not marked edited), so it keeps
    // following typed pay: edited means the household's own amount.
    var follow=opened&&isObj(x)&&x.edited!==true&&x.counted===true;
    out[k]=b;freezePerson(c,out,k,b,{},pid,true);
    if(follow&&isObj(b.extra)&&isObj(b.extra[pid])){b.extra=Object.assign({},b.extra);b.extra[pid]=Object.assign({},b.extra[pid]);delete b.extra[pid].edited;freezePerson(c,out,k,b,b,pid,false)}});
  return out}
/* 2.17 (L6): "Use it this month" in month k for person pid: offered when month k has fewer paydays than usual (frozen, or
   counted while the box is empty), month k − 1 has their pay typed with an extra payday set aside (stored, above £0, not
   counted), and no one-off anywhere uses it yet. Returns the one-off to add (the page gives it an id) or null: {kind: "in",
   name: "Sam's extra payday from April", amount, account (their pay account in month k), extraFrom: k − 1, extraOf: pid}.
   It doesn't freeze month k. */
function useExtraOffer(c,months,k,pid){months=months||{};var t=patternOf(personAt(c,pid,k));if(!t)return null;var d=isObj(months[k])?months[k]:{},m=frozenPaydays(d,pid);
  if(m==null){if(isObj(d.pay)&&d.pay[pid]!=null)return null;var dates=paydaysFor(c,pid,k);if(!dates)return null;m=dates.length}
  if(!(m<PAY_EVERY[t.every].n))return null;var prev=shiftMonth(k,-1),pd=months[prev],x=isObj(pd)&&isObj(pd.extra)?pd.extra[pid]:null;
  if(!payIsTyped(pd,pid)||!isObj(x)||x.counted===true||!(num(x.amount)>0)||extraLock(months,prev,pid))return null;
  var mc=cfgFor(c,k,monthOneOffs(months,k)),me=personById(mc,pid),i=arr(c.people).indexOf(personById(c,pid));
  return {kind:"in",name:possessive(personName(personById(c,pid),i))+" extra payday from "+MN[mNum(prev)-1],amount:r2(num(x.amount)),account:me&&me.payAccount,extraFrom:prev,extraOf:pid}}
function monthOneOffs(months,k){return arr(months[k]&&months[k].oneOffs)}
/* A saved month's transfers: with the arrangement in use that month (cfgFor, 2.12), its pay (typed or estimated, unless
   pay is given) and its one-offs. */
function calcMonth(c,months,k,pay){var ones=monthOneOffs(months,k);return calc(cfgFor(c,k,ones),mNum(k),pay||payFor(c,months,k),ones)}

/* ---------- standing orders from each pay (2.16, docs/payperiods.md 5.3.6, E11 and E15) ----------
   For each person on a pattern in month k: {orders: [{step, kind, to, name, amount, word}], moveTo}. An order covers a
   share or set amount (c:), a top-up (t:, kind topup) or a savings transfer (s:) out of an account only that person is
   paid into (month k's arrangement). amount: the largest that step has over months k to k+11 (matched by its id; each
   month through calcMonth, so planPay and the month's cfgFor) ÷ n, rounded up to the penny, so n of them before every
   transfer day cover every month. Weekly and every two weeks: always; every four weeks: only when the step's amount
   varies over the 12 months (a month without it counts as £0), since otherwise the month's transfer is the figure. Never
   a move of what's left: its size follows pay. to: the account it goes to (null for a savings transfer); name: that
   account's name, or the savings transfer's; word: PAY_EVERY's. moveTo: when that account has no such step in the 12
   months and moves what's left on, the account it moves to (Settings › People says why there's no figure); else null. */
function standingOrders(c,months,k){months=months||{};var out={},mc=cfgFor(c,k,monthOneOffs(months,k)),who=[];
  arr(c&&c.people).forEach(function(p){var t=patternOf(personAt(c,p.id,k));if(t)who.push({id:p.id,t:t})});if(!who.length)return out;
  // 2.17 (L9): on a typical month (planPay's typical: each × n for a month not typed), so a holiday's gap month doesn't
  // move the figure, and a household's standing orders are the same with or without a payday date.
  var runs=[];for(var i=0;i<12;i++){var x=shiftMonth(k,i);runs.push({r:calcMonth(c,months,x,payFor(c,months,x,{typical:true})),mc:cfgFor(c,x,monthOneOffs(months,x))})}
  var isOrder=function(s){return s.kind==="topup"||s.kind==="save"||s.kind==="contribute"&&/^c:/.test(s.id)};
  who.forEach(function(q){var o={orders:[],moveTo:null},me=personById(mc,q.id),acct=me&&me.payAccount,info=PAY_EVERY[q.t.every];out[q.id]=o;
    if(!acct||!accById(mc,acct)||mc.people.filter(function(p){return p.payAccount===acct}).length!==1)return;
    var most={},vals={},list=[];
    runs.forEach(function(run,i){run.r.steps.forEach(function(s){if(s.from!==acct||!isOrder(s))return;var v=r2(s.amt);
      if(most[s.id]==null){most[s.id]=v;vals[s.id]=[];var a=s.to&&accById(run.mc,s.to);
        list.push({step:s.id,kind:s.kind,to:s.kind==="save"?null:s.to,name:s.kind==="save"?(s.toText||"Savings"):((a&&String(a.name||"").trim())||"Unnamed account")})}
      else most[s.id]=Math.max(most[s.id],v);vals[s.id][i]=(vals[s.id][i]||0)+v})});
    if(!list.length){o.moveTo=parentId(mc,acct);return}
    var varies=function(id){var v=vals[id];for(var i=1;i<12;i++)if(Math.abs((v[i]||0)-(v[0]||0))>0.004)return true;return false};
    o.orders=list.filter(function(x){return info.n>1||varies(x.step)}).map(function(x){x.amount=r2(Math.ceil(Math.round(most[x.step]*100)/info.n-1e-9)/100);x.word=info.word;return x})});
  return out}
/* The standing-order notice on the Pay tab for person pid in month k (E11), worked out and never stored: {kind: "first",
   orders} in their first month on a pattern (personAt at k − 1 had none, or paid at a different interval) or when the
   household has no month saved before k (hasHistory); {kind: "up", step, to, name, amount, was, word, ups} when an order's
   figure for k is higher than the same step's figure for k − 1 (ups: every order that went up, the first given); else
   null (and always null without orders). */
function standingOrdersNotice(c,months,k,pid){months=months||{};var now=standingOrders(c,months,k)[pid];if(!now||!now.orders.length)return null;
  var t=patternOf(personAt(c,pid,k)),prev=shiftMonth(k,-1),b=patternOf(personAt(c,pid,prev));
  if(!b||b.every!==t.every||!hasHistory(months,k))return {kind:"first",orders:now.orders};
  var was=standingOrders(c,months,prev)[pid],by={};arr(was&&was.orders).forEach(function(x){by[x.step]=x.amount});
  var ups=now.orders.filter(function(x){return by[x.step]!=null&&x.amount>by[x.step]+0.004}).map(function(x){return Object.assign({was:by[x.step]},x)});if(!ups.length)return null;
  var u=ups[0];return {kind:"up",step:u.step,to:u.to,name:u.name,amount:u.amount,was:u.was,word:u.word,ups:ups}}

/* ---------- short (2.13: one meaning everywhere) ----------
   A month is short when any account that keeps what's left ends it below zero. r.floats already leaves out a boarder's
   own account, and holds any account a top-up couldn't fully reach (short: true). The Pay tab, setup's preview,
   Analysis and the exports all use this rule. The household total (r.flt) stays the headline figure but never decides
   "short" on its own: one account short can hide behind another with plenty. */
/* The short accounts, in floats order: [{id, amount (the shortfall, more than 0), topup (true when it's an account a
   top-up couldn't fully reach)}]. */
function shortAccounts(r){return arr(r&&r.floats).filter(function(f){return r2(f.amt)<0}).map(function(f){var o={id:f.id,amount:-r2(f.amt)};if(f.short)o.topup=true;return o})}
function isShort(r){return shortAccounts(r).length>0}
/* Whether a shortfall is named by account: when more than one account keeps what's left. With one, the total is that
   account's, so "short by" the total says it all (as before 2.13). */
function shortNamed(r){return arr(r&&r.floats).length>1}
/* "Sam's account short by £100.00 and Joint bills short by £50.00". f formats the amounts (default £). */
function shortWords(c,list,f){f=f||fmt;return listAnd(arr(list).map(function(s){var a=accById(c,s.id);return ((a&&String(a.name||"").trim())||"Unnamed account")+" short by "+f(s.amount)}))}
/* What each person keeps (2.12; moved from the page in 2.13 so Analysis can use it): when the accounts that keep what's
   left include people's own (one person paid into each), [{p, amt}] in floats order. c = the settings for the month
   (cfgFor). Empty with one person. */
function personKeeps(c,r){if(arr(c&&c.people).length<2)return [];var out=[];
  arr(r&&r.floats).forEach(function(f){var mine=c.people.filter(function(p){return p.payAccount===f.id});if(mine.length===1)out.push({p:mine[0],amt:f.amt})});return out}

/* ---------- bill categories ----------
   Optional, for the Analysis tab. A category the app suggested from the bill's name has categoryAuto: true and is
   re-suggested when the name changes; one the user chose is never overridden. Rules are checked in order and use
   generic words only. */
var CATEGORIES=[["housing","Housing"],["utilities","Utilities"],["insurance","Insurance"],["transport","Transport"],["children","Children"],
  ["health","Health"],["subscriptions","Subscriptions"],["memberships","Memberships"],["debt","Debt"],["savings","Savings"],["other","Other"]];
var CATEGORY_RULES=[
  ["insurance",/insur|\bins\b|assurance|\bcover\b|\blife\b|warranty|breakdown/],
  ["debt",/\bloan|credit card|store card|\bcc\b|finance|overdraft|repayment/],
  ["housing",/mortgage|\brent\b|ground rent|service charge|letting|landlord|housing/],
  ["utilities",/water|energy|\bgas\b|electric|council tax|broadband|internet|fibre|landline|mobile|phone|\bsim\b/],
  ["children",/child|\bkids?\b|nursery|school|tuition|pocket money|uniform|\bbaby\b/],
  ["health",/health|dental|dentist|optician|prescription|pharmacy|physio|medical|\bdoctor/],
  ["subscriptions",/netflix|spotify|disney|\bprime\b|music|tv licen[cs]e|streaming|subscription|magazine|newspaper|\bapps?\b|cloud|storage/],
  ["memberships",/\bgym\b|leisure|\bclub\b|membership|\bunion\b/],
  ["transport",/dvla|\bcar\b|\bmot\b|fuel|petrol|diesel|parking|\btrain|\bbus\b|\brail|travel|road tax|vehicle|\btaxi/]];
function categoryName(k){for(var i=0;i<CATEGORIES.length;i++)if(CATEGORIES[i][0]===k)return CATEGORIES[i][1];return "Not categorised"}
function suggestCategory(b){if(b.savings)return "savings";var n=String(b.name||"").toLowerCase();
  for(var i=0;i<CATEGORY_RULES.length;i++)if(CATEGORY_RULES[i][1].test(n))return CATEGORY_RULES[i][0];
  if(/mortgage/i.test(String(b.note||"")))return "housing";
  return ""}
/* Apply the suggestion unless the user chose a category themselves (choosing "Not categorised" is stored as "" and
   counts as a choice). Returns true if anything changed. */
function applyCategorySuggestion(b){if(b.category!=null&&!b.categoryAuto)return false;var s=suggestCategory(b),was=(b.category||"")+"|"+!!b.categoryAuto;
  if(s){b.category=s;b.categoryAuto=true}else{delete b.category;delete b.categoryAuto}
  return was!==(b.category||"")+"|"+!!b.categoryAuto}
/* The user picked a category (or "" for none). Savings and the "this is savings" flag are the same thing.
   since: the budget month it happened, so savings are only counted from then. */
function setCategory(b,k,since){b.category=k||"";delete b.categoryAuto;
  if(k==="savings"){if(!b.savings&&since)b.savingsSince=since;b.savings=true}else if(b.savings){delete b.savings;delete b.savingsSince}}
function setSavingsFlag(b,on,since){if(on){if(!b.savings&&since)b.savingsSince=since;b.savings=true;b.category="savings";delete b.categoryAuto}
  else{delete b.savings;delete b.savingsSince;if(b.category==="savings"){delete b.category;delete b.categoryAuto}applyCategorySuggestion(b)}}
/* "Remind me" for a bill when its renewal date is first set (2.7): a week before for a monthly subscription or
   membership, which renews every month and costs little, otherwise a month before. A stored lead is never changed. */
function defaultLead(b){var k=b.category!=null?b.category:suggestCategory(b);return (k==="subscriptions"||k==="memberships")&&perYear(b)===12?7:30}
/* What a bill costs over a year, and per month on average. */
function annualCost(b){return num(b.amount)*perYear(b)}
function monthlyEquivalent(b){return annualCost(b)/12}

/* ---------- UK tax years (6 April to 5 April) ----------
   With a payday set, a budget month belongs to the tax year of the payday that funds it. */
function tyObj(s){return {start:s,key:s+"-"+pad((s+1)%100),label:s+"–"+pad((s+1)%100),first:s+"-04",last:(s+1)+"-03",from:s+"-04-06",to:(s+1)+"-04-05"}}
function tyOfDate(d){var p=d.split("-").map(Number);return tyObj((p[1]>4||(p[1]===4&&p[2]>=6))?p[0]:p[0]-1)}
function taxYear(pc,k){var pd=paydayFor(pc,k);if(pd)return tyOfDate(pd);var p=k.split("-").map(Number);return tyObj(p[1]>=4?p[0]:p[0]-1)}
function inTaxYear(pc,k,ty){var pd=paydayFor(pc,k);if(pd)return pd>=ty.from&&pd<=ty.to;return k>=ty.first&&k<=ty.last}

/* ---------- first-run setup (2.6) ---------- */
/* Account colours, in the order new accounts get them (changeable in Settings › Accounts). */
var COLOURS=[["blue","Blue"],["red","Red"],["purple","Purple"],["orange","Orange"],["teal","Teal"],["green","Green"],["pink","Pink"],["gold","Gold"],["grey","Grey"]];
/* A person's name, or "Person 2" when it's empty. */
function personName(p,i){return String((p&&p.name)||"").trim()||"Person "+(i+1)}
function possessive(n){return n+"'s"}
/* "A", "A and B", "A, B and C" */
function listAnd(a){a=arr(a);return a.length<2?(a[0]||""):a.slice(0,-1).join(", ")+" and "+a[a.length-1]}
/* The four starting points in setup's accounts step: accounts in flow order (where pay arrives first, the one that keeps
   what's left last) and the account each person is paid into. kind: "joint" (one account everyone is paid into), "own"
   (everyone's own account, then a joint account that keeps what's left), "split" (own accounts, then joint bills, then
   joint spending) and "other" (one account to build on). For one person: one account; a bills account then a spending
   account; a pay account, then bills, then spending. Colours are given in order from COLOURS. Each account also has a
   role that stays the same when the starting point is filled in again ("own:" and the person's id, "joint", "main",
   "pay", "bills", "spending"), so setup can keep an account (and what was typed for it) when the people change. */
var SETUP_SHAPES=["joint","own","split","other"];
/* 2.12, households that don't pool everything (the setup questions): "contribute" (own accounts that keep what's left,
   and a joint account, or joint bills then joint spending, that everyone pays into under opts.rule), "housekeeping"
   (own accounts; opts.payer pays the bills from theirs and the others pay them a share) and "separate" (own accounts,
   no joint account). opts (all optional): rule (a FUNDING_RULES name; "set" uses opts.set {personId: amount}), two (two
   joint accounts), payer (a person id), noPay [personId…] (no pay of their own: left out of shared costs), gets
   {personId: amount} (a set amount into that person's account from the first person with pay; not when pooling), board
   {personId: amount} (with three or more people: that person keeps their own account and pays a set amount into the
   household's main account). Funding goes on the accounts as calc reads it. */
var SETUP_STYLES=["pool","contribute","housekeeping","separate","other"];
function setupShape(kind,people,opts){people=arr(people);opts=opts||{};var acc=[],pay={},board=isObj(opts.board)?opts.board:{};
  var boarders=people.filter(function(p,i){return i>0&&board[p.id]!=null&&!(kind==="housekeeping"&&p.id===opts.payer)}),inP=people.filter(function(p){return boarders.indexOf(p)<0}),solo=inP.length<2;
  var noPay=arr(opts.noPay),ix=function(p){return people.indexOf(p)};
  function add(name,role){var id=uid("a");while(acc.some(function(x){return x.id===id}))id=uid("a");
    var a={id:id,name:name,colour:COLOURS[acc.length%COLOURS.length][0],leftoverTo:null,role:role};acc.push(a);return a}
  function chain(list){for(var i=0;i<list.length-1;i++)list[i].leftoverTo=list[i+1].id}
  function everyone(a){inP.forEach(function(p){pay[p.id]=a.id})}
  function owns(list){return list.map(function(p){var a=add(possessive(personName(p,ix(p)))+" account","own:"+p.id);pay[p.id]=a.id;return a})}
  // Who shares the costs under the rule: everyone in the shared money with pay of their own.
  var sharers=inP.filter(function(p){return noPay.indexOf(p.id)<0});if(!sharers.length)sharers=inP.slice(0,1);
  function fund(a,rule){var f={people:sharers.map(function(p){return p.id}),rule:rule};
    if(rule==="set"){var set={};sharers.forEach(function(p){var v=num(isObj(opts.set)?opts.set[p.id]:0);set[p.id]={amount:Math.max(0,r2(v))}});f.set=set}
    a.funding=f}
  var rule=FUNDING_RULES.indexOf(opts.rule)>=0?opts.rule:"equal",main;
  if(kind==="contribute"){owns(inP);var j=(opts.two?[["Joint bills","bills"],["Joint spending","spending"]]:[["Joint account","joint"]]).map(function(n){return add(n[0],n[1])});chain(j);
    fund(j[0],rule);if(j[1]&&rule!=="set")fund(j[1],rule);main=j[0]}
  else if(kind==="housekeeping"){var own2=owns(inP),pi=Math.max(0,inP.map(function(p){return p.id}).indexOf(opts.payer));main=own2[pi];
    // The bill payer pays their share by leaving it in their account. With set amounts, a set amount for them would change
    // nothing (2.12.1): they have none, and pay what the account still needs.
    if(sharers.indexOf(inP[pi])<0)sharers.unshift(inP[pi]);fund(main,rule);if(rule==="set"&&main.funding.set){delete main.funding.set[inP[pi].id];if(!Object.keys(main.funding.set).length)delete main.funding.set}}
  else if(kind==="separate"){owns(inP);main=null}
  else if(kind==="own"||kind==="split"){
    if(solo){var one=(kind==="split"?[["Pay account","pay"]]:[]).concat([["Bills account","bills"],["Spending account","spending"]]).map(function(n){return add(n[0],n[1])});chain(one);everyone(one[0]);main=one[one.length-2]}
    else{var own=owns(inP);
      var joint=(kind==="own"?[["Joint account","joint"]]:[["Joint bills","bills"],["Joint spending","spending"]]).map(function(n){return add(n[0],n[1])});chain(joint);
      own.forEach(function(a){a.leftoverTo=joint[0].id});main=joint[0]}}
  else{main=solo?add("Current account","main"):add("Joint account","joint");everyone(main)}
  // A set amount into the account of someone with no pay (not when pooling: they share everything).
  var earner=inP.filter(function(p){return noPay.indexOf(p.id)<0})[0];
  if(earner&&isObj(opts.gets)&&["contribute","housekeeping","separate"].indexOf(kind)>=0)inP.forEach(function(p){var v=r2(num(opts.gets[p.id]));
    if(p===earner||noPay.indexOf(p.id)<0||!(v>0))return;var a=accById({accounts:acc},pay[p.id]);if(a&&!a.funding)a.funding={people:[earner.id],rule:"set",set:(function(){var s={};s[earner.id]={amount:v};return s})()}});
  // Board: an own account each, and a set amount into the household's main account.
  if(boarders.length){owns(boarders);if(main){var f=main.funding||{people:[],rule:"set"};f.set=f.set||{};
    boarders.forEach(function(p){f.people.push(p.id);f.set[p.id]={amount:Math.max(0,r2(num(board[p.id])))}});main.funding=f}}
  return {accounts:acc,payAccount:pay}}
/* The account everyone is paid into, when it passes what's left on: one person's "bills account, then a spending
   account", say. Its bills are paid from it. null when people are paid into different accounts, or it keeps what's left. */
function sharedPayAccount(c){var people=arr(c.people),id=people.length?people[0].payAccount:null;
  return id&&accById(c,id)&&parentId(c,id)&&people.every(function(p){return p.payAccount===id})?id:null}
/* The account most bills come from by default (Settings › Bills › Quick add, and setup): one nobody is paid into that
   sends what's left on; otherwise the account everyone is paid into, if it sends what's left on; otherwise the first
   one nobody is paid into, else the first. "" with no accounts. */
function defaultBillAccount(c){var paid=arr(c.people).map(function(p){return p.payAccount}),acc=arr(c.accounts).filter(function(a){return !a.closedFrom});
  if(acc.length<arr(c.accounts).length)c=Object.assign({},c,{accounts:acc});
  // 2.12: an account people pay their shares into (a joint account, or the bill payer's own) comes first.
  var shared=sharedFundedAccount(c);if(shared)return shared;
  var a=acc.filter(function(x){return paid.indexOf(x.id)<0&&parentId(c,x.id)})[0];if(a)return a.id;
  var s=sharedPayAccount(c);if(s)return s;
  a=acc.filter(function(x){return paid.indexOf(x.id)<0})[0]||acc[0];return a?a.id:""}
/* 2.12: the account people pay their shares into, first in flow order: one more than one person pays for, or one
   someone pays for that nobody is paid into (a joint account). Not someone's own account that only gets money from
   another (a partner with no pay). null when there's none. */
function sharedFundedAccount(c){var paid=arr(c.people).map(function(p){return p.payAccount});
  return flowOrder(c).filter(function(id){var a=accById(c,id),f=a.funding;return !a.closedFrom&&isObj(f)&&(arr(f.people).length>1||paid.indexOf(id)<0)})[0]||null}
/* 2.12.1: where shared spending and savings go by default (setup's budgets and savings): the account that keeps what's
   left after the account people pay their shares into (a joint account, joint spending, or the bill payer's own);
   otherwise one that keeps what's left and isn't one person's own; otherwise the bill payer's account (someone pays
   their share by leaving it there); otherwise the first that keeps what's left. Never a boarder's own account while
   there's another. null with no accounts. */
function sharedSpendAccount(c){var ppl=arr(c.people),f=sharedFundedAccount(c),g=0;
  if(f){while(parentId(c,f)&&g++<200)f=parentId(c,f);return f}
  var roots=rootIds(c).filter(function(id){return !accById(c,id).closedFrom}),own=function(id){return ppl.length>1&&ppl.filter(function(p){return p.payAccount===id}).length===1};
  var x=roots.filter(function(id){return !own(id)})[0]||roots.filter(function(id){var a=accById(c,id);return isObj(a.funding)&&arr(a.funding.people).some(function(pid){var p=personById(c,pid);return p&&p.payAccount===id})})[0];
  if(x)return x;var out=boarderAccounts(c);return roots.filter(function(id){return !out[id]})[0]||roots[0]||(arr(c.accounts)[0]||{}).id||null}
/* 2.12.1: where other income (Child Benefit, say) goes by default in setup: the account people pay their shares into,
   so it lowers what they pay; otherwise where shared spending goes. */
function sharedInAccount(c){return sharedFundedAccount(c)||sharedSpendAccount(c)}
/* One or two plain sentences per account, in flow order, for the setup diagram (and screen readers):
   "Alex's pay arrives in Alex's account. What's left moves to Joint bills." */
function flowStory(c){var nm=function(id){var a=accById(c,id);return (a&&String(a.name||"").trim())||"Unnamed account"};
  var ppl=arr(c.people),pn=function(p){return personName(p,ppl.indexOf(p))},roots=rootIds(c).length;
  // 2.12: who pays into which account (contributions), worked out once.
  var paysInto={};arr(c.accounts).forEach(function(a){fundingPeople(c,a.id).forEach(function(p){if(p.payAccount!==a.id)(paysInto[p.payAccount]=paysInto[p.payAccount]||[]).push({p:p,to:a.id,set:fundingIsSet(a.funding,p.id)})})});
  return flowOrder(c).map(function(id){var name=nm(id),par=parentId(c,id),t=[],a=accById(c,id);
    var arrives=ppl.map(function(p,i){return p.payAccount===id?possessive(personName(p,i))+" pay":null}).filter(Boolean)
      .concat(arr(c.income).filter(function(x){return x.account===id}).map(function(x){return String(x.name||"").trim()||"Other income"}));
    var from=c.accounts.filter(function(a){return parentId(c,a.id)===id}).map(function(a){return nm(a.id)});
    var funders=fundingPeople(c,id),shares=funders.filter(function(p){return p.payAccount!==id}).map(function(p){return possessive(pn(p))+setWord(a.funding,p)});
    if(arrives.length)t.push(listAnd(arrives)+(arrives.length>1?" arrive":" arrives")+" in "+name+".");
    if(funders.length)t.push(fundingWords(a.funding,funders,arrives.length?"it":name,id));
    if(from.length)t.push((arrives.length||funders.length?"It also gets":name+" gets")+" what's left from "+listAnd(from)+".");
    if(!arrives.length&&!from.length&&!funders.length)t.push("Nothing arrives in "+name+" yet.");
    var out=paysInto[id]||[];out.forEach(function(x){t.push("It pays "+possessive(pn(x.p))+(x.set&&x.p.boarder?" board":x.set?" set amount":" share")+" into "+nm(x.to)+".")});
    // An account that keeps what's left and is one person's own, in a household with several such accounts: theirs.
    var mine=ppl.length>1&&roots>1&&!par?ppl.filter(function(p){return p.payAccount===id}):[];
    var keep=mine.length===1?possessive(pn(mine[0]))+" left over":"your left over";
    t.push(par?"What's left moves to "+nm(par)+".":"It keeps what's left: "+keep+".");
    return {id:id,arrives:arrives,from:from,to:par,shares:shares,paysInto:out.map(function(x){return x.to}),keep:par?null:keep,text:t.join(" ")}})}
/* Whether a person pays a set amount (or a percentage) under a funding entry, rather than a share by its rule. */
function fundingIsSet(f,pid){return isObj(f)&&(f.rule==="set"||!!(isObj(f.set)&&f.set[pid]))}
/* 2.13: what someone pays into an account, after their name: " board" (someone paying board, as setup and Settings ›
   People call it), " set amount" or " share". */
function setWord(f,p){return !fundingIsSet(f,p.id)?" share":p.boarder?" board":" set amount"}
/* 2.13: what a contribution is, under its transfer: "Alex's share (half each)", "Alex's share (58%)", "Kit's board" or
   "Alex's set amount". A share's percentage is of what the people sharing by the rule pay between them (set amounts and
   board left out, so equal shares beside a boarder read as equal), and the equal rule says so in words. r = calc's
   result for the month; s = one of its "contribute" steps. */
function contribWords(c,r,s){var p=personById(c,s.person),n=p&&String(p.name||"").trim(),who=n?possessive(n):"Their";
  if(s.set)return who+(p&&p.boarder?" board":" set amount");
  var d=shareSplit(r,s);return d==="equal"?who+" equal share":who+" share ("+d+")"}
/* 2.13: how a share (not a set amount) is split, for contribWords, the Share message and the exports: "half each",
   "equal" (three or more by the equal rule) or a percentage such as "58%", worked out as contribWords says. */
function shareSplit(r,s){var x=arr(r&&r.contribs).filter(function(y){return y.account===s.to})[0],sh=x?x.people.filter(function(q){return !q.set}):[];
  if(x&&x.rule==="equal")return sh.length===2?"half each":"equal";
  var tot=sh.reduce(function(t,q){return t+q.amt},0),me=sh.filter(function(q){return q.p.id===s.person})[0];
  return Math.round((tot>0&&me?me.amt/tot:s.share)*100)+"%"}
/* How a funding rule reads: "half each", "in proportion to pay"… n = how many share by it. */
function ruleWords(rule,n){return rule==="equal"?(n===2?"half each":"in equal shares"):rule==="pay"?"in proportion to pay":rule==="afterOwn"?"in proportion to what's left after their own bills":rule==="sameLeft"?"so they each keep the same":"set amounts"}
/* "Alex and Sam share its costs, half each. Kit pays a set amount into it." for the setup diagram and Settings. In
   setup, f.open (2.13) means the split hasn't been chosen yet, so no rule is named. */
function fundingWords(f,funders,it,id){var names=function(l){return listAnd(l.map(function(p){return String(p.name||"").trim()||"Someone"}))};
  // 2.12.1: under set amounts, someone paid into the account with no amount of their own (the bill payer) pays what it needs.
  var fixed=funders.filter(function(p){return fundingIsSet(f,p.id)&&!(id&&p.payAccount===id&&!(isObj(f.set)&&f.set[p.id]))}),shared=funders.filter(function(p){return fixed.indexOf(p)<0}),t=[];
  if(shared.length)t.push(shared.length>1?names(shared)+" share "+(it==="it"?"its costs":"the costs of "+it)+(f.open?"":", "+ruleWords(f.rule,shared.length))+".":names(shared)+" pays what "+it+" needs.");
  // 2.13: someone paying board pays board, not "a set amount".
  var board=fixed.filter(function(p){return p.boarder}),set=fixed.filter(function(p){return !p.boarder});
  if(set.length)t.push(names(set)+(set.length>1?" each pay":" pays")+" a set amount into "+it+".");
  if(board.length)t.push(names(board)+(board.length>1?" each pay":" pays")+" board into "+it+".");
  return t.join(" ")}
/* 2.13: the worked example under setup's diagram (moved here from setup so it can be tested). c = setup's household so
   far: accounts (with funding) and people (name, payAccount, and usualPay = the pay typed in setup); bills =
   {accountId: this month's bills typed for it}. An account several people pay into: their shares of its bills (of
   £1,000 when none are typed yet). Otherwise the first account pay moves on from: what moves on (in words when no bills
   are typed for it, rather than an invented figure). Otherwise where pay arrives, what that account pays out (a set
   amount, a share, or what an account only they pay for needs), and that what's left stays there. "" for nothing. */
function setupExample(c,bills){bills=bills||{};var order=flowOrder(c),ppl=arr(c.people),nm=function(id){return String((accById(c,id)||{}).name||"").trim()||"Unnamed account"};
  var pn=function(p){return personName(p,ppl.indexOf(p))},whose=function(l){return listAnd(l.map(function(p){return possessive(pn(p))}))+" pay"},arrive=function(l){return l.length>1?" arrive":" arrives"};
  var shared=order.filter(function(id){return fundingPeople(c,id).length>1})[0];if(shared)return shareExample(c,shared,num(bills[shared]));
  var paid=function(id){return ppl.filter(function(p){return p.payAccount===id})},withPar=order.filter(function(id){return parentId(c,id)});
  var pick=withPar.filter(function(id){return paid(id).length})[0]||withPar[0];
  if(pick){var got=num(bills[pick]),mine=paid(pick),pay=mine.reduce(function(t,p){return t+num(p.usualPay)},0),to=nm(parentId(c,pick));
    if(!(got>0))return "For example: "+(mine.length?whose(mine)+arrive(mine)+" in "+nm(pick)+", and what's left after its bills moves to "+to+".":"what's left in "+nm(pick)+" after its bills moves to "+to+".");
    return "For example: if "+nm(pick)+" has "+fmt(got)+" of bills, "+(mine.length?"the rest of "+whose(mine)+(pay>got?", "+fmt(pay-got)+",":""):"the rest")+" moves to "+to+"."}
  var r=order[0],mine=paid(r||"");if(!mine.length)return "";
  var outs=[];arr(c.accounts).forEach(function(a){if(a.id===r)return;var f=a.funding,fp=fundingPeople(c,a.id);fp.forEach(function(p){if(p.payAccount!==r)return;var v=isObj(f.set)?f.set[p.id]:null;
    if(fundingIsSet(f,p.id))outs.push("sends "+(v&&v.pct!=null?v.pct+"% of "+possessive(pn(p))+" pay":v&&v.amount>0?fmt(v.amount):possessive(pn(p))+(p.boarder?" board":" set amount"))+" to "+nm(a.id));
    else outs.push(fp.length>1?"sends "+possessive(pn(p))+" share to "+nm(a.id):"covers what "+nm(a.id)+" needs")})});
  return "For example: "+whose(mine)+arrive(mine)+" in "+nm(r)+". "+(outs.length?"Its own bills come out of it, it "+listAnd(outs)+", and what's left stays there.":"Bills and spending come out of it, and what's left stays there.")}
/* "For example: if Joint account has £1,000.00 of bills, Alex's share is £600.00 and Sam's is £400.00." Nothing for set
   amounts (they're typed right there), for a split not chosen yet (f.open), or for a rule that goes by pay when there's
   no pay to go by. */
function shareExample(c,id,got){var a=accById(c,id),f=a.funding;if(f.rule==="set"||f.open)return "";
  var pay={},any=false;arr(c.people).forEach(function(p){pay[p.id]=num(p.usualPay);if(pay[p.id]>0)any=true});if(!any&&f.rule!=="equal")return "";
  var bills=got>0?got:1000,x={people:c.people.map(function(p){return {id:p.id,name:p.name,payAccount:p.payAccount,usualPay:num(p.usualPay),boarder:p.boarder}}),
    accounts:c.accounts.map(function(b){return b.id===id?b:{id:b.id,name:b.name,leftoverTo:b.leftoverTo}}),bills:[{id:"x",amount:bills,account:id,months:[]}],income:[],budgets:[],savings:[]};
  var q=calc(x,1,pay,[]).contribs.filter(function(y){return y.account===id})[0];if(!q)return "";
  var parts=q.people.filter(function(y){return !y.set}).map(function(y,i){return possessive(y.p.name)+(i?" is ":" share is ")+fmt(y.amt)});
  return parts.length?"For example: if "+(a.name||"")+" has "+fmt(bills)+" of bills, "+listAnd(parts)+".":""}
/* A bill's months from setup's "How often": "monthly" → [] (every month); "yearly" in month M → [M]; "some" → the picked
   months, sorted ([] when all 12 are picked). null when it can't be saved: once a year with no month, or no months picked. */
function billMonths(freq,month,picked){
  if(freq==="yearly"){var m=Number(month);return m>=1&&m<=12&&Math.floor(m)===m?[m]:null}
  if(freq==="some"){var s=[];arr(picked).forEach(function(x){x=Number(x);if(x>=1&&x<=12&&Math.floor(x)===x&&s.indexOf(x)<0)s.push(x)});
    return !s.length?null:s.length>=12?[]:s.sort(function(a,b){return a-b})}
  return []}
/* Check quick-list rows (Settings › Quick add, and setup's bills, budgets and savings): each needs a name and an amount
   over zero, or both empty to be ignored; a row with r.freq (setup's bills) also needs its months (billMonths).
   Returns {items, errors}: items are the rows that can be saved, as {r, name, amount, months}; errors [{i, f}]. */
function readRows(rows){var items=[],errors=[];
  rows.forEach(function(r,i){var name=String(r.name||"").trim(),a=parseMoney(r.amount,false);if(!name&&a.empty)return;var ok=true;
    if(!name){errors.push({i:i,f:"name"});ok=false}if(a.empty||a.invalid||!(a.value>0)){errors.push({i:i,f:"amount"});ok=false}
    var months=r.freq?billMonths(r.freq,r.month,r.picked):[];if(months===null){errors.push({i:i,f:"months"});ok=false}
    if(ok)items.push({r:r,name:name,amount:a.value,months:months})});
  return {items:items,errors:errors}}
/* ---------- Setup's answers into settings (2.13) ----------
   s is setup's state as the screens leave it (ui.js startSetup): people [{id, name, pay (as typed), payAccount, every
   (2.16, optional: 7, 14 or 28 for pay that comes every so many days, when pay is pay each time)}], income
   rows [{id, name, amount, account}], payday {day, weekend}, skip {3, 5, 6: that step skipped}, shape (the setupShape
   kind the accounts were filled in from), style, pool, ans (the answers to the money questions: fun, funAmt, rule, set,
   two, payer, gets, getsAmt, board, boardAmt, by person id), accounts [{id, name, colour, leftoverTo, role, funding}],
   bills {accountId: rows [{name, amount, freq, month, picked}]}, figures (2.14, optional) {accountId: a rough figure for
   its bills, as typed}, and budgets and savings rows [{name, amount, account}].
   The screens and the household simulation both read the answers through these, so what the simulation checks is what
   setup saves. */
/* Whether the answers ask about board: three or more people, pooling, a joint account or one of us paying the bills. */
function setupBoardAsked(s){return s.people.length>2&&["pool","contribute","housekeeping"].indexOf(s.style)>=0}
/* 2.12.1: whether someone pays board, from setup's answers (three or more people, anyone but the first). */
function setupBoarder(s,p,i){return i>0&&setupBoardAsked(s)&&s.ans.board[p.id]==="yes"&&!(s.style==="housekeeping"&&p.id===s.ans.payer)}
/* 2.12.1: the bill payer has no pay while someone else has: "Half each" isn't offered, and the split goes by pay. */
function setupNoHalf(s){var a=s.ans,pp=s.style==="housekeeping"&&a.payer?s.people.filter(function(p){return p.id===a.payer})[0]:null;
  return !!(pp&&!(num(pp.pay)>0)&&s.people.some(function(p){return num(p.pay)>0}))}
/* 2.13: the one person with pay among those who'd share the costs (not anyone paying board), when there's only one: they
   pay what the shared account needs, so how to split it isn't asked. With one of us paying the bills, only when that's
   the bill payer (otherwise set amounts still change what the earner pays). null otherwise. */
function setupOneEarner(s){if(s.people.length<2||["contribute","housekeeping"].indexOf(s.style)<0)return null;
  var withPay=s.people.filter(function(p,i){return !setupBoarder(s,p,i)&&num(p.pay)>0});if(withPay.length!==1)return null;
  return s.style==="housekeeping"&&withPay[0].id!==s.ans.payer?null:withPay[0]}
/* The answers as setupShape options. Without anyone's pay typed in, nobody counts as having no pay. With one earner the
   split isn't asked (2.13), and it goes by pay, so it still makes sense if someone else has pay later. */
function setupOpts(s){var a=s.ans,o={rule:setupOneEarner(s)?"pay":a.rule||(setupNoHalf(s)?"pay":"equal"),two:a.two==="yes",payer:a.payer,noPay:[],gets:{},set:{},board:{}};
  s.people.forEach(function(p,i){if(!(num(p.pay)>0))o.noPay.push(p.id);if(a.gets[p.id]==="yes")o.gets[p.id]=num(a.getsAmt[p.id]);o.set[p.id]=num(a.set[p.id]);
    if(setupBoarder(s,p,i))o.board[p.id]=num(a.boardAmt[p.id])});
  if(o.noPay.length===s.people.length)o.noPay=[];
  return o}
/* Setup's people with names filled in ("Person 2"), for the flow helpers (parentId, flowOrder, flowStory). */
function setupPeople(s){return s.people.map(function(p,i){var x={id:p.id,name:personName(p,i),payAccount:p.payAccount};if(setupBoarder(s,p,i))x.boarder=true;return x})}
/* An account's name, or "Account 3" (by its place i in setup's list) when it's empty. */
function setupAcctName(a,i){return String(a.name||"").trim()||"Account "+(i+1)}
/* Step 3's payday as settings: {} until a day is picked. */
function setupPayday(pd){return pd.day?{day:pd.day==="last"?"last":Number(pd.day),weekend:pd.weekend!==false}:{}}
/* Who pays what changes with the rule and the amounts typed: the funding on each of setup's accounts (list) from the
   starting point is worked out again from the answers (by role), whatever else has been changed by hand. */
function setupSyncFunding(s,list){var kind=s.shape;if(!kind||!list.length)return;var sh=setupShape(kind,setupPeople(s),setupOpts(s)),by={};
  sh.accounts.forEach(function(a){if(a.funding)by[a.role]=a.funding});
  list.forEach(function(a){if(!a.role)return;var f=by[a.role];if(f)a.funding=f;else delete a.funding})}
/* The settings setup saves, from its answers s and the settings there are now (old: only appearance and notify are kept):
   what was entered, with defaults for anything not reached or skipped. Rows that can't be saved (a name with no amount,
   say) are left out and counted (dropped), leaving out steps that were skipped. Nobody entered: one person, "You". No
   accounts: one "Current account". Accounts go in flow order; pay for an account that isn't there goes to the first one,
   other income, budgets and savings to the one that keeps what's left, bills to the usual bills account. Savings
   transfers start ("since") in the month the Pay tab first opens on: the next payday's month with o.fromPreview (after
   "Looks right, start"), otherwise defaultMonth. A row with an id keeps it (setup's other income, and the simulation's
   rows); the rest get new ids. o: {schema, version (saved as lastVersion), fromPreview, today}. Returns {cfg, dropped},
   and figureNotes (2.14) when a rough figure wasn't kept: a sentence for each, for the screen. */
function setupSettings(s,old,o){o=o||{};var dropped=0,skip=s.skip||{};
  function rows(list){var r=readRows(list||[]),bad={};r.errors.forEach(function(e){bad[e.i]=1});dropped+=Object.keys(bad).length;return r.items}
  var c={schema:o.schema||5,setupDone:true,setupTips:true,tourDone:false,lastVersion:o.version,appearance:old&&old.appearance,notify:old&&old.notify,
    people:s.people.map(function(p,i){var v=parseMoney(p.pay,false),x={id:p.id,name:personName(p,i),payAccount:p.payAccount,usualPay:v.value>0?r2(v.value):0};
      // 2.16: paid every 7, 14 or 28 days (p.every; missing or anything else is every month): the pay typed is pay each time.
      if(PAY_EVERY[Number(p.every)]&&v.value>0){x.pattern={every:Number(p.every),each:r2(v.value)};x.usualPay=usualMonthly(x);
        // 2.17 (L15): "A recent payday (optional)" (p.on, "YYYY-MM-DD"); normCfg drops one that isn't a usable date.
        if(typeof p.on==="string"&&p.on.trim())x.pattern.on=p.on.trim()}
      if(setupBoarder(s,p,i))x.boarder=true;return x})};
  // Nobody entered yet (setup skipped, or rows left blank): one person, "You".
  if(!s.people.some(function(p){return String(p.name||"").trim()||String(p.pay||"").trim()}))c.people=[{id:(s.people[0]&&s.people[0].id)||uid("p"),name:"You",payAccount:s.people[0]&&s.people[0].payAccount,usualPay:0}];
  var accts=clone(s.accounts),byId={};setupSyncFunding(s,accts);
  // 2.16 (E17): one person on a pattern with "My pay account, a bills account and a spending account" (Pay → Bills →
  // Spending, as setupShape makes it): Bills → Pay account → Spending instead, so the pay account tops up Bills by
  // exactly its bills (a standing order covers it) and still moves what's left on to Spending.
  if(c.people.length===1&&patternOf(c.people[0])&&s.shape==="split"){var role=function(r){return accts.filter(function(a){return a.role===r})[0]},pa=role("pay"),bi=role("bills"),sp=role("spending");
    if(pa&&bi&&sp&&c.people[0].payAccount===pa.id&&pa.leftoverTo===bi.id&&bi.leftoverTo===sp.id&&!sp.leftoverTo){bi.leftoverTo=pa.id;pa.leftoverTo=sp.id}}
  var sc={accounts:accts.map(function(a,i){byId[a.id]=a;var x={id:a.id,name:setupAcctName(a,i),colour:a.colour,leftoverTo:a.leftoverTo};if(a.funding)x.funding=a.funding;return x}),people:setupPeople(s)};
  c.accounts=flowOrder(sc).map(function(id){var a=byId[id],x={id:a.id,name:setupAcctName(a,accts.indexOf(a)),colour:a.colour,leftoverTo:a.leftoverTo||null};if(a.funding)x.funding=clone(a.funding);return x});
  if(!c.accounts.length)c.accounts=[{id:uid("a"),name:"Current account",colour:COLOURS[0][0],leftoverTo:null}];
  c.accounts.forEach(function(a){a.leftoverTo=parentId(c,a.id)});
  var ids=c.accounts.map(function(a){return a.id}),first=ids[0],root=rootIds(c)[0]||first,ok=function(id,def){return ids.indexOf(id)>=0?id:def};
  c.people.forEach(function(p){p.payAccount=ok(p.payAccount,first)});
  c.income=rows(s.income).map(function(x){return {id:x.r.id||uid("i"),name:x.name,amount:x.amount,account:ok(x.r.account,root)}});
  c.payday=skip[3]?{}:setupPayday(s.payday);
  var billTo=defaultBillAccount(c);c.bills=[];
  if(!skip[5])c.accounts.forEach(function(a){rows(s.bills[a.id]).forEach(function(x){var b={id:x.r.id||uid("b"),name:x.name,amount:x.amount,account:a.id,months:x.months};applyCategorySuggestion(b);c.bills.push(b)})});
  if(!skip[5])Object.keys(s.bills).forEach(function(k){if(ids.indexOf(k)<0)rows(s.bills[k]).forEach(function(x){var b={id:x.r.id||uid("b"),name:x.name,amount:x.amount,account:billTo,months:x.months};applyCategorySuggestion(b);c.bills.push(b)})});
  // 2.14: a rough figure for an account's bills (s.figures {accountId: amount as typed}; blank or £0 is none), kept only
  // when it's above the account's listed bills that come in 7 or more months a year, and where a figure is allowed
  // (estimateBlock). One that isn't kept is said in figureNotes; one that can't be read counts as dropped.
  var notes=[],figs=isObj(s.figures)&&!skip[5]?s.figures:{},es=[];
  // Where a figure isn't allowed, that's what's said, whatever was typed (an answer in step 4 can make an account one
  // after its figure was typed); elsewhere text that isn't an amount is a row that wasn't complete.
  c.accounts.forEach(function(a){var v=parseMoney(figs[a.id],false),nm=String(a.name||"").trim()||"this account",why;if(v.empty)return;
    if(!v.invalid&&!(v.value>0))return;why=estimateBlock(c,a.id);
    if(why==="board"){notes.push("A rough figure isn't used for "+nm+": it's money of their own, outside the household's figures.");return}
    if(why){notes.push("A rough figure isn't used for "+nm+". With this split, list your own bills so the shares are fair.");return}
    if(v.invalid){dropped++;return}
    var fig=r2(v.value),listed=estimateParts({bills:c.bills,estimates:[{account:a.id,amount:0}]},a.id).listed;
    if(listed>=fig)notes.push("The bills listed for "+nm+" already come to "+fmt(listed)+", so its rough figure of "+fmt(fig)+" isn't needed.");
    else es.push({id:uid("e"),account:a.id,amount:fig})});
  if(es.length)c.estimates=es;
  c.budgets=skip[6]?[]:rows(s.budgets).map(function(x){return {id:x.r.id||uid("g"),name:x.name,amount:x.amount,account:ok(x.r.account,root)}});
  // 2.12: spending money each person keeps when the household puts it all together (step 4), kept in their pay account.
  if(s.people.length>1&&s.style==="pool"&&s.ans.fun==="yes")c.people.forEach(function(p){if(p.boarder)return;var v=parseMoney(s.ans.funAmt[p.id],false).value;
    if(v>0)c.budgets.push({id:uid("g"),name:possessive(p.name)+" spending money",amount:r2(v),account:ok(p.payAccount,root)})});
  var nx=o.fromPreview===true&&nextPayday(c.payday,o.today),since=nx?nx.month:defaultMonth(c.payday,o.today);
  c.savings=skip[6]?[]:rows(s.savings).map(function(x){return {id:x.r.id||uid("s"),name:x.name,amount:x.amount,fromAccount:ok(x.r.account,root),since:since}});
  var res={cfg:normCfg(c),dropped:dropped};if(notes.length)res.figureNotes=notes;return res}
/* The checklist's bills item: done once there's a bill and no account has bills not listed yet (2.14: "List Joint's bills
   (£380 to go)" while it has, from the settings as they are now). unlisted: [{account, amount}] in account order. */
function billsTip(c){var est=estimateTotals(c),un=arr(c.accounts).filter(function(a){return est[a.id]&&est[a.id].unlisted>0}).map(function(a){return {account:a.id,amount:est[a.id].unlisted}});
  if(!un.length)return {key:"bills",label:"Add your bills",done:arr(c.bills).length>0};
  var nm=function(u){return String((accById(c,u.account)||{}).name||"").trim()||"Unnamed account"},tot=r2(un.reduce(function(t,u){return t+u.amount},0));
  return {key:"bills",label:(un.length===1?"List "+possessive(nm(un[0]))+" bills":"List the bills for "+listAnd(un.map(nm)))+" ("+fmt(tot)+" to go)",done:false,unlisted:un}}
/* The Pay tab's "Finish setting up" card: what's still missing after setup, worked out from the data. */
function payTyped(months,pid){return Object.keys(months||{}).some(function(k){return payIsTyped(months[k],pid)})}
function setupChecklist(c,months){c=c||{};var people=arr(c.people);
  return [{key:"pay",label:"Add your take-home pay",done:people.length>0&&people.every(function(p){return num(p.usualPay)>0||payTyped(months,p.id)})},
    {key:"payday",label:"Set your "+dayWord(c),done:!!(c.payday&&c.payday.day)},
    billsTip(c),
    {key:"budgets",label:"Add spending budgets or savings",done:arr(c.budgets).length>0||arr(c.savings).length>0}]}
/* Is the household past its first payday? (The first-month hint shows until it is.) Yes once any month has had every
   one of its transfers ticked, or any month other than k (the one on screen) has a tick or typed pay: someone who has
   used Dovetail before, whether or not they tick every transfer. Months saved before 2.0 have no results to check
   against, so any tick there counts. */
function firstMonthDone(months,k){return Object.keys(months||{}).some(function(x){var d=months[x],st=d&&d.results&&d.results.steps,done=(d&&d.done)||{};
  var ticked=function(id){return done[id]!=null&&done[id]!==false};
  if(x!==k&&(Object.keys(done).some(ticked)||(d&&d.pay&&typeof d.pay==="object"&&Object.keys(d.pay).some(function(p){return d.pay[p]!=null}))))return true;
  if(!st||typeof st!=="object")return Object.keys(done).some(ticked);
  var ids=Object.keys(st);return ids.length>0&&ids.every(ticked)})}

/* Paste a list (onboarding 5.4): reads one bill per line from pasted text: tab-separated cells, comma or semicolon
   cells, or free text ("Streaming £8.75", "£8.75 Streaming"). Returns {items,unread,truncated}. Each item is
   {name,amount,months,line,duplicate?,large?,account?,month?,yearly?,quarterly?}: months is [] for every month; yearly:true
   means "once a year, month not given" (the page asks); quarterly:true with months the four months from the named one
   (or [] when none is named). A month given with no frequency word means once a year in that month. A line it can't
   use goes to unread as {line,text,reason}. Header lines, blank lines and totals are skipped without comment. Every
   pattern is linear and lines are capped, so hostile text can't hang it, and a bad line never throws. */
var PL_MAX=20000,PL_LINE=500;
var PL_MON="january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sept|sep|october|oct|november|nov|december|dec";
var PL_MONRE=new RegExp("(^|[^A-Za-z])("+PL_MON+")\\.?(?![A-Za-z])","i");
var PL_MONALL=new RegExp("(^|[^A-Za-z])(?:(?:in|on|due|by|every|each) )?("+PL_MON+")\\.?(?![A-Za-z])","gi");
var PL_MONWHOLE=new RegExp("^("+PL_MON+")\\.?$","i");
var PL_MARKS_L=/\b(?:direct debit|standing order|d\/d|s\/o)(?![A-Za-z])/gi;
var PL_MARKS_U=/\b(?:DD|SO|STO)\b/g;
var PL_REF=/\bref(?:erence)?\b\.?:? ?#?(?=[A-Za-z-]*\d)[A-Za-z0-9-]{2,}/gi;
var PL_STAR=/\*+ ?\d{2,}\b|#\d{3,}\b/g;
var PL_LONG=/(^|[^£\d.,])\d{6,}(?!\d|[.,]\d)/g;
var PL_DATE=/\b\d{1,4}[\/-]\d{1,2}(?:[\/-]\d{1,4})?\b/g;
var PL_DATE2=new RegExp("(?<![\\d.,£])\\b\\d{1,2}(?:st|nd|rd|th)? (?:"+PL_MON+")\\.?(?: \\d{4})?(?![A-Za-z0-9])","gi");
var PL_TIME=/\b\d{1,2}:\d{2}\b/g;
var PL_FM=/(?:^|[^A-Za-z0-9])(?:monthly|every month|(?:a|per|each) month|pcm|pm|p\.m\.)(?![A-Za-z0-9])|\/ ?(?:m|mo|mth|mths|month)(?![A-Za-z0-9])|(\d)(?:pm|p\.m\.)(?![A-Za-z0-9])/gi;
var PL_FY=/(?:^|[^A-Za-z0-9])(?:yearly|annual(?:ly)?|every year|(?:a|per|each) year|per annum|annum|pa|p\.a\.)(?![A-Za-z0-9])|\/ ?(?:y|yr|yrs|year|annum)(?![A-Za-z0-9])|(\d)(?:pa|p\.a\.)(?![A-Za-z0-9])/gi;
var PL_FQ=/(?:^|[^A-Za-z0-9])(?:quarterly|every quarter|(?:a|per|each) quarter|pq)(?![A-Za-z0-9])|\/ ?(?:q|qtr|quarter)(?![A-Za-z0-9])/gi;
var PL_AMT=/(^|[^A-Za-z0-9.,£$])(\(?) ?([-–+]?) ?((?:£|GBP) ?)?([-–]?) ?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?(?: ?(?:CR|DR)\b)?(?![A-Za-z0-9])( ?\))?/gi;
var PL_ODD=new RegExp("[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F\\u00A0\\u2000-\\u200B\\u202F\\u3000\\uFEFF]","g");
var PL_MINUS=new RegExp("\\u2212","g");
var PL_EOL=new RegExp("\\r\\n|\\r|\\n|\\u2028|\\u2029");
var PL_TAILMON=new RegExp("^ *(?:(?:in|on|due|by|every|each) )?("+PL_MON+")\\.? *$","i");
var PL_HEAD={how:1,often:1,due:1,name:1,bill:1,bills:1,payee:1,description:1,amount:1,cost:1,price:1,account:1,frequency:1,month:1,date:1,balance:1,total:1,subtotal:1,item:1,items:1,details:1,reference:1,type:1,category:1};
/* One cell's text with marks, references, dates, times and frequency words taken out (the frequency words are noted in f). A day and month ("12 Oct") are dropped as a date unless keep is set (plLine sets it when that
   leaves the line with no amount at all: "Gym 30 March"). */
function plPrep(s,f,keep){
  s=s.replace(PL_MARKS_L," ").replace(PL_MARKS_U," ").replace(PL_REF," ").replace(PL_STAR," ").replace(PL_TIME," ");
  if(!keep)s=s.replace(PL_DATE2," ");
  s=s.replace(PL_DATE," ");
  s=s.replace(PL_FQ,function(){f.q=1;return " "}).replace(PL_FY,function(m,d){f.y=1;return d?d+" ":" "}).replace(PL_FM,function(m,d){f.m=1;return d?d+" ":" "});
  return s.replace(PL_LONG,"$1 ").replace(/ {2,}/g," ").trim()}
/* The amounts in a cell's text, with the text between them: {parts:[text,amt,text,...],amts}. */
function plAmts(s){var parts=[],amts=[],p=0,m,a,end,x;PL_AMT.lastIndex=0;
  while((m=PL_AMT.exec(s))){a=m[1].length+m.index;end=m.index+m[0].length;parts.push(s.slice(p,a));
    x={v:Number(m[6].replace(/,/g,"")+(m[7]?"."+m[7]:"")),sym:!!m[4],dec:m[7]!==undefined,raw:m[0].slice(m[1].length),restore:false};
    x.lead=!x.sym&&!x.dec&&x.v<=99&&parts[parts.length-1].trim()===""&&/^ [A-Za-z]/.test(s.slice(end));
    parts.push(x);amts.push(x);p=end}
  parts.push(s.slice(p));return{parts:parts,amts:amts}}
function plRest(parts){return parts.map(function(x){return typeof x==="string"?x:x.restore?x.raw:" "}).join("").replace(/ {2,}/g," ").trim()}
function plCells(l){if(l.indexOf("\t")>=0)return l.split("\t");
  var out=[],cur="",i,c;
  for(i=0;i<l.length;i++){c=l.charAt(i);
    if(c===";"||(c===","&&!(i>0&&/\d/.test(l.charAt(i-1))&&/^\d{3}(?!\d)/.test(l.substr(i+1,4))))){out.push(cur);cur="";continue}
    cur+=c}
  out.push(cur);return out}
function plClean(s,max){s=s.replace(/£|\bGBP\b/g," ").replace(/\(\s*\)/g," ").replace(/ {2,}/g," ").replace(/^[\s,;:.\-–—|*#\/\\_+]+|[\s,;:.\-–—|*#\/\\_]+$/g,"");
  return s.length>max?s.slice(0,max).replace(/[\s,;:.\-–—|*#\/\\_]+$/,""):s}
function plMonth(w){return MN.findIndex(function(n){return n.toLowerCase().slice(0,3)===w.toLowerCase().slice(0,3)})+1}
function plNorm(s){return String(s==null?"":s).toLowerCase().replace(/\s+/g," ").trim()}
/* One line → {item}, {unread} or {} (skipped without comment). */
function plLine(raw,n,ex,first){
  var l=raw.replace(/^[ \t]*(?:[-*•·▪‣>]+|\d{1,3}[.)])[ \t]+/,""),cells=plCells(l),multi=cells.length>1,f={},cs=[],all=[],i,j,m,t;
  var bad=function(why){return{unread:{line:n,text:raw.trim().slice(0,120),reason:why}}};
  var words=raw.toLowerCase().match(/[a-z]+/g)||[];
  var scan=function(keep){f={};cs=[];all=[];for(i=0;i<cells.length;i++){t=plAmts(plPrep(cells[i].replace(/ +/g," ").trim(),f,keep));cs.push(t);all=all.concat(t.amts)}};
  scan(false);if(!all.length)scan(true);
  var nonLead=all.filter(function(a){return!a.lead});
  if(all.length>1){if(nonLead.length!==1)return bad("two amounts");all.forEach(function(a){if(a.lead)a.restore=true});all=nonLead}
  var texts=[],month=0,rest,tail,k;
  for(i=0;i<cs.length;i++){
    /* A month straight after the amount, with no frequency word ("Insurance 480 June"): once a year in that month. */
    k=cs[i].parts.length-1;tail=cs[i].amts.length&&!(f.y||f.q||f.m)?PL_TAILMON.exec(cs[i].parts[k]):null;
    if(tail){if(!month)month=plMonth(tail[1]);cs[i].parts[k]=""}
    rest=plRest(cs[i].parts);if(!rest)continue;
    if(multi&&PL_MONWHOLE.test(rest)){if(!month)month=plMonth(rest);continue}
    if(f.y||f.q){m=PL_MONRE.exec(rest);if(m){if(!month)month=plMonth(m[2]);rest=rest.replace(PL_MONALL,"$1 ")}}
    rest=plClean(rest,60);if(rest)texts.push(rest)}
  if(!all.length){if(!words.length||words.every(function(w){return PL_HEAD[w]===1})||(first&&multi))return{};
    return bad("no amount")}
  var amount=r2(Math.abs(all[0].v));
  if(!isFinite(amount))return bad("couldn't read");
  if(amount===0)return bad("no amount");
  var name=texts[0]||"";
  if(/^(?:grand |sub)?total$|^balance$/i.test(name))return{};
  if(!/[A-Za-zÀ-￿]/.test(name))return bad("no name");
  var it={name:name,amount:amount,months:[],line:n};
  if(f.q){it.quarterly=true;if(month){it.month=month;it.months=[0,3,6,9].map(function(d){return(month-1+d)%12+1}).sort(function(a,b){return a-b})}}
  else if(f.y){if(month){it.month=month;it.months=[month]}else{it.month=null;it.yearly=true}}
  else if(f.m){if(month)it.month=month}
  else if(month){it.month=month;it.months=[month]}
  else if(/council\s*tax/i.test(name))it.months=[4,5,6,7,8,9,10,11,12,1];
  if(multi&&texts[1])it.account=texts[1];
  var nn=plNorm(name);
  for(j=0;j<ex.length;j++)if(ex[j]&&plNorm(ex[j].name)===nn&&Math.abs(r2(Number(ex[j].amount)-amount))<=0.01){it.duplicate=true;break}
  if(amount>5000)it.large=true;
  return{item:it}}
function parseBillLines(text,existing){
  var items=[],unread=[],truncated=false,ex=Array.isArray(existing)?existing:[],first=true,nl;
  try{text=String(text==null?"":text)}catch(e){text=""}
  if(text.length>PL_MAX){truncated=true;text=text.slice(0,PL_MAX);nl=text.lastIndexOf("\n");if(nl>0)text=text.slice(0,nl)}
  text=text.replace(PL_ODD," ").replace(PL_MINUS,"-");
  text.split(PL_EOL).forEach(function(raw,i){
    if(!raw.trim())return;
    var isFirst=first,r;first=false;
    try{if(raw.length>PL_LINE){unread.push({line:i+1,text:raw.trim().slice(0,120),reason:"couldn't read"});return}
      r=plLine(raw,i+1,ex,isFirst);
      if(r.item)items.push(r.item);else if(r.unread)unread.push(r.unread)}
    catch(e){unread.push({line:i+1,text:String(raw).trim().slice(0,120),reason:"couldn't read"})}});
  return{items:items,unread:unread,truncated:truncated}}
