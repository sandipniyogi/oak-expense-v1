import test from 'node:test';
import assert from 'node:assert/strict';
import {combinedSummary,combinedValidation,saveCombined} from '../app/combinedSave.mjs';
const form={merchant:'Vendor',user_id:'payer',payment_method:'wechat'};
const part=(id,fields={})=>({id,file:new File(['image-'+id],id+'.png',{type:'image/png'}),status:'waiting',amounts:['10.25'],expense_date:'2026-10-28',data:null,...fields});
const response=(data,status=200)=>new Response(JSON.stringify(data),{status});
test('exact cent totals and specific validation',()=>{
 const p=[part('a',{amounts:['0.10','0.20']})];assert.deepEqual(combinedSummary(p),{count:2,total:30});assert.equal(combinedValidation(p,form),'');assert.match(combinedValidation(p,{...form,user_id:''}),/who paid/);assert.match(combinedValidation([part('a')],form),/at least two/);
});
test('manual save attaches first and preserves reviewed amounts and dates',async()=>{
 const calls=[];await saveCombined({api:'/api',parts:[part('a',{amounts:['1','2']})],form,request:async(url,options)=>{calls.push({url,options});return response(url.endsWith('/attachments')?{image_path:'new'}:{},201);}});
 assert.deepEqual(calls.map(c=>c.url),['/api/attachments','/api/expenses/combined']);const payload=JSON.parse(calls[1].options.body);assert.deepEqual(payload.parts[0].amounts,['1','2']);assert.equal(payload.parts[0].expense_date,'2026-10-28');
});
test('mixed save reuses OCR attachment',async()=>{
 let uploads=0;await saveCombined({api:'/api',parts:[part('a',{status:'ready',data:{image_path:'old'}}),part('b')],form,request:async(url)=>{if(url.endsWith('/attachments'))uploads++;return response({image_path:'new'},201);}});assert.equal(uploads,1);
});
test('failed second upload blocks save and retry reuses completed first upload',async()=>{
 let parts=[part('a'),part('b')],fail=true,saves=0,first=0;
 const onPart=(id,fields)=>{parts=parts.map(p=>p.id===id?{...p,...fields}:p);};
 const request=async(url,o)=>{if(url.endsWith('/expenses/combined')){saves++;return response({},201);}if(o.body.get('file').name==='a.png'){first++;return response({image_path:'a'});}if(fail)throw Error('offline');return response({image_path:'b'});};
 await assert.rejects(saveCombined({api:'/api',parts,form,request,onPart}),e=>!e.outcomeUnknown&&/No combined expense was submitted/.test(e.message));assert.equal(saves,0);fail=false;await saveCombined({api:'/api',parts,form,request,onPart});assert.equal(first,1);assert.equal(saves,1);
});
test('upload duplicate blocks final request',async()=>{
 let calls=0;await assert.rejects(saveCombined({api:'/api',parts:[part('a',{amounts:['1','2']})],form,request:async()=>{calls++;return response({image_path:'old',duplicate:{id:'saved'}});}}),/already attached/);assert.equal(calls,1);
});
test('invalid forms and known duplicates send no requests',async()=>{
 const request=()=>{throw Error('Must not request');};await assert.rejects(saveCombined({api:'/api',parts:[part('a')],form,request}),/at least two/);await assert.rejects(saveCombined({api:'/api',parts:[part('a',{amounts:['1','2'],data:{duplicate:true}})],form,request}),/already attached/);
});
test('network/500 failure during final save marks outcome uncertain',async()=>{
 for(const request of [async()=>{throw Error('offline');},async()=>response({error:'Failed'},500)])await assert.rejects(saveCombined({api:'/api',parts:[part('a',{status:'ready',data:{image_path:'old'},amounts:['1','2']})],form,request}),e=>e.outcomeUnknown===true);
});
test('non-JSON 413 gives a useful retryable message',async()=>{
 await assert.rejects(saveCombined({api:'/api',parts:[part('a',{status:'ready',data:{image_path:'old'},amounts:['1','2']})],form,request:async()=>new Response('Too large',{status:413})}),e=>!e.outcomeUnknown&&/HTTP 413/.test(e.message));
});
test('malformed attachment reply prevents final submission',async()=>{
 let calls=0;await assert.rejects(saveCombined({api:'/api',parts:[part('a',{amounts:['1','2']})],form,request:async()=>{calls++;return response({});}}),/did not return an attachment/);assert.equal(calls,1);
});
