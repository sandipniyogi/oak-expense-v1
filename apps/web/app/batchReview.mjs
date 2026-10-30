import {expenseReviewEvidence} from './expenseReviewEvidence.mjs';
export function batchManual(item){return item.mode==='manual'||(item.mode==null&&Boolean(item.data?.manual));}
export function batchReviewError(item){
 if(!item.form.user_id||!Number.isFinite(Number(item.form.amount))||Number(item.form.amount)<=0)return 'Choose who paid and enter an amount greater than zero.';
 if(batchManual(item)&&!item.form.description.trim())return 'Explain what this manual expense was used for.';
 if(batchManual(item)&&item.confirmedFields!==JSON.stringify(item.form))return 'Review the current fields and tick the confirmation for this screenshot.';
 return '';
}
export function batchPayload(item){
 const manual=batchManual(item);
 return {...item.form,amount:Number(item.form.amount),image_path:item.data.image_path,image_sha256:item.data.image_sha256,ocr_confidence:manual?null:item.data.ocr_confidence,ocr_raw:manual?expenseReviewEvidence({captureMode:'manual',savedData:item.data,filename:item.file.name,form:item.form,aiReview:item.aiReview}):item.data};
}
