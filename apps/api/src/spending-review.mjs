const day=86400000;
export function previousPeriod(from,to){
 const parse=s=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(s||''))throw Error('Choose both start and end dates for spending review.');const d=new Date(s+'T00:00:00Z');if(!Number.isFinite(+d)||d.toISOString().slice(0,10)!==s)throw Error('Choose valid dates.');return +d;};
 const start=parse(from),end=parse(to);if(end<start)throw Error('End date must follow start date.');
 const days=(end-start)/day+1;return {from:new Date(start-days*day).toISOString().slice(0,10),to:new Date(start-day).toISOString().slice(0,10),days};
}
const cents=s=>{const [w,f='']=String(s).split('.');return BigInt(w)*100n+BigInt((f+'00').slice(0,2));};
const money=n=>{const sign=n<0n?'-':'';const v=n<0n?-n:n;return `${sign}${v/100n}.${String(v%100n).padStart(2,'0')}`;};
export function spendingFindings(current,previous){
 const groups=new Map();
 for(const [report,field] of [[current,'current'],[previous,'previous']])for(const g of report.paid_by_category){
  const key=JSON.stringify([g.category_id,g.currency]);if(!groups.has(key))groups.set(key,{category:g.category,currency:g.currency,current:0n,previous:0n});groups.get(key)[field]+=cents(g.total_amount);
 }
 const categories=[...groups.values()].map(g=>({category:g.category,currency:g.currency,current:money(g.current),previous:money(g.previous),change:money(g.current-g.previous),increased:g.current>g.previous,percent:g.previous?Number((g.current-g.previous)*10000n/g.previous)/100:null}));
 const flags=[],seen=new Map();
 for(const row of current.rows){
  const reasons=[];
  if(!String(row.description||'').trim())reasons.push('Missing purpose: explain what was purchased.');
  if(!row.category)reasons.push('No expense category selected.');
  if(!row.merchant)reasons.push('Vendor is missing.');
  const date=String(row.expense_date||'').slice(0,10);
  if(date&&row.merchant){const key=JSON.stringify([date,row.merchant,row.paid_by,row.currency,row.amount]);const prior=seen.get(key);if(prior){reasons.push('Possible repeated payment: same date, vendor, payer and amount. Check both receipts; do not delete automatically.');if(!flags.some(f=>f.id===prior.id))flags.push({id:prior.id,merchant:prior.merchant,amount:prior.amount,reasons:['Possible repeated payment: compare with the other flagged receipt.']});}else seen.set(key,row);}
  if(reasons.length)flags.push({id:row.id,merchant:row.merchant,amount:row.amount,reasons});
 }
 return {categories,flags:flags.slice(0,50),flagged_count:flags.length,details_limited:current.details_limited,checks_scope:`Quality checks cover ${current.rows.length} loaded transactions; category totals cover all matching transactions.`,note:'Higher spending does not prove waste. Review purchases and business needs; payer totals do not measure employee performance. No sales, inventory or budget data is used.'};
}
export function spendingReviewHandler({getReport,request=fetch,env=process.env}){
 return async(req,res)=>{
  let period;try{period=previousPeriod(req.body?.from,req.body?.to);}catch(e){return res.status(400).json({error:e.message});}
  try{
   const filters=Object.fromEntries(['from','to','user_id','category_id','payment_method','amount'].map(k=>[k,req.body?.[k]||'']));
   const [current,previous]=await Promise.all([getReport(filters),getReport({...filters,from:period.from,to:period.to})]);
   const findings=spendingFindings(current,previous);let ai=null,ai_status='Local AI is not enabled here. Calculated findings remain available.';
   if(env.OAK_EXPENSE_AI_ENABLED==='1')try{
    const response=await request(`${String(env.OAK_AI_URL||'http://oak-ai:4400').replace(/\/$/,'')}/spending-review`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({categories:findings.categories.slice(0,80),checks_scope:findings.checks_scope,note:findings.note}),signal:AbortSignal.timeout(125000)});
    const data=await response.json();if(!response.ok||!Array.isArray(data.actions))throw Error();
    ai={summary:String(data.summary||'').slice(0,1500),actions:data.actions.filter(x=>typeof x==='string').slice(0,6).map(x=>x.slice(0,450))};ai_status='Local AI suggestions require your review.';
   }catch{ai_status='Local AI is unavailable or timed out. Calculated findings remain available.';}
   res.json({ok:true,filter:current.filter,previous_period:period,...findings,ai,ai_status});
  }catch(e){res.status(e.status===400?400:500).json({error:e.status===400?e.message:'Spending review could not be calculated. Please retry.'});}
 };
}
