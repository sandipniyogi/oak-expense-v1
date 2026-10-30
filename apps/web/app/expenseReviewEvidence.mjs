// Alipay/WeChat capture stays unchanged; manual capture records review evidence.
export function expenseReviewEvidence({captureMode,savedData,filename,form,aiReview,at=new Date().toISOString()}){
 if(captureMode!=='manual')return {...(savedData||{})};
 const original={source:'manual',payment_source:'other_app',original_filename:filename||null};
 if(savedData?.lines)original.receipt_ocr={...savedData};
 return {...original,human_review:{purpose:form.description,final_fields:{...form},confirmed_at:at,ai_review:aiReview||null}};
}
