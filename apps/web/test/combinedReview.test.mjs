import test from 'node:test';
import assert from 'node:assert/strict';
import {combinedReviewInput,combinedReviewKey} from '../app/combinedReview.mjs';
const form={description:'Cleaning supplies',category_id:'a',user_id:'payer'};
const parts=[{id:'1',amounts:['10','20'],expense_date:'2026-10-30',data:{image_path:'a',amount:10,lines:['soap']}}];
test('combined evidence retains individual payments without comparing single OCR amount to total',()=>{
 const input=combinedReviewInput(form,parts,3000);assert.equal(input.expense.amount,'30.00');assert.equal(input.ocr.amount,undefined);assert.match(input.ocr.lines[0],/10, 20/);assert.equal(input.ocr.lines[1],'soap');
});
test('accepting category keeps review current; amount, purpose and payer edits invalidate it',()=>{
 const key=combinedReviewKey(form,parts,3000);assert.equal(key,combinedReviewKey({...form,category_id:'b'},parts,3000));
 for(const f of [{...form,user_id:'other'},{...form,description:'Food'}])assert.notEqual(key,combinedReviewKey(f,parts,3000));
 assert.notEqual(key,combinedReviewKey(form,[{...parts[0],amounts:['30']}],3000));
});
test('unread images produce entered context only and evidence is bounded',()=>{
 const input=combinedReviewInput(form,[{amounts:['1'],data:{lines:Array(100).fill('x')}}],null);assert.equal(input.expense.amount,'');assert.equal(input.ocr.lines.length,80);
});
