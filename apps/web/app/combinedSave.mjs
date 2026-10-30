// Upload missing evidence before submitting one reviewed combined expense.
export function paymentCents(value){
  const text=String(value??'').trim();
  if(!/^\d+(?:\.\d{1,2})?$/.test(text))return null;
  const [whole,fraction='']=text.split('.');
  const cents=Number(whole)*100+Number((fraction+'00').slice(0,2));
  return Number.isSafeInteger(cents)&&cents>0&&cents<=999999999999?cents:null;
}
export function combinedSummary(parts){
  const values=parts.flatMap(p=>p.amounts.map(paymentCents));
  const total=values.every(n=>n!==null)?values.reduce((a,b)=>a+b,0):null;
  return {count:values.length,total:total!==null&&Number.isSafeInteger(total)&&total<=999999999999?total:null};
}
export function combinedValidation(parts,form){
  if(!parts.length)return 'Choose at least one screenshot.';
  if(parts.length>20)return 'Choose no more than 20 screenshots.';
  for(const [i,p] of parts.entries()){
    if(!p.amounts.length||p.amounts.length>50)return `Screenshot ${i+1}: enter between 1 and 50 payment amounts.`;
    if(p.amounts.some(n=>paymentCents(n)===null))return `Screenshot ${i+1}: enter a positive amount with at most two decimal places for each payment.`;
  }
  const {count,total}=combinedSummary(parts);
  if(count<2)return 'Enter at least two payment amounts overall. Use “Add another amount” if both payments are in one screenshot.';
  if(total===null)return 'The combined total is too large. Review the payment amounts.';
  if(!String(form.merchant??'').trim())return 'Enter the vendor name.';
  if(!form.user_id)return 'Select who paid.';
  if(!form.payment_method)return 'Select the payment method.';
  if(parts.some(p=>p.data?.duplicate))return 'A screenshot is already attached to a saved expense. Remove it or check saved expenses before combining.';
  return '';
}
class CombinedSaveError extends Error{
  constructor(message,outcomeUnknown=false){super(message);this.outcomeUnknown=outcomeUnknown;}
}
async function responseError(response,fallback){
  const data=await response.json().catch(()=>({}));
  return typeof data.error==='string'?data.error:`${fallback} (HTTP ${response.status}).`;
}
export async function saveCombined({api,parts,form,humanReview=null,request=fetch,onPart=()=>{},onProgress=()=>{}}){
  const invalid=combinedValidation(parts,form);
  if(invalid)throw new CombinedSaveError(invalid);
  const ready=[];
  for(const [i,p] of parts.entries()){
    let part=p;
    if(p.status!=='ready'||!p.data?.image_path){
      onProgress(`Attaching screenshot ${i+1} of ${parts.length}…`);
      onPart(p.id,{status:'uploading',error:''});
      try{
        const body=new FormData();body.append('file',p.file);
        const response=await request(`${api}/attachments`,{method:'POST',body});
        if(!response.ok)throw new Error(await responseError(response,'Upload failed'));
        const data=await response.json();
        if(!data.image_path)throw new Error('The server did not return an attachment. Try attaching this screenshot again.');
        part={...p,status:'ready',data,error:''};
        onPart(p.id,{status:'ready',data,error:''});
      }catch(error){
        const message=`Screenshot ${i+1}: ${error.message||'Upload failed'}`;
        onPart(p.id,{status:'error',error:message});
        throw new CombinedSaveError(`${message} No combined expense was submitted. Retry after fixing the upload; completed attachments will be reused.`);
      }
    }
    if(part.data.duplicate)throw new CombinedSaveError(`Screenshot ${i+1} is already attached to a saved expense. No combined expense was submitted. Remove it or check saved expenses.`);
    ready.push(part);
  }
  const payload={...form,parts:ready.map(p=>({amounts:p.amounts,expense_date:p.expense_date,image_path:p.data.image_path,original_filename:p.file.name,ocr_raw:humanReview?{...p.data,combined_human_review:humanReview}:p.data}))};
  onProgress('Saving combined expense…');
  let response;
  try{
    response=await request(`${api}/expenses/combined`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  }catch{
    throw new CombinedSaveError('The save result is unknown because the connection was interrupted. Check saved expenses before trying again; the expense may already be saved.',true);
  }
  if(!response.ok){
    const message=await responseError(response,'Save failed');
    if(response.status>=500)throw new CombinedSaveError(`${message} Check saved expenses before retrying; the save result could not be confirmed.`,true);
    throw new CombinedSaveError(message);
  }
  return {ok:true};
}
