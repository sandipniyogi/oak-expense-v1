import test from 'node:test';
import assert from 'node:assert/strict';
import {manualScreenshotReview,readableSuggestions,manualReviewIsCurrent} from '../app/manualScreenshotReview.mjs';
test('manual screenshot OCR is attached and returned without changing entered fields',async()=>{
 let calls=0;const result=await manualScreenshotReview({api:'/api',file:new File(['image'],'receipt.png'),request:async(url,options)=>{calls++;assert.equal(url,'/api/ocr');assert.ok(options.body.get('file'));return new Response(JSON.stringify({image_path:'stored',amount:23,lines:['receipt']}));}});
 assert.equal(calls,1);assert.equal(result.ocr.image_path,'stored');assert.equal(result.warning,'');
});
test('already-read screenshot is reused',async()=>{
 const old={image_path:'old',lines:['text']};const result=await manualScreenshotReview({api:'/api',existing:old,request:()=>{throw Error('must not upload');}});assert.equal(result.ocr,old);
});
test('OCR failure falls back explicitly to human explanation',async()=>{
 const result=await manualScreenshotReview({api:'/api',file:new File(['image'],'receipt.png'),request:async()=>{throw Error('offline');}});assert.equal(result.ocr,null);assert.match(result.warning,/could not be read/);
});
test('only supported screenshot suggestions can be applied',()=>{
 const suggestions=readableSuggestions({amount:'not a number',merchant:'Shop',expense_date:'bad',payment_method:'unknown',user_id:'invented'});assert.deepEqual(suggestions,[{field:'merchant',label:'Vendor',value:'Shop'}]);
});

test('screenshot suggestions can be accepted one by one; arbitrary evidence edits mark review stale',()=>{
 const review={input:{amount:'',merchant:'',category_id:'',description:'Bar ingredients'},screenshot_fields:[{field:'amount',value:'10'},{field:'merchant',value:'Shop'}]};
 assert.equal(manualReviewIsCurrent(review,{...review.input,amount:'10'}),true);
 assert.equal(manualReviewIsCurrent(review,{...review.input,amount:'10',merchant:'Shop',category_id:'food'}),true);
 assert.equal(manualReviewIsCurrent(review,{...review.input,amount:'999'}),false);
 assert.equal(manualReviewIsCurrent(review,{...review.input,description:'New purpose'}),false);
});
