// 2.16's planPay, planPerson and payEstimate, and the helpers they call, copied unchanged from the released 2.16 code
// (`git show f24c62c:web/src/calc.js`: r2, num, arr, isObj, itemWasFor, PERSON_DATED, personWas, personAt, PAY_EVERY,
// PAY_EACH_MAX, validPattern, patternOf, patternsEver, validMonth, personById, payIsTyped, payEstimate, planPay and
// planPerson, from lines 6–728, without their comments), so the
// simulation can check L1 (docs/payperiods.md 13.2): every typed or ticked month gives the same figures on a 2.16 page
// and a 2.17 page, and after a date is removed every month does. Only planPay's own reading of a month is here; the
// transfers are worked out by this version's calcMonth with the pay this copy gives. Don't edit the functions below.
/* eslint-disable */
function r2(x){return Math.round((x+Number.EPSILON)*100)/100}
function num(v){var n=parseFloat(String(v==null?"":v).replace(/[£,\s]/g,""));return isFinite(n)?n:0}
function arr(x){return Array.isArray(x)?x:[]}
function isObj(x){return !!x&&typeof x==="object"&&!Array.isArray(x)}
function itemWasFor(x,k){var w=arr(x&&x.was);for(var i=0;i<w.length;i++)if(w[i]&&w[i].until>=k)return w[i];return null}
var PERSON_DATED=["usualPay","pattern"];
function personWas(p,k){var w=itemWasFor(p,k);if(!w)return p;var y=Object.assign({},p);
  PERSON_DATED.forEach(function(f){if(w[f]!==undefined&&w[f]!==null)y[f]=w[f];else if(f==="pattern")delete y[f]});return y}
function personAt(c,pid,k){var p=personById({people:arr(c&&c.people)},pid);return p?personWas(p,k):null}
var PAY_EVERY={7:{n:4,year:52,word:"week"},14:{n:2,year:26,word:"two weeks"},28:{n:1,year:13,word:"four weeks"}};
var PAY_EACH_MAX=1000000;
function validPattern(x){return isObj(x)&&typeof x.every==="number"&&!!PAY_EVERY[x.every]&&typeof x.each==="number"&&isFinite(x.each)&&r2(x.each)>0&&x.each<=PAY_EACH_MAX}
function patternOf(p){return p&&validPattern(p.pattern)?p.pattern:null}
function patternsEver(c){return arr(c&&c.people).some(function(p){return !!patternOf(p)||arr(p&&p.was).some(function(w){return !!patternOf(w)})})}
function validMonth(k){return typeof k==="string"&&/^\d{4}-(0[1-9]|1[0-2])$/.test(k)}
function personById(c,id){for(var i=0;i<c.people.length;i++)if(c.people[i].id===id)return c.people[i];return null}
function payIsTyped(d,pid){return !!(d&&d.pay&&d.pay[pid]!=null&&!(d.payEstimated&&d.payEstimated[pid]))}
function payEstimate(c,months,pid,k){var p=personAt(c,pid,k),t=patternOf(p);if(t)return {v:r2(t.each*PAY_EVERY[t.every].n),from:null};
  var ever=patternsEver(c),keys=Object.keys(months).filter(function(x){return x<k&&validMonth(x)&&payIsTyped(months[x],pid)&&(!ever||!patternOf(personAt(c,pid,x)))}).sort();
  if(keys.length){var last=keys[keys.length-1];return {v:num(months[last].pay[pid]),from:last}}
  return {v:num(p&&p.usualPay),from:null}}
function planPay(c,months,k,live){months=months||{};var d=isObj(months[k])?months[k]:{},out={};
  if(isObj(live)){d=Object.assign({},d);
    if(live.pay!==undefined){var lp={};if(isObj(live.pay))Object.keys(live.pay).forEach(function(pid){if(live.pay[pid]!=null)lp[pid]=live.pay[pid]});d.pay=lp}
    if(live.extra!==undefined)d.extra=live.extra;if(live.payEstimated!==undefined)d.payEstimated=live.payEstimated}
  arr(c&&c.people).forEach(function(p){out[p.id]=planPerson(c,months,d,p.id,k)});return out}
function planPerson(c,months,d,pid,k){var t=patternOf(personAt(c,pid,k)),has=!!(isObj(d.pay)&&d.pay[pid]!=null),typed=payIsTyped(d,pid);
  var e=has?{v:num(d.pay[pid]),from:k}:payEstimate(c,months,pid,k);
  if(!t)return {kind:"month",arrived:e.v,setAside:0,used:e.v,typed:typed,n:null,each:null,from:e.from};
  var x=isObj(d.extra)?d.extra[pid]:null,aside=typed&&isObj(x)&&x.counted!==true?Math.max(0,num(x.amount)):0;
  return {kind:"pattern",arrived:e.v,setAside:aside,used:aside?Math.max(0,r2(e.v-aside)):e.v,typed:typed,n:PAY_EVERY[t.every].n,each:t.each,from:e.from}}
/* eslint-enable */
/** 2.16's reading of a month: planPay(c, months, k, live) and payEstimate(c, months, pid, k) as 2.16 had them. */
export const V216 = { planPay, planPerson, payEstimate };
