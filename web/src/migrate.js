/* Dovetail: data upgrades. Pure functions only (they change the objects passed in); also loaded by the unit tests. */
/* Migrations run in order on load and on restore. Each step is safe to run on data that already has it.
   w is the old Wealth tab's data (read only: it is never changed). */
function migrate(c,m,w){var changed=false,legacy=looksLegacy(c,m);
  if((c.schema||0)<3){
    c.savings.forEach(function(sv){if(!sv.id)sv.id=uid("s")});
    Object.keys(m).forEach(function(k){var d=m[k]&&m[k].done;if(!d)return;Object.keys(d).forEach(function(key){var mt=/^sav(\d+)$/.exec(key);if(!mt)return;var sv=c.savings[Number(mt[1])];if(sv&&d["sav:"+sv.id]==null)d["sav:"+sv.id]=d[key];delete d[key]})});
    c.schema=3;changed=true}
  if(c.schema<4){migrateTo4(c,m,w,legacy);changed=true}
  if(c.schema<5){migrateTo5(c);changed=true}
  c.savings.forEach(function(sv){if(!sv.id){sv.id=uid("s");changed=true}});
  return changed}
/* 1.x had one fixed household built into the app: two people paid into their own accounts, both sending what's left
   to a joint bills account, which sends what's left to a joint spending account that holds the budgets, savings and
   float. Turn that into people and accounts that can be edited, keeping the same account ids so bills need no change.
   No names are built in: the accounts get plain names, and the people (and their ids) come from the data itself, since
   1.x kept each person's usual pay (defaultPay) and each month's pay under a key of their own, in order. The account ids
   and the 1.x result key for the joint transfer are part of the 1.x data format, so they stay. */
var LEGACY={accounts:[{id:"cur1",name:"Current account 1",colour:"blue",leftoverTo:"jbills"},{id:"cur2",name:"Current account 2",colour:"red",leftoverTo:"jbills"},
  {id:"jbills",name:"Joint bills account",colour:"purple",leftoverTo:"jspend"},{id:"jspend",name:"Joint spending account",colour:"orange",leftoverTo:null}],
  payAccounts:["cur1","cur2"],
  budgets:[["food","Food"],["fuel","Fuel"],["general","General living"]],spend:"jspend",
  // the joint transfer's 1.x tick key → [from, to, the 1.x result that held its amount]; each person's is [their account, "jbills", their key]
  joint:{jbjs:["jbills","jspend","jbillsToJspend"]}};
/* Month fields that aren't a person's pay, in any version. */
var MONTH_FIELDS=["month","overdraft","done","results","updatedAt","pay","payEstimated","oneOffs"];
/* The 1.x people's keys, in order (at most two): defaultPay's, then any other pay fields on the months (oldest month
   first). The order is the only record of who was paid into which account: 1.x always wrote the first person first. */
function legacyPeople(c,m){var ks=Object.keys(isObj(c.defaultPay)?c.defaultPay:{}).slice(0,2);
  Object.keys(m).sort().forEach(function(k){var d=m[k];if(!isObj(d)||ks.length>=2)return;Object.keys(d).forEach(function(f){var v=d[f];
    if(ks.length<2&&MONTH_FIELDS.indexOf(f)<0&&(v===null||typeof v==="number")&&ks.indexOf(f)<0)ks.push(f)})});
  return ks}
/* A name from a 1.x key: "sam" → "Sam". */
function nameFromKey(k){var t=String(k||"").replace(/[_-]+/g," ").trim();return t?t.charAt(0).toUpperCase()+t.slice(1):""}
function legacyTicks(pids){var t=clone(LEGACY.joint);pids.forEach(function(pid,i){t[pid]=[LEGACY.payAccounts[i],"jbills",pid]});return t}
/* Data that really came from 1.x: it has a 1.x schema number, the 1.x settings (defaultPay, budget, v12), bills on the
   built-in accounts, or months in the 1.x shape (an overdraft, or the joint transfer's result). Anything else with no household (a hand-made or damaged
   backup with no schema) is left empty rather than given the 1.x household. Decided before any step runs. */
function looksLegacy(c,m){var L=LEGACY,ids=L.accounts.map(function(a){return a.id});
  if((c.schema||0)>=1||c.defaultPay||c.budget||c.v12)return true;
  if(c.bills.some(function(b){return ids.indexOf(b.account)>=0}))return true;
  return Object.keys(m).some(function(k){var d=m[k];return isObj(d)&&(d.overdraft!==undefined||(isObj(d.results)&&d.results.jbillsToJspend!==undefined))})}
function migrateTo4(c,m,w,legacy){
  var dp=c.defaultPay||{},bud=c.budget||{},L=LEGACY;if(legacy==null)legacy=looksLegacy(c,m);
  var pids=legacy?legacyPeople(c,m):[],ticks=legacyTicks(pids);
  if(!c.accounts.length&&legacy)c.accounts=clone(L.accounts);
  if(!c.people.length&&legacy)c.people=pids.map(function(pid,i){return {id:pid,name:nameFromKey(pid),payAccount:L.payAccounts[i],usualPay:num(dp[pid])}});
  if(!c.budgets.length&&legacy)c.budgets=L.budgets.map(function(b){return {id:b[0],name:b[1],amount:num(bud[b[0]]),account:L.spend}});
  c.income.forEach(function(x){if(!x.id)x.id=uid("i")});
  c.savings.forEach(function(s){if(!s.fromAccount)s.fromAccount=L.spend;if(s.account!=null){s.wealthLink=s.account;delete s.account}});
  Object.keys(m).forEach(function(k){var d=m[k];if(!d||typeof d!=="object")return;var res=d.results||{};
    if(!d.pay){d.pay={};pids.forEach(function(pid){d.pay[pid]=d[pid]!=null?num(d[pid]):null})}
    pids.forEach(function(pid){delete d[pid]});
    var dn=d.done||{},out={};
    Object.keys(dn).forEach(function(key){var v=dn[key],t=ticks[key];
      // a negative 1.x transfer was money going the other way, which 2.0 shows as a top-up
      if(t)out[num(res[t[2]])<0?"t:"+t[1]+">"+t[0]:"t:"+t[0]+">"+t[1]]=v;
      else if(key.indexOf("sav:")===0)out["s:"+key.slice(4)]=v;
      else out[key]=v});
    d.done=out;
    if(num(d.overdraft)>0){d.oneOffs=arr(d.oneOffs);d.oneOffs.push({id:uid("o"),kind:"out",name:"Overdraft from last month",amount:num(d.overdraft),account:L.spend})}
    delete d.overdraft;
    if(d.results)d.results={float:d.results.float}});
  // Mortgage deal end dates lived on the Wealth tab: move them onto the mortgage bill, or into a reminder.
  arr(w&&w.accounts).forEach(function(a){if(a.type!=="mortgage"||!a.dealEnd)return;var de=String(a.dealEnd);
    if(!validDate(de)){var pp=de.split("-").map(Number);if(pp.length!==2||!pp[0]||!pp[1])return;de=pp[0]+"-"+pad(pp[1])+"-"+pad(new Date(pp[0],pp[1],0).getDate())}
    var note="Your fixed mortgage deal ends. Compare deals and book a new rate. Lenders usually let you lock one in a few months ahead.",lead=a.lead!=null?num(a.lead):180;
    var b=a.billId?c.bills.filter(function(x){return x.id===a.billId})[0]:null;
    if(b&&!validDate(b.renews)){b.renews=de;b.lead=lead;if(!b.note)b.note=note}
    else if(!c.reminders.some(function(r){return r.fromWealth===a.id}))c.reminders.push({id:uid("r"),name:(a.name||"Mortgage")+" deal ends",date:de,lead:lead,yearly:false,note:note,fromWealth:a.id})});
  delete c.budget;delete c.defaultPay;
  if(legacy||c.accounts.length)c.setupDone=true;c.schema=4;
}
/* 2.1: suggest a category for each bill from its name (never overriding one the user chose). */
function migrateTo5(c){
  c.bills.forEach(function(b){applyCategorySuggestion(b)});
  c.schema=5;
}
