/* Dovetail: exports for analysis elsewhere (Settings › Backup, export & restore). Pure functions only; also loaded by the
   unit tests. Every figure comes from the same functions the app uses (calc.js, analysis.js): nothing is estimated
   here that the app doesn't show. c = settings, months = saved months, today = "YYYY-MM-DD",
   o = {version: the app version}. */

/* Amounts as plain numbers with two decimals: 1234.5 → "1234.50", −3 → "-3.00". */
function n2(x){var v=r2(num(x));return (Object.is(v,-0)?0:v).toFixed(2)}
function pctText(x){return x==null?"":(Math.round(x*1000)/10).toFixed(1)+"%"}
/* A Markdown table cell: no pipes or line breaks inside. */
function mdCell(v){return String(v==null?"":v).replace(/\r?\n/g," ").replace(/\|/g,"\\|").trim()}
/* Columns of numbers are right-aligned; everything else is left-aligned. */
function mdTable(head,rows){if(!rows.length)return "_None._\n";
  var numeric=head.map(function(h,i){var any=false;return rows.every(function(r){var v=String(r[i]==null?"":r[i]);if(v==="")return true;any=true;return /^-?\d+(\.\d+)?%?$/.test(v)})&&any});
  return "| "+head.map(mdCell).join(" | ")+" |\n|"+head.map(function(h,i){return numeric[i]?" ---: |":" --- |"}).join("")+"\n"+
    rows.map(function(r){return "| "+r.map(mdCell).join(" | ")+" |"}).join("\n")+"\n"}
function accountName(c,id){var a=accById(c,id);return a?(a.name||"Unnamed account"):"(missing account)"}
function paydayText(pc){pc=pc||{};if(!pc.day)return "not set";
  if(pc.day==="last")return "the last working day of the month";
  return ordinal(Number(pc.day))+" of the month"+(pc.weekend!==false?" (the Friday before if it falls on a weekend)":"")}
/* Months with anything saved in them (typed pay, ticks or one-offs), oldest first: the same months as "Saved months". */
function savedMonthKeys(months){return Object.keys(months).filter(function(k){var d=months[k];return /^\d{4}-\d{2}$/.test(k)&&d&&typeof d==="object"&&
  ((d.pay&&Object.keys(d.pay).some(function(x){return d.pay[x]!=null}))||(d.done&&Object.keys(d.done).some(function(s){return d.done[s]!=null&&d.done[s]!==false}))||(arr(d.oneOffs).length))}).sort()}
/* One saved month as figures: each person's typed pay (null if not typed, or only estimated: payIsTyped), the float, ticks
   done of the transfers, one-offs. */
function savedMonthRow(c,months,k){var d=months[k]||{},r=calc(c,mNum(k),payFor(c,months,k),monthOneOffs(months,k)),done=d.done||{};
  var ticked=r.steps.filter(function(s){return done[s.id]!=null&&done[s.id]!==false}).length,ones=monthOneOffs(months,k);
  return {k:k,pay:c.people.map(function(p){return payIsTyped(d,p.id)?num(d.pay[p.id]):null}),float:r.flt,ticked:ticked,steps:r.steps.length,
    oneOffs:ones,oneOut:sum(ones.filter(function(o){return o&&o.kind!=="in"}),function(o){return num(o.amount)}),oneIn:sum(ones.filter(function(o){return o&&o.kind==="in"}),function(o){return num(o.amount)})}}

/* The Markdown report: a preface explaining the model so an AI reads the figures correctly, then the data, then the
   Analysis figures, then the app version. */
function exportMarkdown(c,months,today,o){o=o||{};var k=defaultMonth(c.payday,today),L=[];
  function h(t){L.push("","## "+t,"")}
  L.push("# Dovetail export, "+fmtDate(today),"");
  L.push("This is an export from Dovetail, a personal app that works out the money transfers a household makes between its bank accounts each payday. It has no bank connection: everything below was typed into the app or is calculated from what was typed. Amounts are in pounds (GBP).","");
  L.push("How Dovetail's figures work:","",
    "- **People** are paid into an account. Their take-home pay is typed in each month from payslips; until it is, the app uses their last typed pay, or their usual pay.",
    "- **Accounts** each have a \"leftover goes to\" account. After an account's own bills, spending budgets and savings transfers are covered, whatever is left moves to that account. If an account can't cover its own outgoings, the account it sends to tops it up. An account that keeps its leftover holds the **float**: what's left once everything is covered.",
    "- **Bills** are paid from an account, either every month or only in the months listed. **Spending budgets** are amounts set aside each month for spending, like food. **Savings transfers** are made by hand each month. **Other income** arrives regularly every month.",
    "- **One-offs** are payments or money in for one particular month only.",
    "- A **budget month** is the month a payday pays for. The payday rule decides which month that is: when the payday is on or after the 15th, it pays for the following month. **Ticks** record which transfers were done in a month, at the amount shown at the time.",
    "- In the Analysis figures, the **average month** spreads bills that aren't paid every month over the year, so it differs from any single month.","");
  h("Household");
  L.push("Payday: "+paydayText(c.payday)+".","");
  L.push(mdTable(["Person","Paid into","Usual take-home pay"],c.people.map(function(p){return [p.name||"Unnamed",accountName(c,p.payAccount),n2(p.usualPay)]})));
  L.push(mdTable(["Account","Colour","Leftover goes to"],c.accounts.map(function(a){var up=parentId(c,a.id);return [a.name||"Unnamed account",a.colour||"",up?accountName(c,up):"keeps its leftover (float)"]})));
  L.push("Money flow after each account's own bills:","");
  flowLines(c).forEach(function(path){L.push("- "+path.map(function(id){return accountName(c,id)}).join(" → ")+(path.length===1?" (keeps its leftover)":""))});
  h("Bills");
  L.push(mdTable(["Bill","Amount","Months paid","Times a year","Category","Paid from","Renews","Savings","Price history"],c.bills.map(function(b){
    var hist=arr(b.history).filter(function(e){return e&&validDate(e.on)}).map(function(e){return e.on+": "+n2(e.from)+" → "+n2(e.to)}).join("; ");
    return [b.name||"Unnamed",n2(b.amount),whenText(b),perYear(b),b.category?categoryName(b.category):"",accountName(c,b.account),validDate(b.renews)?b.renews:"",b.savings?"yes":"",hist]})));
  h("Spending budgets");
  L.push(mdTable(["Budget","Amount a month","Spent from"],c.budgets.map(function(b){return [b.name||"Budget",n2(b.amount),accountName(c,b.account)]})));
  h("Savings transfers");
  L.push(mdTable(["Transfer","Amount a month","Sent from","Since"],c.savings.map(function(s){return [s.name||"Savings",n2(s.amount),accountName(c,s.fromAccount),s.since?mShort(s.since):""]})));
  h("Other income");
  L.push(mdTable(["Income","Amount a month","Paid into"],c.income.map(function(i){return [i.name||"Income",n2(i.amount),accountName(c,i.account)]})));
  h("Saved months");
  var keys=savedMonthKeys(months);
  L.push(mdTable(["Month"].concat(c.people.map(function(p){return (p.name||"Pay")+" pay"})).concat(["Float","Transfers ticked","One-offs"]),keys.map(function(x){var r=savedMonthRow(c,months,x);
    return [mShort(x)].concat(r.pay.map(function(v){return v==null?"not typed":n2(v)})).concat([n2(r.float),r.ticked+" of "+r.steps,
      r.oneOffs.map(function(q){return (q.name||"One-off")+" "+(q.kind==="in"?"+":"-")+n2(q.amount)}).join("; ")])})));
  if(keys.length)L.push("Pay that wasn't typed is estimated as described above; the float uses it.","");
  h("Analysis");
  var pic=monthlyPicture(c,months,k);
  L.push("### The average month","",
    "Income "+n2(pic.income)+" a month ("+pic.incomeDetail.people.map(function(p){return (p.name||"Pay")+" "+n2(p.avg)+(p.months?" (average of "+p.months+" typed month"+(p.months===1?"":"s")+")":" (usual pay)")}).join(", ")+(pic.incomeDetail.other?", other income "+n2(pic.incomeDetail.other):"")+").","");
  L.push(mdTable(["","A month","Of income"],[["Bills",n2(pic.bills),pctText(pic.income>0?pic.bills/pic.income:null)],["Spending budgets",n2(pic.budgets),pctText(pic.income>0?pic.budgets/pic.income:null)],
    ["Savings (transfers and bills marked as savings)",n2(pic.saving),pctText(pic.savingsRate)],["Average left over",n2(pic.float),pctText(pic.income>0?pic.float/pic.income:null)]]));
  var nowR=calc(c,mNum(k),payFor(c,months,k),monthOneOffs(months,k));
  L.push("This month ("+mLabel(k)+"): "+n2(nowR.flt)+" left over.","");
  var cat=byCategory(c);
  L.push("### Bills by category","","Bills cost "+n2(cat.annual)+" a year ("+n2(cat.monthly)+" a month on average).","");
  L.push(mdTable(["Category","A year","A month","Share of bills"],cat.groups.map(function(g){return [g.name,n2(g.annual),n2(g.monthly),pctText(g.share)]})));
  var subs=subscriptions(c);if(subs.bills.length)L.push("Subscriptions and memberships: "+n2(subs.annual)+" a year ("+subs.bills.map(function(b){return b.name}).join(", ")+").","");
  var next=nextMonths(k,12),hl=heavyLight(c,months,k,next),pf=projectedFloat(c,months,k,next);
  L.push("### The next 12 months","","Outgoings are bills due, spending budgets, savings transfers and one-off payments. The projected float uses typed pay where there is some, otherwise estimated pay. \"What's different\" lists the bills not paid every month that are due, and any one-offs. Average outgoings "+n2(hl.average)+".","");
  L.push(mdTable(["Month","Outgoings","Projected float","Pay","What's different"],next.map(function(x,i){return [mShort(x),n2(hl.months[i].total),n2(pf[i].float),pf[i].actual?"typed":"estimated",extrasText(monthExtras(c,months,x),true,n2)||"only the monthly bills"]})));
  var sv=savedSoFar(c,months,k);
  L.push("### Saved so far","");
  if(!sv.items.length||!sv.monthsSaved)L.push("_Nothing counted yet._","");
  else{L.push("Counted from "+mLabel(sv.since)+" (the first month the app was used) to "+mLabel(k)+": "+n2(sv.total)+" in total, "+n2(sv.taxYearTotal)+" in the "+sv.taxYear.label+" tax year.","");
    L.push(mdTable(["Savings","Total","This tax year","Months"],sv.items.map(function(it){return [it.name||"Savings",n2(it.total),n2(it.taxYear),it.kind==="bill"?it.monthsDone+" (direct debit)":it.monthsDone+" of "+it.monthsSaved+" ticked"]})))}
  var pr=priceChanges(c,today);
  L.push("### Price changes at renewal (last 12 months)","");
  if(!pr.renewed)L.push("_No renewals recorded yet._","");
  else{L.push(pr.renewed+" bill"+(pr.renewed===1?"":"s")+" renewed; yearly cost "+(pr.rate==null?"":"changed by "+pctText(pr.rate)+" ("+n2(pr.yearlyChange)+" a year)")+".","");
    L.push(mdTable(["Bill","Renewed","Before","After","Change"],pr.renewed?pr.changes.map(function(x){return [x.name,x.on,n2(x.from),n2(x.to),x.pct==null?"":pctText(x.pct)]}):[]))}
  var tu=topUps(c,months,k);
  L.push("### Top-ups","");
  if(!tu.accounts.length)L.push("_No account needed topping up in the last "+tu.monthsLooked+" month"+(tu.monthsLooked===1?"":"s")+" used._","");
  else L.push(mdTable(["Account","Months topped up","Average top-up","Topped up from"],tu.accounts.map(function(a){return [accountName(c,a.account),a.count+" of "+tu.monthsLooked,n2(a.average),accountName(c,a.from)]})));
  L.push("---","","Exported by Dovetail "+(o.version||"")+" (data version "+(c.schema||"")+") on "+today+".");
  return L.join("\n").replace(/\n{3,}/g,"\n\n")+"\n"}

/* CSV: a cell, quoted when needed. Text that a spreadsheet would treat as a formula gets a leading apostrophe. */
function csvCell(v,isText){var s=v==null?"":String(v);if(isText&&/^[=+\-@\t\r]/.test(s))s="'"+s;return /[",\r\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s}
function csvRows(rows){return rows.map(function(r){return r.map(function(x){return csvCell(x.v!==undefined?x.v:x,x.t)}).join(",")}).join("\r\n")+"\r\n"}
function T_(v){return {v:v,t:true}}
/* Two CSV files: every bill (one row each) and every saved month (one row each). */
function exportCsv(c,months,today){
  var bills=[["bill","amount","months_paid","times_a_year","yearly_cost","category","paid_from","renews","savings"]].concat(c.bills.map(function(b){
    return [T_(b.name||""),n2(b.amount),T_(whenText(b)),perYear(b),n2(annualCost(b)),T_(b.category?categoryName(b.category):""),T_(accountName(c,b.account)),validDate(b.renews)?b.renews:"",b.savings?"yes":"no"]}));
  var mrows=[["month"].concat(c.people.map(function(p){return T_((p.name||"person")+"_pay")})).concat(["float","transfers_ticked","transfers_total","one_off_payments","one_off_income"])].concat(savedMonthKeys(months).map(function(k){var r=savedMonthRow(c,months,k);
    return [k].concat(r.pay.map(function(v){return v==null?"":n2(v)})).concat([n2(r.float),r.ticked,r.steps,n2(r.oneOut),n2(r.oneIn)])}));
  return {bills:{name:"dovetail-bills-"+today+".csv",text:csvRows(bills)},months:{name:"dovetail-months-"+today+".csv",text:csvRows(mrows)}}}

/* "Share" on the Pay tab (2.7): the month's transfers as plain text, in order, to send to the other person.
   k = the month on screen, r = calc()'s result for it, done = its ticks ({stepId: amount}), payInfo = {estimated:
   [names of people whose pay is estimated]}. */
function transfersText(c,k,r,done,payInfo){done=done||{};var pd=paydayFor(c.payday,k),L=[],est=arr(payInfo&&payInfo.estimated);
  L.push("Dovetail transfers for "+mLabel(k)+(pd?" (payday "+DAYS[dow(pd)]+" "+fmtDate(pd)+")":""));
  r.steps.forEach(function(s,i){var d=done[s.id],ticked=d!=null&&d!==false,diff=ticked&&typeof d==="number"?r2(s.amt)-d:0;
    // Ticked at a different amount (pay typed since, say): the difference still has to be sent, as the Pay tab says.
    var changed=Math.abs(diff)>0.004?" (ticked at "+fmt(Math.abs(d))+": "+fmt(Math.abs(diff))+(diff>0?" more to send)":" less now)"):"";
    L.push((i+1)+". "+(ticked?"\u2611":"\u2610")+" "+accountName(c,s.from)+" \u2192 "+(s.to?accountName(c,s.to):s.toText||"Savings")+"  "+fmt(Math.abs(s.amt))+(s.kind==="topup"?" (top-up)":"")+changed)});
  if(!r.steps.length)L.push("No transfers needed this month.");
  if(r.floats.length>1)r.floats.forEach(function(f){L.push((r2(f.amt)<0?"Short in ":"Left over in ")+accountName(c,f.id)+": "+fmt(Math.abs(f.amt)))});
  else if(r.floats.length)L.push((r2(r.flt)<0?"Short this month: ":"Left over this month: ")+fmt(Math.abs(r.flt))+" in "+accountName(c,r.floats[0].id));
  if(est.length)L.push("Amounts use estimated pay for "+listAnd(est)+".");
  return L.join("\n")}

/* "Send feedback" (2.9): an email to the support address with the app details (version and device facts only, never
   names or amounts). In the app the email app opens through the bridge; in a browser, through the mailto link. */
var FEEDBACK_EMAIL="dovetail.feedback@gmail.com";
function feedbackMail(details,version){var subject="Dovetail "+(version?version+" ":"")+"feedback",
  body="What happened, or your idea:\n\n\n\nApp details (no names or amounts):\n"+(details||"");
  return {to:FEEDBACK_EMAIL,subject:subject,body:body,
    mailto:"mailto:"+FEEDBACK_EMAIL+"?subject="+encodeURIComponent(subject)+"&body="+encodeURIComponent(body.replace(/\n/g,"\r\n"))}}
