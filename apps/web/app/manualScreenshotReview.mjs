// OCR reads the manual screenshot; the text-only AI never receives image bytes.
export async function manualScreenshotReview({api,file,existing,request=fetch}){
 if(Array.isArray(existing?.lines))return {ocr:existing,warning:''};
 if(!file)return {ocr:existing||null,warning:'No readable screenshot text is available. AI will use only the details and purpose you entered.'};
 try{
  const body=new FormData();body.append('file',file);
  const response=await request(`${api}/ocr`,{method:'POST',body,signal:AbortSignal.timeout(130000)});
  if(!response.ok)throw Error('OCR unavailable');
  const data=await response.json();
  if(!data.image_path)throw Error('No attachment returned');
  return {ocr:data,warning:Array.isArray(data.lines)&&data.lines.length?'':'No readable text was found. AI will use only the details and purpose you entered.'};
 }catch{return {ocr:existing||null,warning:'The screenshot could not be read. AI will use only the details and purpose you entered; check the image manually.'};}
}
export function readableSuggestions(ocr){
 const values=[];
 if(ocr?.amount!=null&&Number.isFinite(Number(ocr.amount))&&Number(ocr.amount)>0)values.push({field:'amount',label:'Amount',value:String(ocr.amount)});
 if(typeof ocr?.merchant==='string'&&ocr.merchant.trim())values.push({field:'merchant',label:'Vendor',value:ocr.merchant.trim()});
 if(typeof ocr?.expense_date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(ocr.expense_date))values.push({field:'expense_date',label:'Date',value:ocr.expense_date});
 if(['wechat','alipay','cash','card','other'].includes(ocr?.payment_method))values.push({field:'payment_method',label:'Payment method',value:ocr.payment_method});
 return values;
}
export function manualReviewIsCurrent(review,form){
 if(!review)return false;
 const accepted={...review.input,category_id:form.category_id};
 for(const item of review.screenshot_fields||[]){
  if(String(form[item.field])===String(item.value))accepted[item.field]=form[item.field];
 }
 return JSON.stringify(accepted)===JSON.stringify(form);
}
