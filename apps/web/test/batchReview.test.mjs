import test from 'node:test';
import assert from 'node:assert/strict';
import {batchManual,batchReviewError,batchPayload} from '../app/batchReview.mjs';
const form={user_id:'sandip',amount:'20',category_id:'food',description:'Lemons for cocktails'};
const item=(overrides={})=>({mode:'manual',form:{...form},file:{name:'receipt.png'},data:{image_path:'receipt',image_sha256:'hash',amount:'200',lines:['receipt']},confirmedFields:JSON.stringify(form),aiReview:{result:{category:{id:'clean'}}},...overrides});
test('manual batch entry requires individual purpose and confirmation',()=>{
 assert.equal(batchReviewError(item()),'');assert.match(batchReviewError(item({confirmedFields:''})),/confirmation/);assert.match(batchReviewError(item({form:{...form,description:''}})),/used for/);
});
test('editing payer/category/amount invalidates only that receipt confirmation',()=>{
 for(const change of [{user_id:'yolanda'},{category_id:'clean'},{amount:'21'}])assert.match(batchReviewError(item({form:{...form,...change}})),/confirmation/);
 assert.equal(batchReviewError(item()),'');
});
test('Alipay/WeChat batch path does not gain manual requirements',()=>{
 const entry=item({mode:'ocr',form:{...form,description:''},confirmedFields:''});assert.equal(batchManual(entry),false);assert.equal(batchReviewError(entry),'');assert.equal(batchPayload(entry).ocr_raw,entry.data);
});
test('batch saved evidence separates OCR amount, AI category and final payer/category/purpose',()=>{
 const payload=batchPayload(item());assert.equal(payload.user_id,'sandip');assert.equal(payload.category_id,'food');assert.equal(payload.description,'Lemons for cocktails');assert.equal(payload.ocr_raw.receipt_ocr.amount,'200');assert.equal(payload.ocr_raw.human_review.ai_review.result.category.id,'clean');assert.equal(payload.ocr_raw.human_review.final_fields.amount,'20');
});
