import test from 'node:test';
import assert from 'node:assert/strict';
import {expenseReviewEvidence} from '../app/expenseReviewEvidence.mjs';
test('Alipay/WeChat OCR evidence is unchanged, without mandatory AI/human metadata',()=>{
 const original={amount:'100',category_suggestion:'Cleaning',lines:['receipt text']};
 assert.deepEqual(expenseReviewEvidence({captureMode:'ocr',savedData:original,form:{description:''},aiReview:null}),original);
});
test('manual capture preserves OCR, AI suggestion and final human correction separately',()=>{
 const savedData={amount:'100',lines:['receipt text']};const aiReview={input:{amount:'100'},result:{category:{id:'clean'}}};const form={amount:'10',category_id:'food',description:'Lemons for cocktails'};
 const result=expenseReviewEvidence({captureMode:'manual',filename:'receipt.png',savedData,form,aiReview,at:'now'});
 assert.equal(result.receipt_ocr.amount,'100');assert.equal(result.human_review.final_fields.amount,'10');assert.equal(result.human_review.ai_review.result.category.id,'clean');assert.equal(result.human_review.purpose,'Lemons for cocktails');assert.equal(savedData.human_review,undefined);
 form.amount='999';assert.equal(result.human_review.final_fields.amount,'10');
});
test('manual capture can save purpose and confirmation when AI is offline',()=>{
 const result=expenseReviewEvidence({captureMode:'manual',filename:'payment.png',form:{description:'Bar supplies'},aiReview:null,at:'now'});
 assert.equal(result.source,'manual');assert.equal(result.human_review.ai_review,null);
});
