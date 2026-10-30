// Opt-in local AI only. This route never inserts/updates an expense.
export function expenseReviewHandler({pool,request=fetch,env=process.env}){
 return async(req,res)=>{
  if(env.OAK_EXPENSE_AI_ENABLED!=='1')return res.status(503).json({error:'Local AI review is not enabled here. You can still enter a purpose and review/save manually.'});
  try{
   const rows=await pool.query('select id,name from categories order by name');
   const body=req.body||{};const raw=body.ocr||{};
   const expense={};for(const key of ['amount','merchant','expense_date','payment_method','category_id','description'])expense[key]=String(body.expense?.[key]??'').slice(0,key==='description'?2000:250);
   const ocr={amount:raw.amount==null?null:String(raw.amount).slice(0,100),merchant:String(raw.merchant??'').slice(0,250),expense_date:String(raw.expense_date??'').slice(0,40),lines:Array.isArray(raw.lines)?raw.lines.slice(0,80).map(x=>String(x).slice(0,250)):[]};
   const base=String(env.OAK_AI_URL||'http://oak-ai:4400').replace(/\/$/,'');
   const response=await request(`${base}/expense-review`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({expense,ocr,categories:rows.rows}),signal:AbortSignal.timeout(125000)});
   const result=await response.json();
   if(!response.ok)return res.status(503).json({error:'Local AI is unavailable or could not review this receipt. You can continue with manual review.'});
   if(result.ok!==true||!Array.isArray(result.warnings))throw Error('Invalid AI response');
   const category=rows.rows.find(c=>c.id===result.category?.id)||null;
   res.json({ok:true,category,model:String(result.model||'local').slice(0,100),reason:String(result.reason||'').slice(0,1200),warnings:result.warnings.filter(x=>typeof x==='string').map(x=>x.slice(0,350)).slice(0,14),human_confirmation_required:true});
  }catch{return res.status(503).json({error:'Local AI is unavailable or timed out. Your expense has not been changed. Continue manual review or try again.'});}
 };
}
