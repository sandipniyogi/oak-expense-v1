import test from 'node:test';import assert from 'node:assert/strict';import {reviewSpending} from '../src/spending-review.mjs';
test('local AI receives bounded aggregate facts only, with human review instructions',async()=>{
 let sent;const result=await reviewSpending({categories:[{category:'Supplies',current:'100',previous:'90',currency:'CNY',private_key:'never send'}],receipts:['private']},{model:'local',ollama:async(_url,args)=>{sent=JSON.parse(args.body);return {message:{content:JSON.stringify({summary:'Check quantities.',actions:['Compare unit prices.']})}};}});
 assert.equal(result.actions[0],'Compare unit prices.');assert.doesNotMatch(sent.messages[1].content,/private/);assert.match(sent.messages[0].content,/Never promise savings/);assert.equal(sent.stream,false);
});
