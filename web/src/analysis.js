/* Dovetail: the Analysis tab's computations. Pure functions only; also loaded by the unit tests.
   Everything here is derived from what the app already holds (settings, saved months, ticks, renewals): nothing new
   is ever asked for. c = settings, months = saved months, k = the budget month on screen, today = "YYYY-MM-DD". */

/* Months the household actually used (typed pay or ticked a transfer), oldest first, up to and including k. */
function usedMonths(months,upTo){return Object.keys(months).filter(function(x){var d=months[x];if(!d||typeof d!=="object"||!validMonth(x)||x>upTo)return false;
  var pay=d.pay&&Object.keys(d.pay).some(function(p){return payIsTyped(d,p)}),done=d.done&&Object.keys(d.done).some(function(s){return d.done[s]!=null&&d.done[s]!==false});
  return pay||done}).sort()}
function typedPayMonths(months,upTo){return Object.keys(months).filter(function(x){return validMonth(x)&&x<=upTo&&hasTypedPay(months,x)}).sort()}
function nextMonths(k,n){var out=[];for(var i=0;i<n;i++)out.push(shiftMonth(k,i));return out}
function sum(list,f){return list.reduce(function(t,x){return t+(f?f(x):x)},0)}

/* Typical monthly income: each person's average typed pay over their last 6 typed months up to k (or usual pay),
   plus regular other income. One-offs are left out: they aren't typical, and nor is estimated pay (payIsTyped). 2.16:
   someone on a pattern in month k gets their pay over a year ÷ 12 (usualMonthly; months: 0, pattern: theirs), not the
   mean of typed months, which would carry a month with an extra payday for six months. */
function avgIncome(c,months,k){
  // 2.12.1: a boarder's pay is their own: their board counts instead, as the transfers work it out for month k with
  // everyone's typical pay (a set amount, a share of their pay, or a share by the account's rule).
  var mc=cfgFor(c,k),out=boarderAccounts(mc),home=function(id){return !out[id]};
  var avgOf=function(p){var t=patternOf(p),ms=t&&datedPattern(p)?measuredPay(c,months,k,p.id,t):null;
    if(ms)return {id:p.id,name:p.name,avg:ms.avg,months:ms.months,pattern:t,perPay:ms.perPay};
    if(t)return {id:p.id,name:p.name,avg:usualMonthly(p),months:0,pattern:t};
    var keys=Object.keys(months).filter(function(x){return x<=k&&validMonth(x)&&payIsTyped(months[x],p.id)}).sort().slice(-6);
    if(keys.length)return {id:p.id,name:p.name,avg:sum(keys,function(x){return num(months[x].pay[p.id])})/keys.length,months:keys.length};
    return {id:p.id,name:p.name,avg:num(p.usualPay),months:0}};
  var all=mc.people.map(avgOf),people=all.filter(function(x,i){return home(mc.people[i].payAccount)}),board=0,pay={};all.forEach(function(x){pay[x.id]=x.avg});
  if(Object.keys(out).length)board=calc(mc,mNum(k),pay,[]).t.board;
  var other=sum(c.income.filter(function(i){return home(i.account)}),function(i){return num(i.amount)});
  // pay (2.13): everyone's typical pay, boarders too, for working out a typical month account by account.
  return {people:people,other:other,board:board,total:sum(people,function(p){return p.avg})+other+board,pay:pay}}

/* 2.17 (13.2, L11): the measured pay of person pid (pattern t in month k, with a payday date): over the last 6 months up
   to k with their pay typed, a frozen count of 1 or more, the same interval as month k and no correction (no extra payday
   marked "Not an extra payday", and none in a month whose count wasn't above usual), the mean of typed pay ÷ count, × paydays
   a year ÷ 12, rounded at the end. {avg, months, perPay (the mean, to the penny)}, or null when there's no such month. */
function measuredPay(c,months,k,pid,t){var n=PAY_EVERY[t.every].n;
  var keys=Object.keys(months).filter(function(x){var d=months[x];if(!(x<=k&&validMonth(x)&&payIsTyped(d,pid)))return false;var m=frozenPaydays(d,pid);
    if(m==null||m<1||intervalAt(c,pid,x)!==t.every)return false;var e=isObj(d.extra)?d.extra[pid]:null;
    return !(isObj(e)&&(e.edited===true&&num(e.amount)===0||m<=n))}).sort().slice(-6);
  if(!keys.length)return null;var mean=sum(keys,function(x){return num(months[x].pay[pid])/frozenPaydays(months[x],pid)})/keys.length;
  return {avg:r2(mean*PAY_EVERY[t.every].year/12),months:keys.length,perPay:r2(mean)}}
/* A person's line in Analysis's monthly picture (x: an entry of avgIncome's people): "Kerry's pay (about £1,690.00 a month:
   £1,560.00 every four weeks)", 2.17's "Jordan's pay (about £1,837.62 a month: an average of £424.07 a payday over 6
   months)", "Alex's pay (average of 3 months)" or "Alex's pay (usual pay)". */
function incomeLabel(x){var pl=function(n,w){return n+" "+w+(n===1?"":"s")};
  return (x.name?x.name+"'s pay":"Pay")+(x.perPay!=null?" (about "+fmt(x.avg)+" a month: an average of "+fmt(x.perPay)+" a payday over "+pl(x.months,"month")+")"
    :x.pattern?" (about "+fmt(x.avg)+" a month: "+patternWords(x.pattern)+")":x.months?" (average of "+pl(x.months,"month")+")":" (usual pay)")}

/* 1. The average month: income → bills → spending budgets → savings → float. Irregular bills are spread over the year.
   A boarder's own account (2.12.1) is left out: their board is income. 2.14: bills include what's not listed yet of any
   rough figure (unlisted, the same every month). */
function monthlyPicture(c,months,k){
  var inc=avgIncome(c,months,k),bills=0,billSavings=0,out=boarderAccounts(cfgFor(c,k)),home=function(x){return !out[x.account||x.fromAccount]};
  c.bills.filter(home).forEach(function(b){if(b.savings)billSavings+=monthlyEquivalent(b);else bills+=monthlyEquivalent(b)});
  var unlisted=unlistedTotal(c,out);bills+=unlisted;
  var budgets=sum(c.budgets.filter(home),function(b){return num(b.amount)}),transfers=sum(c.savings.filter(home),function(s){return num(s.amount)}),saving=transfers+billSavings;
  var flt=inc.total-bills-budgets-saving,I=inc.total;
  return {income:I,incomeDetail:inc,bills:bills,budgets:budgets,saving:saving,savingTransfers:transfers,savingBills:billSavings,float:flt,
    savingsRate:I>0?saving/I:null,committed:I>0?bills/I:null,discretionary:budgets+flt,discretionaryShare:I>0?(budgets+flt)/I:null,shortBy:averageShort(c,k,inc.pay),unlisted:unlisted}}
/* 2.14: bills not listed yet in settings c (cfgFor for a month), over the accounts with a rough figure that aren't in
   outside ({accountId: true}, a boarder's own accounts). */
function unlistedTotal(c,outside){var est=estimateTotals(c);outside=outside||{};return sum(Object.keys(est).filter(function(id){return !outside[id]}),function(id){return est[id].unlisted})}
/* 2.13: the accounts short in the average month, so a shortfall isn't hidden in the average left over: what each account
   that keeps what's left has over the 12 months from k (month k's arrangement, typical pay, no one-offs), averaged.
   [{id, amount}]; empty when one account keeps what's left (its shortfall is the average left over itself). A top-up's
   shortfall (a float marked short) isn't an account that keeps what's left, so it doesn't count here. 2.16: someone on a
   pattern counts with the pay a month plans on (planPay's estimate, pay each time × n): an extra payday is set aside. */
function averageShort(c,k,pay){var mc=cfgFor(c,k),acc={},ids=[];
  // 2.17 (L9): a typical month (each × n), whatever month k's count, since it stands for all twelve.
  if(hasPatterns(mc)){pay=Object.assign({},pay);var pl=planPay(c,{},k,undefined,{typical:true});mc.people.forEach(function(p){if(pl[p.id]&&pl[p.id].kind==="pattern")pay[p.id]=pl[p.id].used})}
  nextMonths(k,12).forEach(function(x){calc(mc,mNum(x),pay,[]).floats.forEach(function(f){if(f.short)return;if(acc[f.id]==null){acc[f.id]=0;ids.push(f.id)}acc[f.id]+=f.amt/12})});
  return ids.length>1?shortAccounts({floats:ids.map(function(id){return {id:id,amt:acc[id]}})}):[]}

/* 2. Where the money goes: bills by category, biggest first (bills with no category last). 2.14: bills not listed yet
   (rough figures) aren't a category: unlisted {annual, monthly, share, accounts: [{account, monthly}]} (null without
   any), drawn after the categories. annual, monthly and each share include it, so the shares add up to all the bills. */
function byCategory(c){
  var est=estimateTotals(c),ul=arr(c.accounts).filter(function(a){return est[a.id]&&est[a.id].unlisted>0}).map(function(a){return {account:a.id,monthly:est[a.id].unlisted}});
  var groups={},ua=sum(ul,function(u){return u.monthly})*12,total=sum(c.bills,annualCost)+ua;
  c.bills.forEach(function(b){var key=b.category||"",g=groups[key]||(groups[key]={key:key,name:categoryName(key),annual:0,bills:[]});
    g.annual+=annualCost(b);g.bills.push({id:b.id,name:b.name,annual:annualCost(b),monthly:monthlyEquivalent(b),perYear:perYear(b),amount:num(b.amount)})});
  var list=Object.keys(groups).map(function(key){var g=groups[key];g.monthly=g.annual/12;g.share=total>0?g.annual/total:0;
    g.bills.sort(function(a,b){return b.annual-a.annual||String(a.name).localeCompare(String(b.name))});return g});
  list.sort(function(a,b){if(!a.key!==!b.key)return a.key?-1:1;return b.annual-a.annual||a.name.localeCompare(b.name)});
  return {groups:list,annual:total,monthly:total/12,uncategorised:groups[""]?groups[""].bills.length:0,
    unset:c.bills.filter(function(b){return b.category==null}).length,unlisted:ua>0?{annual:ua,monthly:ua/12,share:ua/total,accounts:ul}:null}}

/* 3. Subscriptions and memberships, biggest first. */
function subscriptions(c){
  var bills=c.bills.filter(function(b){return b.category==="subscriptions"||b.category==="memberships"}).map(function(b){return {id:b.id,name:b.name,category:b.category,annual:annualCost(b),monthly:monthlyEquivalent(b),perYear:perYear(b),amount:num(b.amount)}});
  bills.sort(function(a,b){return b.annual-a.annual||String(a.name).localeCompare(String(b.name))});
  var annual=sum(bills,function(b){return b.annual});return {bills:bills,annual:annual,monthly:annual/12}}

/* What goes out in budget month k: bills due that month + spending budgets + savings transfers + one-off payments. 2.14:
   bills include what's not listed yet of any rough figure (also given as unlisted). */
function monthOutgoings(c,months,k){var m=mNum(k),ones=monthOneOffs(months,k).filter(function(o){return o.kind!=="in"});c=cfgFor(c,k,ones);
  // 2.12.1: what goes out of a boarder's own account is theirs, not the household's.
  var out=boarderAccounts(c),home=function(x){return !out[x.account||x.fromAccount]};
  var unlisted=unlistedTotal(c,out),bills=sum(c.bills.filter(function(b){return applies(b,m)&&home(b)}),function(b){return num(b.amount)})+unlisted,budgets=sum(c.budgets.filter(home),function(b){return num(b.amount)}),
    savings=sum(c.savings.filter(home),function(s){return num(s.amount)}),oneOffs=sum(ones,function(o){return num(o.amount)});
  return {k:k,bills:bills,budgets:budgets,savings:savings,oneOffs:oneOffs,oneOffCount:ones.length,total:bills+budgets+savings+oneOffs,unlisted:unlisted}}

/* The 12 budget months the heavy/light and projected float charts show: 3 before k, k itself, and 8 after. */
function chartMonths(k){var out=[];for(var i=-3;i<=8;i++)out.push(shiftMonth(k,i));return out}
/* A month with any typed pay is "actual"; every other month is projected (estimated pay). Pay filled in with the
   estimate when a transfer was ticked (payEstimated) isn't typed. */
function hasTypedPay(months,k){var d=months[k];return !!(d&&typeof d==="object"&&d.pay&&Object.keys(d.pay).some(function(p){return payIsTyped(d,p)}))}

/* 4. Heavy and light months: outgoings for the given budget months (default: the 12 from k). */
function heavyLight(c,months,k,keys){var list=(keys||nextMonths(k,12)).map(function(x){var o=monthOutgoings(c,months,x);o.actual=hasTypedPay(months,x);return o});
  var avg=sum(list,function(x){return x.total})/list.length,hi=list[0],lo=list[0];
  list.forEach(function(x){if(x.total>hi.total+0.004)hi=x;if(x.total<lo.total-0.004)lo=x});
  return {months:list,average:avg,heaviest:hi,lightest:lo,flat:hi.total-lo.total<0.005}}

/* 5. Projected float for the given budget months (default: the 12 from k), from current settings, typed or estimated
   pay and known one-offs. A month with typed pay also has predicted: the float the app showed before pay was typed
   (each person's estimate from earlier months, or usual pay; 2.16: planPay's estimate, so pay each time × n for someone
   on a pattern), or null when there was nothing to predict from.
   2.13: short by the one rule (isShort: any account that keeps what's left ends below zero), with the short accounts
   (shortBy) and whether they're named (named: more than one account keeps what's left, so the total can't say it). */
function projectedFloat(c,months,k,keys){return (keys||nextMonths(k,12)).map(function(x){var ones=monthOneOffs(months,x),r=calc(cfgFor(c,x,ones),mNum(x),payFor(c,months,x),ones),actual=hasTypedPay(months,x);
  return {k:x,float:r.flt,short:isShort(r),shortBy:shortAccounts(r),named:shortNamed(r),oneOffs:ones.length,actual:actual,predicted:actual?predictedFloat(c,months,x):null}})}
function predictedFloat(c,months,k){var pay={},known=true,none={};c.people.forEach(function(p){none[p.id]=null});var pl=planPay(c,months,k,{pay:none});
  // 2.15: usual pay as it was in month k (planPay reads personAt), not as it is now. 2.16: the pay a month plans on (planPay).
  c.people.forEach(function(p){var e=pl[p.id];pay[p.id]=e.used;if(e.kind==="month"&&e.from==null&&!(e.arrived>0))known=false});
  return known&&c.people.length?calcMonth(c,months,k,pay).flt:null}

/* What makes budget month k differ from a plain month: the bills that aren't paid every month that are due then
   (biggest first) and its one-offs, payments out and money in. Spending budgets and savings transfers are the same
   every month, so they never make a month differ. */
function monthExtras(c,months,k){var m=mNum(k),ones=monthOneOffs(months,k),pd=extraPaydays(c,months,k);c=cfgFor(c,k,ones);
  function big(a,b){return b.amount-a.amount||String(a.name).localeCompare(String(b.name))}
  var bills=c.bills.filter(function(b){return perYear(b)<12&&applies(b,m)}).map(function(b){return {name:b.name||"Bill",amount:num(b.amount)}}).sort(big);
  var out=ones.filter(function(o){return o&&o.kind!=="in"}).map(function(o){return {name:o.name||"One-off",amount:num(o.amount)}});
  var inn=ones.filter(function(o){return o&&o.kind==="in"}).map(function(o){return {name:o.name||"One-off",amount:num(o.amount)}});
  var o={k:k,bills:bills,oneOffsOut:out,oneOffsIn:inn,billsTotal:sum(bills,function(b){return b.amount}),outTotal:sum(out,function(o){return o.amount}),inTotal:sum(inn,function(o){return o.amount})};
  if(pd.length)o.paydays=pd;return o}
/* 2.17 (13.2, L12): people with a payday date whose pay for month k isn't typed and whose count isn't the usual:
   [{person, name, m, n, amount (each × the paydays more or fewer than usual)}], in people's order. */
function extraPaydays(c,months,k){var pl=planPay(c,months,k),out=[];
  arr(c.people).forEach(function(p,i){var e=pl[p.id];if(!e||e.layer!==2||e.typed||e.m===e.n)return;
    out.push({person:p.id,name:personName(p,i),m:e.m,n:e.n,amount:r2(e.each*Math.abs(e.m-e.n))})});
  return out}
/* "Car insurance £300.00, Boiler £900.00 (one-off)". withIn adds one-off money in ("Refund +£60.00 (one-off)").
   f formats the amounts (default £; the exports use plain numbers). 2.17: then any paydays more or fewer than usual,
   "Kerry: an extra payday, about £1,560.00 (set aside unless you count it)", "Marc: 3 paydays, not the usual 4". */
function extrasText(e,withIn,f){f=f||fmt;var parts=e.bills.map(function(b){return b.name+" "+f(b.amount)}).concat(e.oneOffsOut.map(function(o){return o.name+" "+f(o.amount)+" (one-off)"}));
  if(withIn)parts=parts.concat(e.oneOffsIn.map(function(o){return o.name+" +"+f(o.amount)+" (one-off)"}));
  arr(e.paydays).forEach(function(x){var d=x.m-x.n;parts.push(x.name+": "+(d>0?(d===1?"an extra payday":d+" extra paydays")+", about "+f(x.amount)+" (set aside unless you count "+(d===1?"it":"them")+")"
    :(x.m?x.m+" payday"+(x.m===1?"":"s"):"no paydays")+", not the usual "+x.n))});
  return parts.join(", ")}

/* 6. Pay and float history: the last 24 months with typed pay, up to k, oldest first. short, shortBy and named as in
   projectedFloat (2.13). 2.16: pay is the pay used (planPay: what was typed, less any extra payday set aside); a
   household with a pattern (now or earlier) also gets setAside {personId: amount set aside, or null when not typed}. */
function payHistory(c,months,k){var ever=patternsEver(c);return typedPayMonths(months,k).slice(-24).map(function(x){var d=months[x],pay={},aside={},r=calcMonth(c,months,x),pl=ever?planPay(c,months,x):null;
  c.people.forEach(function(p){var t=payIsTyped(d,p.id);pay[p.id]=t?(pl?pl[p.id].used:num(d.pay[p.id])):null;aside[p.id]=t&&pl?pl[p.id].setAside:null});
  var o={k:x,pay:pay,float:r.flt,short:isShort(r),shortBy:shortAccounts(r),named:shortNamed(r)};if(ever)o.setAside=aside;return o})}

/* 7. Saved so far: each savings transfer's ticked total (since the first saved month, and this tax year), and how
   consistently it was made. Bills marked as savings are direct debits, counted in each saved month they're due. */
function tickValue(v,fallback){return v==null||v===false?null:typeof v==="number"?v:fallback}
/* Every tick counts towards the totals. "Ticked in X of Y months" counts from when a transfer started: the earlier of
   its "since" month (set when it's added in 2.1 or later) and its first tick, otherwise the first month the app was
   used. A bill marked as savings counts from when it was marked (savingsSince), if known. */
function savedSoFar(c,months,k){
  var used=usedMonths(months,k),ty=taxYear(c.payday,k),items=[];
  function from(start){return used.filter(function(x){return !start||x>=start})}
  // 2.12: transfers and bills ended since still count for the months they were there, at that month's amount.
  allItems(c,"savings").forEach(function(s){var total=0,tyTotal=0,ticked=0,first=null;
    used.forEach(function(x){var sx=itemAt("savings",s,x)||s;var v=tickValue(months[x].done&&months[x].done["s:"+s.id],num(sx.amount));if(v==null)return;if(!first)first=x;total+=v;ticked++;if(inTaxYear(c.payday,x,ty))tyTotal+=v});
    var start=s.since?(first&&first<s.since?first:s.since):null,mine=from(start).filter(function(x){return !s.ended||x<s.ended});
    items.push({id:s.id,name:s.name,kind:"transfer",total:total,taxYear:tyTotal,monthsDone:ticked,monthsSaved:mine.length,consistency:mine.length?ticked/mine.length:null,since:mine[0]||null})});
  allItems(c,"bills").filter(function(b){return b.savings}).forEach(function(b){var total=0,tyTotal=0,due=0,mine=from(b.savingsSince).filter(function(x){return !b.ended||x<b.ended});
    mine.forEach(function(x){var bx=itemAt("bills",b,x);if(!bx||!applies(bx,mNum(x)))return;var v=num(bx.amount);total+=v;due++;if(inTaxYear(c.payday,x,ty))tyTotal+=v});
    items.push({id:b.id,name:b.name,kind:"bill",total:total,taxYear:tyTotal,monthsDone:due,monthsSaved:due,consistency:due?1:null,since:mine[0]||null})});
  return {items:items,taxYear:ty,since:used[0]||null,monthsSaved:used.length,total:sum(items,function(i){return i.total}),taxYearTotal:sum(items,function(i){return i.taxYear})}}

/* 8. Price changes at renewal in the 12 months to today, from each bill's renewal history. The household rate covers
   every bill renewed in that time (unchanged ones count as 0%), comparing yearly cost before and after. */
function priceChanges(c,today){var renewed=[],changes=[];
  c.bills.forEach(function(b){var h=arr(b.history).filter(function(e){if(!e||!validDate(e.on))return false;var d=daysUntil(e.on,today);return d<=0&&d>=-365}).sort(function(x,y){return x.on<y.on?-1:x.on>y.on?1:0});
    if(!h.length)return;var from=num(h[0].from),to=num(h[h.length-1].to),py=perYear(b),item={id:b.id,name:b.name,on:h[h.length-1].on,from:from,to:to,annualFrom:from*py,annualTo:to*py,pct:from>0?(to-from)/from:null};
    renewed.push(item);if(Math.abs(to-from)>0.004)changes.push(item)});
  changes.sort(function(a,b){return Math.abs(b.annualTo-b.annualFrom)-Math.abs(a.annualTo-a.annualFrom)});
  var before=sum(renewed,function(i){return i.annualFrom}),after=sum(renewed,function(i){return i.annualTo});
  return {changes:changes,renewed:renewed.length,rate:before>0?(after-before)/before:null,yearlyChange:after-before}}

/* 9. Accounts that ran short in the last 12 used months up to k. Per account: the top-ups it needed (count, total,
   average, months; from: the account that sent them) and, since 2.13, the months it was left short (short: count, total,
   average, months, and how many of each kind: ended, an account that keeps what's left ended the month below zero;
   cant, a top-up that couldn't be made because the account that would send it had nothing; part, the unsent part of a
   top-up). "ended" counts only when more than one account keeps what's left (floats not marked short; a top-up's
   shortfall is a float too): with one, a short month is the month's own shortfall, which Month by month shows. Most
   months first. */
function topUps(c,months,k){var used=usedMonths(months,k).slice(-12),acc={};
  function get(id,from){var a=acc[id]||(acc[id]={account:id,from:from||null,count:0,total:0,months:[],short:{count:0,total:0,months:[],ended:0,cant:0,part:0}});if(from)a.from=from;return a}
  used.forEach(function(x){var r=calcMonth(c,months,x);
    function left(id,amt,how,from){var s=get(id,from).short;s[how]++;s.total+=amt;if(s.months.indexOf(x)<0){s.count++;s.months.push(x)}}
    r.steps.forEach(function(s){if(s.kind!=="topup")return;var a=get(s.to,s.from);a.count++;a.total+=s.amt;a.months.push(x);if(s.short)left(s.to,s.short,"part",s.from)});
    arr(r.cant).forEach(function(s){left(s.to,s.short,"cant",s.from)});
    if(r.floats.filter(function(f){return !f.short}).length>1)shortAccounts(r).forEach(function(s){if(!s.topup)left(s.id,s.amount,"ended")})});
  var seen=function(a){return a.count+a.short.months.filter(function(x){return a.months.indexOf(x)<0}).length};
  var list=Object.keys(acc).map(function(id){var a=acc[id];a.average=a.count?a.total/a.count:0;a.short.average=a.short.count?a.short.total/a.short.count:0;return a});
  list.sort(function(a,b){return seen(b)-seen(a)||(b.total+b.short.total)-(a.total+a.short.total)});
  return {accounts:list,monthsLooked:used.length}}

/* ---------- reminders: shared by the Reminders tab and the notification schedule ----------
   Bill renewals, your own reminders and dated one-offs, soonest first, with days to go and a status:
   "over" (date passed), "soon" (within its "remind me" lead time) or "later". */
function reminderList(c,months,today){return reminderItems_(c,months,today,false)}
/* withPast: also dated one-offs whose date has gone (reminderList leaves them out; a month's list keeps them). */
function reminderItems_(c,months,today,withPast){var out=[];
  c.bills.forEach(function(b){if(validDate(b.renews))out.push({key:"b:"+b.id,kind:"bill",name:b.name,date:b.renews,lead:b.lead!=null?num(b.lead):30,amount:num(b.amount),note:b.note||"",ref:b})});
  c.reminders.forEach(function(r){if(validDate(r.date))out.push({key:"r:"+r.id,kind:"rem",name:r.name,date:r.date,lead:r.lead!=null?num(r.lead):30,amount:null,note:r.note||"",yearly:!!r.yearly,ref:r})});
  Object.keys(months).forEach(function(k){arr(months[k]&&months[k].oneOffs).forEach(function(o){if(o&&validDate(o.date)&&(withPast||daysUntil(o.date,today)>=0))out.push({key:"o:"+k+":"+o.id,kind:"oneoff",name:o.name||"One-off",date:o.date,lead:7,amount:num(o.amount),note:"",month:k,ref:o})})});
  out.forEach(function(it){it.days=daysUntil(it.date,today);it.status=it.days<0?"over":it.days<=it.lead?"soon":"later"});
  out.sort(function(x,y){return x.date<y.date?-1:x.date>y.date?1:0});return out}
/* The dates a budget month's money has to cover: from the payday that funds month k (inclusive) to the day before the
   payday that funds k+1. Without a payday set, the calendar month. Both ends "YYYY-MM-DD", inclusive. */
function monthWindow(pc,k){var a=paydayFor(pc,k),b=a&&paydayFor(pc,shiftMonth(k,1));
  if(!a||!b){var q=k.split("-").map(Number);return {from:k+"-01",to:ymd(q[0],q[1],dim(q[0],q[1]))}}
  return {from:a,to:addDays(b,-1)}}
/* Reminders whose date falls in budget month k's window: bill renewals, your own reminders and dated one-offs (from any
   month's list, including ones whose date has passed, with status "past"), sorted by date. days and status still count
   from today. */
function remindersInMonth(c,months,k,today){var w=monthWindow(c.payday,k);
  return reminderItems_(c,months,today,true).filter(function(it){return it.date>=w.from&&it.date<=w.to})
    // A one-off whose date has gone has simply happened (it's in that month's transfers): "past", not overdue.
    .map(function(it){if(it.kind==="oneoff"&&it.days<0)it.status="past";return it})}
/* What to do about a reminder: the user's own note, otherwise a suggestion from its name. */
function reminderAction(c,it){var n=(it.name||"").toLowerCase(),acc=function(id){var a=accById(c,id);return a?a.name||"Unnamed account":"Missing account"};
  if(it.kind==="oneoff")return (it.ref.kind==="in"?"Money expected into "+acc(it.ref.account):"One-off payment from "+acc(it.ref.account))+". It's included in the "+mLabel(it.month)+" transfers.";
  if(it.status==="over"&&it.kind==="bill")return "This date has passed. It has probably renewed, so check the new price and set the next renewal date.";
  if(it.status==="over"&&/mot/.test(n))return "This date has passed. It's illegal to drive without a valid MOT, so book one now if it isn't done. If it is done, mark it as renewed.";
  if(it.status==="over"&&it.kind==="rem")return "This date has passed. If it's done, "+(it.yearly?"mark it as renewed to move it on a year.":"tap Done to clear it.");
  if(/mortgage|fixed rate|remortgage/.test(n))return "Your fixed deal ends. Compare deals and book a new rate. Lenders usually let you lock one in a few months ahead.";
  if(/\bmot\b/.test(n))return "Book the MOT. You can have it done up to a month (minus a day) early and keep the same renewal date.";
  if(/insur|\bins\b|life|cover|health|aviva|axa|admiral|direct line|esure|\blv\b/.test(n))return "Get quotes before it renews automatically. Renewal prices are often higher than new-customer prices.";
  if(/energy|gas|electric|tariff|octopus|\bedf\b|e\.?on|\bovo\b/.test(n))return "Your fixed tariff ends. Compare tariffs and pick a new one before it moves to a variable rate.";
  if(/broadband|internet|phone|mobile|\bsim\b|media|virgin|\bsky\b|\bbt\b|talktalk|vodafone|\bee\b|\bo2\b|giffgaff|smarty/.test(n))return "Your contract ends. Ask for a better deal or switch, because out-of-contract prices often jump.";
  if(/gym|leisure|membership|netflix|disney|spotify|prime|subscription|streaming/.test(n))return "It renews soon. Check you still use it and what the new price will be.";
  return "Check the price and decide whether to renew."}

/* ---------- reminder notifications ----------
   The page works out what to notify for the next `days` days (default 90) and hands the list to the Android app, which
   posts each entry on its date. key is unique per item per day, so nothing is notified twice. Amounts are only included
   when c.notify.amounts is on (notifications can show on the lock screen).
   (a) "Payday tomorrow", the day before each payday, with the number of transfers for the month it pays for (and, with
       amounts, what's expected to be left over and any account that will be short). 2.16: "Transfer day tomorrow" when
       anyone is on a pattern (dayWord), and its text "Fri 30 Oct 2026 is for November 2026. …".
   (b) Each bill renewal and reminder on the day it becomes "due soon" (its remind-me lead time) and on the day itself.
   (c) Each dated one-off, the day before.
   Each entry also carries late: {title, text}, worded for the following day, which the app uses if Android delays
   its daily check past midnight (it can for apps that aren't opened often). */
function notificationSchedule(c,months,today,days){days=days||90;var end=addDays(today,days-1),out=[],seen={},amounts=!!(c.notify&&c.notify.amounts);
  function add(date,item,title,text,late){if(date<today||date>end)return;var key=item+"@"+date;if(seen[key])return;seen[key]=1;out.push({date:date,key:key,title:title,text:text,late:late})}
  var pc=c.payday||{};
  if(pc.day){var m0=today.slice(0,7);for(var i=0;i<=4;i++){var pk=shiftMonth(m0,i),q=pk.split("-").map(Number),pd=paydayIn(pc,q[0],q[1]);if(!pd)continue;
    var bm=budgetMonthOfPay(pc,pk),r=calcMonth(c,months,bm),n=r.steps.length;
    // 2.13: with more than one account keeping what's left, a short one is named as the Pay tab's top card names it.
    var short=amounts&&shortNamed(r)&&isShort(r)?"; "+listAnd(shortAccounts(r).map(function(s){var a=accById(c,s.id);return ((a&&String(a.name||"").trim())||"Unnamed account")+" is short by "+fmt(s.amount)})):"";
    // 2.16 (E14): a household with a pattern has a transfer day, which "is for" its month.
    var pat=hasPatterns(c),body=(pat?" is for ":" pays for ")+mLabel(bm)+". "+(n?n+" transfer"+(n===1?"":"s")+" to make.":"No transfers needed.")+(amounts?" Expected left over "+fmt(r.flt)+short+".":"");
    add(addDays(pd,-1),"pay:"+pd,dayWord(c,true)+" tomorrow",DAYS[dow(pd)]+" "+fmtDate(pd)+body,{title:dayWord(c,true)+" today",text:"Today, "+DAYS[dow(pd)]+" "+fmtDate(pd)+","+body})}}
  reminderList(c,months,today).forEach(function(it){var title=(it.name||(it.kind==="oneoff"?"One-off":"Reminder"))+(amounts&&it.amount!=null&&it.kind!=="rem"?" "+(it.kind==="oneoff"&&it.ref.kind==="in"?"+":"")+fmt(it.amount):"");
    var act=reminderAction(c,{kind:it.kind,name:it.name,status:"soon",yearly:it.yearly,ref:it.ref,month:it.month});
    var when=DAYS[dow(it.date)]+" "+fmtDate(it.date);
    if(it.kind==="oneoff"){add(addDays(it.date,-1),it.key,title,"Tomorrow, "+when+". "+act,{title:title,text:"Today, "+when+". "+act});return}
    if(it.days<0)return;
    if(it.lead>0)add(addDays(it.date,-it.lead),it.key,title,"Due soon: "+when+", "+relDays(it.lead)+". "+act,{title:title,text:"Due soon: "+when+", "+relDays(it.lead-1)+". "+act});
    add(it.date,it.key,title,"Today, "+when+". "+act,{title:title,text:"Yesterday, "+when+". "+act})});
  out.sort(function(a,b){return a.date<b.date?-1:a.date>b.date?1:a.key<b.key?-1:a.key>b.key?1:0});
  return out.slice(0,300)}

/* The Pay tab's "Not every month" card: bills that aren't paid every month that are due in budget month k, and those
   due in each of the next n months. Each bill is listed once: at k if it's due then, otherwise at its first month in
   the window. repeats: whether any bill was left out of a later month because it was already listed. */
function notEveryMonth(c,k,n){n=n==null?3:n;var irr=c.bills.filter(function(b){return perYear(b)<12}),seen={},repeats=false;
  function line(b){return {id:b.id,name:b.name,amount:num(b.amount),account:b.account}}
  // 2.12: each month's bills as they are that month (cfgFor).
  function dueIn(x){return cfgFor(c,x).bills.filter(function(b){return perYear(b)<12&&applies(b,mNum(x))}).map(line).sort(function(a,b){return b.amount-a.amount||String(a.name).localeCompare(String(b.name))})}
  var due=dueIn(k);due.forEach(function(b){seen[b.id]=1});
  var coming=[];for(var i=1;i<=n;i++){var x=shiftMonth(k,i),all=dueIn(x),list=all.filter(function(b){return !seen[b.id]});
    if(list.length<all.length)repeats=true;list.forEach(function(b){seen[b.id]=1});
    if(list.length)coming.push({k:x,bills:list,total:sum(list,function(b){return b.amount})})}
  return {any:irr.length>0,due:due,dueTotal:sum(due,function(b){return b.amount}),coming:coming,repeats:repeats}}

/* Clean axis ticks (about n of them) covering lo..hi. Tiny or zero ranges are widened first, and the number of
   ticks is capped, so odd values can never stall the page. */
function niceTicks(lo,hi,n){lo=r2(lo);hi=r2(hi);if(!isFinite(lo)||!isFinite(hi)){lo=0;hi=1}
  if(hi-lo<0.01){var pd=Math.max(1,Math.abs(lo)*0.1);lo-=pd;hi+=pd}
  var span=hi-lo,step=Math.pow(10,Math.floor(Math.log10(span/n))),err=span/n/step;
  if(err>=7.5)step*=10;else if(err>=3.5)step*=5;else if(err>=1.5)step*=2;
  var a=Math.floor(lo/step)*step,count=Math.min(20,Math.round((Math.ceil(hi/step)*step-a)/step)),t=[];
  for(var i=0;i<=count;i++)t.push(Math.round((a+i*step)*100)/100);return t}
