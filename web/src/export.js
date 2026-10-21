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
/* Months with anything saved in them (typed pay, ticks or one-offs), oldest first: the months the exports list. A month
   whose key isn't a real month ("2026-13", which a restore reports and keeps) is left out, as the calculations leave it. */
function savedMonthKeys(months){return Object.keys(months).filter(function(k){var d=months[k];return validMonth(k)&&d&&typeof d==="object"&&
  ((d.pay&&Object.keys(d.pay).some(function(x){return d.pay[x]!=null}))||(d.done&&Object.keys(d.done).some(function(s){return d.done[s]!=null&&d.done[s]!==false}))||(arr(d.oneOffs).length))}).sort()}
/* One saved month as figures: each person's typed pay (null if not typed, or only estimated: payIsTyped), the float, ticks
   done of the transfers, one-offs. 2.13: what people paid into accounts they share that month (shares: [{person, to,
   amt, share, split, set, board}], under the month's own arrangement; split as shareSplit words it) and its short accounts (shortBy, named as in
   projectedFloat). */
function savedMonthRow(c,months,k){var d=months[k]||{},ones=monthOneOffs(months,k),mc=cfgFor(c,k,ones),r=calcMonth(c,months,k),done=d.done||{},out=boarderAccounts(mc);
  var ticked=r.steps.filter(function(s){return done[s.id]!=null&&done[s.id]!==false}).length;
  var shares=r.steps.filter(function(s){return s.kind==="contribute"}).map(function(s){return {person:s.person,to:s.to,amt:s.amt,share:s.share,split:s.set?null:shareSplit(r,s),set:!!s.set,board:!!out[s.from]&&!out[s.to]}});
  return {k:k,pay:c.people.map(function(p){return payIsTyped(d,p.id)?num(d.pay[p.id]):null}),float:r.flt,ticked:ticked,steps:r.steps.length,
    oneOffs:ones,oneOut:sum(ones.filter(function(o){return o&&o.kind!=="in"}),function(o){return num(o.amount)}),oneIn:sum(ones.filter(function(o){return o&&o.kind==="in"}),function(o){return num(o.amount)}),
    shares:shares,shortBy:shortAccounts(r),named:shortNamed(r)}}
/* 2.13: what the report needs to explain beyond pooling: shares (an account paid for by people, now or in an earlier
   arrangement) and board (someone paying board, now or earlier). */
function householdUses(c){var was=arr(c.flows).map(function(e){return (e&&e.was)||{}});
  var shares=arr(c.accounts).some(function(a){return isObj(a.funding)})||was.some(function(w){return isObj(w.accounts)&&Object.keys(w.accounts).some(function(id){return isObj(w.accounts[id].funding)})});
  var board=Object.keys(boarderAccounts(c)).length>0||was.some(function(w){return arr(w.boarders).length>0});
  return {shares:shares,board:board}}
/* A share in words for the report, in the Pay tab's words (contribWords): "Alex 700.00 into Joint account (share, half
   each)", "Alex 580.00 into Joint account (share, 58%)", "Kit 350.00 into Joint account (board)". */
function shareWords(c,s){var p=personById(c,s.person);return ((p&&String(p.name||"").trim())||"Someone")+" "+n2(s.amt)+" into "+accountName(c,s.to)+" ("+(s.board?"board":s.set?"set amount":s.split==="equal"?"equal share":"share, "+s.split)+")"}
/* Who pays into each account paid for by people (the current arrangement), for the report: [[account, person, how]]. */
function paysIntoRows(c){var out=boarderAccounts(c),rows=[];
  c.accounts.forEach(function(a){var f=a.funding;if(!isObj(f))return;var ppl=fundingPeople(c,a.id),set=isObj(f.set)?f.set:{},shared=ppl.filter(function(p){return !set[p.id]&&f.rule!=="set"});
    ppl.forEach(function(p){var v=set[p.id],stays=p.payAccount===a.id,how;
      if(v)how=(out[p.payAccount]?"board, ":"a set amount, ")+(v.pct!=null?v.pct+"% of their pay each month":n2(v.amount)+" a month");
      else if(f.rule==="set")how=stays?"what it still needs (their pay arrives in it)":"nothing set";
      else how="a share, "+ruleWords(f.rule,shared.length)+(stays?" (their pay arrives in it, so their share stays there)":"");
      rows.push([a.name||"Unnamed account",p.name||"Unnamed",how])})});
  return rows}

/* The Markdown report: a preface explaining the model so an AI reads the figures correctly, then the data, then the
   Analysis figures, then the app version. */
function exportMarkdown(c,months,today,o){o=o||{};var k=defaultMonth(c.payday,today),L=[],uses=householdUses(c);
  function h(t){L.push("","## "+t,"")}
  L.push("# Dovetail export, "+fmtDate(today),"");
  // 2.13: the adopted description of what Dovetail is for: one sentence on the job, one on what it doesn't do.
  L.push("This is an export from Dovetail, an offline app for households that run their money across more than one bank account: each payday it works out which transfers to make between the accounts, in what order, so every bill, spending budget and savings transfer is covered, what each person pays into anything they share, and what's left over. It doesn't connect to banks or the internet, track what is actually spent, move money or give financial advice: everything below was typed into the app or is calculated from what was typed. Amounts are in pounds (GBP).","");
  L.push("How Dovetail's figures work:","",
    "- **People** are paid into an account. Their take-home pay is typed in each month from payslips; until it is, the app uses their last typed pay, or their usual pay.",
    "- **Accounts** each have a \"leftover goes to\" account. After an account's own bills, spending budgets and savings transfers are covered, whatever is left moves to that account. If an account can't cover its own outgoings, the account it sends to tops it up. An account that keeps its leftover holds the **float**: what's left once everything is covered.",
    "- **Bills** are paid from an account, either every month or only in the months listed. **Spending budgets** are amounts set aside each month for spending, like food. **Savings transfers** are made by hand each month. **Other income** arrives regularly every month.",
    "- **One-offs** are payments or money in for one particular month only.",
    "- A **budget month** is the month a payday pays for. The payday rule decides which month that is: when the payday is on or after the 15th, it pays for the following month. **Ticks** record which transfers were done in a month, at the amount shown at the time.",
    "- In the Analysis figures, the **average month** spreads bills that aren't paid every month over the year, so it differs from any single month.");
  // 2.13: anything the report shows as short (worked out here so the preface can explain it, whatever the household).
  var keys=savedMonthKeys(months),saved=keys.map(function(x){return savedMonthRow(c,months,x)}),shortCol=saved.some(function(r){return r.named&&r.shortBy.length});
  var pic=monthlyPicture(c,months,k),nowR=calcMonth(c,months,k),next=nextMonths(k,12),pf=projectedFloat(c,months,k,next),pfShort=pf.some(function(x){return x.named&&x.short});
  var tu=topUps(c,months,k),left=tu.accounts.some(function(a){return a.short.count});
  var shortAny=shortCol||pfShort||left||(pic.income>0&&pic.shortBy.length>0)||(shortNamed(nowR)&&isShort(nowR));
  // 2.13: what a household that doesn't simply pool needs explained (nothing is added for one that does, unless
  // something in it is short).
  if(uses.shares)L.push("- **Paid for by**: an account can be paid for by named people, each paying from the account their pay arrives in. These transfers come first. Someone can pay a **set amount** (a fixed sum each month, or a percentage of that month's pay), paid whatever the account needs; what it still needs is shared among the others by the account's rule: half each (or equal shares), in proportion to pay, in proportion to what each has left after their own bills, or so they each keep the same. Someone whose pay arrives in that account pays their share by leaving it there.");
  if(uses.board)L.push("- **Board**: someone who pays board pays a set amount into the household's account and keeps the rest of their pay in their own account. That account is their own money, so it isn't in the household's figures or its float, and their board counts as money coming in.");
  if(uses.shares||uses.board||shortAny)L.push("- **Short**: a month is short when any account that keeps its leftover ends it below zero, even when the float in total is more than zero. Where more than one account keeps its leftover, the figures below name each short account and by how much.");
  if(uses.shares||shortAny)L.push("- **Top-ups** only send what the account sending them has by then, so a top-up can be made only in part, or not at all; the rest stays short.");
  if(arr(c.flows).length)L.push("- **Changes**: the household changed how it manages its money from "+listAnd(c.flows.map(function(e){return mLabel(e.from)}))+". Months before a change keep the arrangement they had: the saved months and Analysis figures use each month's own arrangement, while the Household section below shows the current one.");
  L.push("");
  h("Household");
  L.push("Payday: "+paydayText(c.payday)+".","");
  L.push(mdTable(["Person","Paid into","Usual take-home pay"],c.people.map(function(p){return [p.name||"Unnamed",accountName(c,p.payAccount),n2(p.usualPay)]})));
  var own=boarderAccounts(c);
  L.push(mdTable(["Account","Colour","Leftover goes to"],c.accounts.map(function(a){var up=parentId(c,a.id);return [(a.name||"Unnamed account")+(a.closedFrom?" (closed from "+mShort(a.closedFrom)+")":""),a.colour||"",up?accountName(c,up):own[a.id]?"keeps its leftover (a boarder's own money, not in the float)":"keeps its leftover (float)"]})));
  L.push("Money flow after each account's own bills:","");
  flowLines(c).forEach(function(path){L.push("- "+path.map(function(id){return accountName(c,id)}).join(" → ")+(path.length===1?" (keeps its leftover)":""))});
  var pays=paysIntoRows(c);if(pays.length){L.push("","Paid for by (who pays into which account each month, before anything else moves):","");L.push(mdTable(["Account","Person","Pays"],pays))}
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
  // 2.13: each month's shares and board, and its short accounts, as columns only a household that uses them gets.
  var sharesCol=uses.shares||uses.board;
  L.push(mdTable(["Month"].concat(c.people.map(function(p){return (p.name||"Pay")+" pay"})).concat(["Float","Transfers ticked","One-offs"],sharesCol?["Shares and board"]:[],shortCol?["Short accounts"]:[]),saved.map(function(r){var x=r.k;
    return [mShort(x)].concat(r.pay.map(function(v){return v==null?"not typed":n2(v)})).concat([n2(r.float),r.ticked+" of "+r.steps,
      r.oneOffs.map(function(q){return (q.name||"One-off")+" "+(q.kind==="in"?"+":"-")+n2(q.amount)}).join("; ")],
      sharesCol?[r.shares.map(function(s){return shareWords(c,s)}).join("; ")]:[],shortCol?[r.named?shortWords(c,r.shortBy,n2):""]:[])})));
  if(keys.length)L.push("Pay that wasn't typed is estimated as described above; the float uses it.","");
  h("Analysis");
  L.push("### The average month","",
    "Income "+n2(pic.income)+" a month ("+pic.incomeDetail.people.map(function(p){return (p.name||"Pay")+" "+n2(p.avg)+(p.months?" (average of "+p.months+" typed month"+(p.months===1?"":"s")+")":" (usual pay)")}).join(", ")+(pic.incomeDetail.other?", other income "+n2(pic.incomeDetail.other):"")+(pic.incomeDetail.board?", board "+n2(pic.incomeDetail.board):"")+").","");
  L.push(mdTable(["","A month","Of income"],[["Bills",n2(pic.bills),pctText(pic.income>0?pic.bills/pic.income:null)],["Spending budgets",n2(pic.budgets),pctText(pic.income>0?pic.budgets/pic.income:null)],
    ["Savings (transfers and bills marked as savings)",n2(pic.saving),pctText(pic.savingsRate)],["Average left over",n2(pic.float),pctText(pic.income>0?pic.float/pic.income:null)]]));
  if(pic.income>0&&pic.shortBy.length)L.push("Short in the average month: "+shortWords(c,pic.shortBy,n2)+". The average left over is after that.","");
  L.push("This month ("+mLabel(k)+"): "+n2(nowR.flt)+" left over"+(shortNamed(nowR)&&isShort(nowR)?"; "+shortWords(c,shortAccounts(nowR),n2):"")+".","");
  var cat=byCategory(c);
  L.push("### Bills by category","","Bills cost "+n2(cat.annual)+" a year ("+n2(cat.monthly)+" a month on average).","");
  L.push(mdTable(["Category","A year","A month","Share of bills"],cat.groups.map(function(g){return [g.name,n2(g.annual),n2(g.monthly),pctText(g.share)]})));
  var subs=subscriptions(c);if(subs.bills.length)L.push("Subscriptions and memberships: "+n2(subs.annual)+" a year ("+subs.bills.map(function(b){return b.name}).join(", ")+").","");
  var hl=heavyLight(c,months,k,next);
  L.push("### The next 12 months","","Outgoings are bills due, spending budgets, savings transfers and one-off payments. The projected float uses typed pay where there is some, otherwise estimated pay. \"What's different\" lists the bills not paid every month that are due, and any one-offs. Average outgoings "+n2(hl.average)+".","");
  L.push(mdTable(["Month","Outgoings","Projected float","Pay","What's different"].concat(pfShort?["Short accounts"]:[]),next.map(function(x,i){return [mShort(x),n2(hl.months[i].total),n2(pf[i].float),pf[i].actual?"typed":"estimated",extrasText(monthExtras(c,months,x),true,n2)||"only the monthly bills"].concat(pfShort?[pf[i].named?shortWords(c,pf[i].shortBy,n2):""]:[])})));
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
  // 2.13: accounts left short (as Analysis's "Accounts that ran short" counts them) get their own columns.
  L.push(left?"### Top-ups and accounts left short":"### Top-ups","");
  if(!tu.accounts.length)L.push("_No account needed topping up in the last "+tu.monthsLooked+" month"+(tu.monthsLooked===1?"":"s")+" used._","");
  else if(!left)L.push(mdTable(["Account","Months topped up","Average top-up","Topped up from"],tu.accounts.map(function(a){return [accountName(c,a.account),a.count+" of "+tu.monthsLooked,n2(a.average),accountName(c,a.from)]})));
  else{L.push("An account is left short when it keeps its leftover and ends the month below zero, when a top-up it needed couldn't be made (the account that would send it had nothing by then), or when a top-up was made only in part.","");
    L.push(mdTable(["Account","Months topped up","Average top-up","Topped up from","Months left short","Average shortfall","Why"],tu.accounts.map(function(a){var s=a.short;
      return [accountName(c,a.account),a.count+" of "+tu.monthsLooked,a.count?n2(a.average):"",a.from?accountName(c,a.from):"",s.count+" of "+tu.monthsLooked,s.count?n2(s.average):"",
        [s.ended?"ended below zero "+s.ended+"×":"",s.cant?"top-up couldn't be made "+s.cant+"×":"",s.part?"top-up made only in part "+s.part+"×":""].filter(Boolean).join("; ")]})))}
  L.push("---","","Exported by Dovetail "+(o.version||"")+" (data version "+(c.schema||"")+") on "+today+".");
  return L.join("\n").replace(/\n{3,}/g,"\n\n")+"\n"}

/* CSV: a cell, quoted when needed. Text that a spreadsheet would treat as a formula gets a leading apostrophe. */
function csvCell(v,isText){var s=v==null?"":String(v);if(isText&&/^[=+\-@\t\r]/.test(s))s="'"+s;return /[",\r\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s}
function csvRows(rows){return rows.map(function(r){return r.map(function(x){return csvCell(x.v!==undefined?x.v:x,x.t)}).join(",")}).join("\r\n")+"\r\n"}
function T_(v){return {v:v,t:true}}
/* Two CSV files: every bill (one row each) and every saved month (one row each). 2.13: a household with shares or board
   also gets what each person paid in that month (<name>_pays_in: shares, set amounts and board; the float leaves it
   out), and one where an account was short while another kept money gets short_accounts (the float nets it). */
function exportCsv(c,months,today){
  var bills=[["bill","amount","months_paid","times_a_year","yearly_cost","category","paid_from","renews","savings"]].concat(c.bills.map(function(b){
    return [T_(b.name||""),n2(b.amount),T_(whenText(b)),perYear(b),n2(annualCost(b)),T_(b.category?categoryName(b.category):""),T_(accountName(c,b.account)),validDate(b.renews)?b.renews:"",b.savings?"yes":"no"]}));
  var uses=householdUses(c),saved=savedMonthKeys(months).map(function(k){return savedMonthRow(c,months,k)}),paysCol=uses.shares||uses.board,shortCol=saved.some(function(r){return r.named&&r.shortBy.length});
  var mrows=[["month"].concat(c.people.map(function(p){return T_((p.name||"person")+"_pay")})).concat(["float","transfers_ticked","transfers_total","one_off_payments","one_off_income"],
    paysCol?c.people.map(function(p){return T_((p.name||"person")+"_pays_in")}):[],shortCol?["short_accounts"]:[])].concat(saved.map(function(r){
    return [r.k].concat(r.pay.map(function(v){return v==null?"":n2(v)})).concat([n2(r.float),r.ticked,r.steps,n2(r.oneOut),n2(r.oneIn)],
      paysCol?c.people.map(function(p){return n2(sum(r.shares.filter(function(s){return s.person===p.id}),function(s){return s.amt}))}):[],shortCol?[T_(r.named?shortWords(c,r.shortBy,n2):"")]:[])}));
  return {bills:{name:"dovetail-bills-"+today+".csv",text:csvRows(bills)},months:{name:"dovetail-months-"+today+".csv",text:csvRows(mrows)}}}

/* "Share" on the Pay tab (2.7): the month's transfers as plain text, in order, to send to the other person.
   k = the month on screen, r = calc()'s result for it, done = its ticks ({stepId: amount}), payInfo = {estimated:
   [names of people whose pay is estimated]}. */
function transfersText(c,k,r,done,payInfo){done=done||{};var pd=paydayFor(c.payday,k),L=[],est=arr(payInfo&&payInfo.estimated);
  L.push("Dovetail transfers for "+mLabel(k)+(pd?" (payday "+DAYS[dow(pd)]+" "+fmtDate(pd)+")":""));
  r.steps.forEach(function(s,i){var d=done[s.id],ticked=d!=null&&d!==false,diff=ticked&&typeof d==="number"?r2(s.amt)-d:0;
    // Ticked at a different amount (pay typed since, say): the difference still has to be sent, as the Pay tab says.
    var changed=Math.abs(diff)>0.004?" (ticked at "+fmt(Math.abs(d))+": "+fmt(Math.abs(diff))+(diff>0?" more to send)":" less now)"):"";
    L.push((i+1)+". "+(ticked?"\u2611":"\u2610")+" "+accountName(c,s.from)+" \u2192 "+(s.to?accountName(c,s.to):s.toText||"Savings")+"  "+fmt(Math.abs(s.amt))+(s.kind==="topup"?" (top-up)":s.kind==="contribute"?" ("+contribLabel(c,r,s)+")":"")+changed)});
  if(!r.steps.length)L.push("No transfers needed this month.");
  if(r.floats.length>1)r.floats.forEach(function(f){L.push((r2(f.amt)<0?"Short in ":"Left over in ")+accountName(c,f.id)+": "+fmt(Math.abs(f.amt)))});
  else if(r.floats.length)L.push((r2(r.flt)<0?"Short this month: ":"Left over this month: ")+fmt(Math.abs(r.flt))+" in "+accountName(c,r.floats[0].id));
  if(est.length)L.push("Amounts use estimated pay for "+listAnd(est)+".");
  return L.join("\n")}
/* A contribution (2.12) in words, as the Pay tab says it (contribWords, 2.13) without its brackets: "Alex's share, half
   each", "Alex's share, 60%", "Kit's board" or "Alex's set amount". r = calc's result for the month. */
function contribLabel(c,r,s){return contribWords(c,r,s).replace(/ \(([^()]*)\)$/,", $1")}
/* "Send an update for the other phone" (2.10; a choice of its own since 2.10.1): an update file (the whole backup) with the
   transfers as its message. today = "YYYY-MM-DD". */
function updateFileName(today){return "Dovetail-update-"+fmtDate(today).replace(/ /g,"-")+".json"}
function updateText(transfers){return transfers+"\n\nTap the file to update Dovetail on your phone."}

/* "Send feedback" (2.9): an email to the support address with the app details (version and device facts only, never
   names or amounts). In the app the email app opens through the bridge; in a browser, through the mailto link. */
var FEEDBACK_EMAIL="dovetail.feedback@gmail.com";
function feedbackMail(details,version){var subject="Dovetail "+(version?version+" ":"")+"feedback",
  body="What happened, or your idea:\n\n\n\nApp details (no names or amounts):\n"+(details||"");
  return {to:FEEDBACK_EMAIL,subject:subject,body:body,
    mailto:"mailto:"+FEEDBACK_EMAIL+"?subject="+encodeURIComponent(subject)+"&body="+encodeURIComponent(body.replace(/\n/g,"\r\n"))}}
