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
function paydayIn(pc,y,m){pc=pc||{};var d,back=0;
  if(pc.day==="last"){d=dim(y,m);var w=dow(ymd(y,m,d));back=w===6?1:w===0?2:0}
  else{var D=Number(pc.day);if(!D)return null;d=Math.min(D,dim(y,m));if(pc.weekend!==false){var w2=dow(ymd(y,m,d));back=w2===6?1:w2===0?2:0}}
  d-=back;if(d<1){var pk=shiftMonth(ymd(y,m,1).slice(0,7),-1).split("-").map(Number);return ymd(pk[0],pk[1],dim(pk[0],pk[1])+d)}return ymd(y,m,d)}
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
function normCfg(c){c=clone(c||{});
  ["bills","income","savings","reminders","doneLog","people","accounts","budgets"].forEach(function(k){c[k]=objs(c[k])});
  c.payday=isObj(c.payday)?c.payday:{};if(c.payday.day!=null&&c.payday.day!==""&&!validPayDay(c.payday.day))c.payday.day="";
  c.bills.forEach(function(b,i){if(!b.id)b.id="b"+i+uid("");b.months=normMonthList(b.months)});
  c.income.forEach(function(x){if(!x.id)x.id=uid("i")});c.budgets.forEach(function(x){if(!x.id)x.id=uid("g")});
  c.accounts.forEach(function(a){if(!a.id)a.id=uid("a");if(a.leftoverTo===undefined)a.leftoverTo=null});
  c.people.forEach(function(p){if(!p.id)p.id=uid("p")});
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
  return c}
/* The saved months, with anything that isn't the right shape taken out: a month must be an object, its ticks (done)
   and pay must be objects and its one-offs a list of objects. Nothing is added that wasn't there, so data from any
   version goes through unchanged when it's sound (migrate handles the old shapes). */
function normMonths(m){var out={};if(!isObj(m))return out;m=clone(m);
  Object.keys(m).forEach(function(k){var d=m[k];if(!isObj(d))return;
    if(d.done!=null&&!isObj(d.done))d.done={};if(d.pay!=null&&!isObj(d.pay))delete d.pay;if(d.oneOffs!=null)d.oneOffs=objs(d.oneOffs);
    if(d.results!=null&&!isObj(d.results))delete d.results;out[k]=d});
  return out}
/* A notification time "HH:MM" between 06:00 and 22:00 (clear of midnight); anything unreadable is 09:00. */
function notifyTime(t){if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(t||""))return "09:00";return t<"06:00"?"06:00":t>"22:00"?"22:00":t}
function accById(c,id){for(var i=0;i<c.accounts.length;i++)if(c.accounts[i].id===id)return c.accounts[i];return null}
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
function flowOrder(c){var ix={};c.accounts.forEach(function(a,i){ix[a.id]=i});
  return c.accounts.map(function(a){return {id:a.id,d:accountDepth(c,a.id)}}).sort(function(a,b){return b.d-a.d||ix[a.id]-ix[b.id]}).map(function(x){return x.id})}
/* Money-flow preview: one line per chain, e.g. "Current account → Joint account → Savings" */
function flowLines(c){var lines=[],leaves=c.accounts.filter(function(a){return !c.accounts.some(function(b){return parentId(c,b.id)===a.id})});
  leaves.forEach(function(a){var path=[a.id],x=parentId(c,a.id),g=0;while(x&&g<200){path.push(x);x=parentId(c,x);g++}lines.push(path)});return lines}
function calc(c,m,pay,oneOffs){
  var A={},order=c.accounts.map(function(a){return a.id}),t={pay:0,income:0,oneIn:0,bills:0,soSav:0,budgets:0,savings:0,oneOut:0};
  order.forEach(function(id){A[id]={inn:0,out:0,pay:[],income:[],bills:[],budgets:[],savings:[],oneIn:[],oneOut:[]}});
  c.people.forEach(function(p){var v=num(pay[p.id]);t.pay+=v;var s=A[p.payAccount];if(s){s.inn+=v;s.pay.push({p:p,v:v})}});
  c.income.forEach(function(i){var v=num(i.amount);t.income+=v;var s=A[i.account];if(s){s.inn+=v;s.income.push(i)}});
  arr(oneOffs).forEach(function(o){var v=num(o.amount),s=A[o.account];if(o.kind==="in"){t.oneIn+=v;if(s){s.inn+=v;s.oneIn.push(o)}}else{t.oneOut+=v;if(s){s.out+=v;s.oneOut.push(o)}}});
  c.bills.forEach(function(b){if(!applies(b,m))return;var v=num(b.amount);t.bills+=v;if(b.savings)t.soSav+=v;var s=A[b.account];if(s){s.out+=v;s.bills.push(b)}});
  c.budgets.forEach(function(b){var v=num(b.amount);t.budgets+=v;var s=A[b.account];if(s){s.out+=v;s.budgets.push(b)}});
  c.savings.forEach(function(x){var v=num(x.amount);t.savings+=v;var s=A[x.fromAccount];if(s){s.out+=v;s.savings.push(x)}});
  var par={},kids={},dep={},sub={};
  order.forEach(function(id){par[id]=parentId(c,id);kids[id]=[]});order.forEach(function(id){if(par[id])kids[par[id]].push(id)});
  function depthOf(id){if(dep[id]!=null)return dep[id];var d=0,x=par[id],g=0;while(x&&g<200){d++;x=par[x];g++}return (dep[id]=d)}
  function subOf(id){if(sub[id]!=null)return sub[id];var s=A[id].inn-A[id].out;kids[id].forEach(function(k){s+=subOf(k)});return (sub[id]=s)}
  order.forEach(subOf);
  var steps=[],nonRoot=order.filter(function(id){return par[id]});
  nonRoot.slice().sort(function(a,b){return depthOf(b)-depthOf(a)||order.indexOf(a)-order.indexOf(b)}).forEach(function(id){
    if(r2(sub[id])>0.004)steps.push({id:"t:"+id+">"+par[id],kind:"move",from:id,to:par[id],amt:sub[id]})});
  nonRoot.slice().sort(function(a,b){return depthOf(a)-depthOf(b)||order.indexOf(a)-order.indexOf(b)}).forEach(function(id){
    if(r2(sub[id])<-0.004)steps.push({id:"t:"+par[id]+">"+id,kind:"topup",from:par[id],to:id,amt:-sub[id]})});
  c.savings.forEach(function(x){steps.push({id:"s:"+x.id,kind:"save",from:x.fromAccount,toText:x.name||"Savings",amt:num(x.amount)})});
  var floats=order.filter(function(id){return !par[id]}).map(function(id){return {id:id,amt:sub[id]}});
  var flt=floats.reduce(function(s,f){return s+f.amt},0),totalIn=t.pay+t.income+t.oneIn,totalOut=t.bills+t.budgets+t.savings+t.oneOut,check=totalIn-totalOut;
  return {A:A,par:par,kids:kids,sub:sub,steps:steps,floats:floats,flt:flt,ok:Math.abs(r2(flt)-r2(check))<0.005,diff:check-flt,t:t,
    totalIn:totalIn,billsExSav:t.bills-t.soSav,totalSaving:t.savings+t.soSav,spend:t.budgets,oneOut:t.oneOut};
}


/* ---------- pay estimates ----------
   Pay not typed in yet: use the latest earlier month that has it, otherwise the person's usual pay. */
function personById(c,id){for(var i=0;i<c.people.length;i++)if(c.people[i].id===id)return c.people[i];return null}
/* 2.7: ticking a transfer before pay is typed saves the estimate in the pay box, and payEstimated {personId: true} marks
   it. A marked figure is used for that month's transfers but isn't pay that was typed in. Months saved before 2.7 have
   no payEstimated, so every saved figure there counts as typed, as before. */
function payIsTyped(d,pid){return !!(d&&d.pay&&d.pay[pid]!=null&&!(d.payEstimated&&d.payEstimated[pid]))}
function payEstimate(c,months,pid,k){var keys=Object.keys(months).filter(function(x){return x<k&&payIsTyped(months[x],pid)}).sort();
  if(keys.length){var last=keys[keys.length-1];return {v:num(months[last].pay[pid]),from:last}}
  var p=personById(c,pid);return {v:num(p&&p.usualPay),from:null}}
/* Each person's pay for month k: what was typed for that month, or the estimate. */
function payFor(c,months,k){var d=months[k]||{},out={};c.people.forEach(function(p){out[p.id]=d.pay&&d.pay[p.id]!=null?num(d.pay[p.id]):payEstimate(c,months,p.id,k).v});return out}
function monthOneOffs(months,k){return arr(months[k]&&months[k].oneOffs)}

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
function setupShape(kind,people){people=arr(people);var solo=people.length<2,acc=[],pay={};
  function add(name,role){var id=uid("a");while(acc.some(function(x){return x.id===id}))id=uid("a");
    var a={id:id,name:name,colour:COLOURS[acc.length%COLOURS.length][0],leftoverTo:null,role:role};acc.push(a);return a}
  function chain(list){for(var i=0;i<list.length-1;i++)list[i].leftoverTo=list[i+1].id}
  function everyone(a){people.forEach(function(p){pay[p.id]=a.id})}
  if(kind==="own"||kind==="split"){
    if(solo){var one=(kind==="split"?[["Pay account","pay"]]:[]).concat([["Bills account","bills"],["Spending account","spending"]]).map(function(n){return add(n[0],n[1])});chain(one);everyone(one[0])}
    else{var own=people.map(function(p,i){return add(possessive(personName(p,i))+" account","own:"+p.id)});
      var joint=(kind==="own"?[["Joint account","joint"]]:[["Joint bills","bills"],["Joint spending","spending"]]).map(function(n){return add(n[0],n[1])});chain(joint);
      own.forEach(function(a,i){a.leftoverTo=joint[0].id;pay[people[i].id]=a.id})}}
  else everyone(solo?add("Current account","main"):add("Joint account","joint"));
  return {accounts:acc,payAccount:pay}}
/* The account everyone is paid into, when it passes what's left on: one person's "bills account, then a spending
   account", say. Its bills are paid from it. null when people are paid into different accounts, or it keeps what's left. */
function sharedPayAccount(c){var people=arr(c.people),id=people.length?people[0].payAccount:null;
  return id&&accById(c,id)&&parentId(c,id)&&people.every(function(p){return p.payAccount===id})?id:null}
/* The account most bills come from by default (Settings › Bills › Quick add, and setup): one nobody is paid into that
   sends what's left on; otherwise the account everyone is paid into, if it sends what's left on; otherwise the first
   one nobody is paid into, else the first. "" with no accounts. */
function defaultBillAccount(c){var paid=arr(c.people).map(function(p){return p.payAccount}),acc=arr(c.accounts);
  var a=acc.filter(function(x){return paid.indexOf(x.id)<0&&parentId(c,x.id)})[0];if(a)return a.id;
  var s=sharedPayAccount(c);if(s)return s;
  a=acc.filter(function(x){return paid.indexOf(x.id)<0})[0]||acc[0];return a?a.id:""}
/* One or two plain sentences per account, in flow order, for the setup diagram (and screen readers):
   "Alex's pay arrives in Alex's account. What's left moves to Joint bills." */
function flowStory(c){var nm=function(id){var a=accById(c,id);return (a&&String(a.name||"").trim())||"Unnamed account"};
  return flowOrder(c).map(function(id){var name=nm(id),par=parentId(c,id),t=[];
    var arrives=arr(c.people).map(function(p,i){return p.payAccount===id?possessive(personName(p,i))+" pay":null}).filter(Boolean)
      .concat(arr(c.income).filter(function(x){return x.account===id}).map(function(x){return String(x.name||"").trim()||"Other income"}));
    var from=c.accounts.filter(function(a){return parentId(c,a.id)===id}).map(function(a){return nm(a.id)});
    if(arrives.length)t.push(listAnd(arrives)+(arrives.length>1?" arrive":" arrives")+" in "+name+".");
    if(from.length)t.push((arrives.length?"It also gets":name+" gets")+" what's left from "+listAnd(from)+".");
    if(!arrives.length&&!from.length)t.push("Nothing arrives in "+name+" yet.");
    t.push(par?"What's left moves to "+nm(par)+".":"It keeps what's left: your left over.");
    return {id:id,arrives:arrives,from:from,to:par,text:t.join(" ")}})}
/* A bill's months from setup's "How often": "monthly" → [] (every month); "yearly" in month M → [M]; "some" → the picked
   months, sorted ([] when all 12 are picked). null when it can't be saved: once a year with no month, or no months picked. */
function billMonths(freq,month,picked){
  if(freq==="yearly"){var m=Number(month);return m>=1&&m<=12&&Math.floor(m)===m?[m]:null}
  if(freq==="some"){var s=[];arr(picked).forEach(function(x){x=Number(x);if(x>=1&&x<=12&&Math.floor(x)===x&&s.indexOf(x)<0)s.push(x)});
    return !s.length?null:s.length>=12?[]:s.sort(function(a,b){return a-b})}
  return []}
/* The Pay tab's "Finish setting up" card: what's still missing after setup, worked out from the data. */
function payTyped(months,pid){return Object.keys(months||{}).some(function(k){return payIsTyped(months[k],pid)})}
function setupChecklist(c,months){c=c||{};var people=arr(c.people);
  return [{key:"pay",label:"Add your take-home pay",done:people.length>0&&people.every(function(p){return num(p.usualPay)>0||payTyped(months,p.id)})},
    {key:"payday",label:"Set your payday",done:!!(c.payday&&c.payday.day)},
    {key:"bills",label:"Add your bills",done:arr(c.bills).length>0},
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
