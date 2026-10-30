// Keep screenshot amounts separate: one OCR amount is never the combined total.
export function combinedReviewInput(form,parts,total){
 return {expense:{...form,amount:total===null?'':(total/100).toFixed(2)},ocr:{lines:parts.flatMap((p,i)=>[
  `Screenshot ${i+1}; entered payments: ${p.amounts.join(', ')}; date: ${p.expense_date||'not entered'}`,
  ...(Array.isArray(p.data?.lines)?p.data.lines:[])
 ]).slice(0,80)}};
}
export function combinedReviewKey(form,parts,total){
 return JSON.stringify({form:{...form,category_id:''},parts:parts.map(p=>({id:p.id,amounts:p.amounts,date:p.expense_date,image:p.data?.image_path,lines:p.data?.lines})),total});
}
