'use strict';
const $=id=>document.getElementById(id);
const cloud=window.OAK_QUEUE_CLOUD===true;
const apiBase=cloud?'../api':'/api';
const queueEnv=window.OAK_QUEUE_ENV;
const validQueueEnv=queueEnv==='live'||queueEnv==='staging';
if(validQueueEnv){$('queue-environment').textContent=queueEnv==='live'?'THE OAK LOUNGE · LIVE':'THE OAK LOUNGE · STAGING';document.title=queueEnv==='live'?'Oak LIVE receipt queue':'Oak STAGING receipt queue';}
const queueDbName=queueEnv==='live'?'oak-live-receipt-queue':'oak-staging-receipt-queue';
const queueMetaKey=queueEnv==='live'?'oak-live-queue-meta':'oak-staging-queue-meta';
let db,meta={users:[],categories:[]},metaReady=false,checking=false,syncing=false,installPrompt;
function openDb(){return new Promise((resolve,reject)=>{const r=indexedDB.open(queueDbName,1);r.onupgradeneeded=()=>r.result.createObjectStore('items',{keyPath:'id'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
function tx(mode,op){return new Promise((resolve,reject)=>{const t=db.transaction('items',mode),s=t.objectStore('items');let r;try{r=op(s);}catch(e){reject(e);return;}t.oncomplete=()=>resolve(r?.result);t.onerror=()=>reject(t.error);t.onabort=()=>reject(t.error||new Error('Storage transaction aborted'));});}
const list=()=>tx('readonly',s=>s.getAll());
const put=x=>tx('readwrite',s=>s.put(x));
const del=id=>tx('readwrite',s=>s.delete(id));
const node=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=String(text);if(cls)e.className=cls;return e;};
function button(label,fn,disabled=false,cls=''){const b=node('button',label,cls);b.type='button';b.disabled=disabled;b.addEventListener('click',()=>Promise.resolve(fn()).catch(showError));return b;}
function showError(e){$('connection').textContent=e?.message||'Something went wrong. Your pending items remain on this phone.';}
async function fetchTimeout(url,options={},ms=30000){if(cloud&&url.startsWith('/api/'))url=apiBase+url.slice(4);const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),ms);try{return await fetch(url,{...options,signal:ctl.signal});}finally{clearTimeout(timer);}}
async function jsonResponse(r){const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||`Server error (${r.status})`);return j;}
function field(label,type,value,onChange){const l=node('label',label),el=document.createElement('input');el.type=type;el.value=value||'';el.addEventListener('input',()=>Promise.resolve(onChange(el.value)).catch(showError));l.append(el);return l;}
function selectField(label,value,options,onChange){const l=node('label',label),el=document.createElement('select');for(const [id,name] of options){const o=node('option',name);o.value=id;el.append(o);}el.value=value||'';el.addEventListener('change',()=>Promise.resolve(onChange(el.value)).catch(showError));l.append(el);return l;}
function patchForm(item,key,value){
 return new Promise((resolve,reject)=>{const t=db.transaction('items','readwrite'),store=t.objectStore('items'),get=store.get(item.id);get.onsuccess=()=>{const current=get.result;if(current){current.form={...current.form,[key]:value};store.put(current);item.form=current.form;}};t.oncomplete=()=>resolve();t.onerror=()=>reject(t.error);t.onabort=()=>reject(t.error||new Error('Could not save the field'));});
}
async function render(){
 const items=(await list()).sort((a,b)=>a.created-b.created);$('count').textContent=`${items.length} pending`;$('items').replaceChildren();
 if(!items.length){$('items').append(node('div','No pending receipts.','card empty'));return;}
 for(const item of items){
  const box=node('article',undefined,'item'),head=node('div',undefined,'item-head');head.append(node('strong',item.name),node('span',item.status,'status'));box.append(head);
  const img=document.createElement('img');img.className='preview';img.alt=`Preview: ${item.name}`;const imageUrl=URL.createObjectURL(item.blob);img.src=imageUrl;img.onload=()=>URL.revokeObjectURL(imageUrl);img.onerror=()=>URL.revokeObjectURL(imageUrl);box.append(img);
  if(item.error)box.append(node('p',item.error,'warn'));
  if(item.data?.duplicate)box.append(node('p',`Possible duplicate: ¥${item.data.duplicate.amount}. Check your saved expenses before saving.`,'warn duplicate'));
  if(item.status==='ready'||item.status==='manual_draft'){
    const fields=node('div',undefined,'fields'),f=item.form||{};
    fields.append(field('Amount (CNY)','number',f.amount,v=>patchForm(item,'amount',v)),field('Merchant','text',f.merchant,v=>patchForm(item,'merchant',v)),field('Date','date',f.expense_date,v=>patchForm(item,'expense_date',v)));
    fields.append(selectField('Payment method',f.payment_method,[['','Select'],['wechat','WeChat'],['alipay','Alipay'],['cash','Cash'],['card','Card'],['other','Other app']],v=>patchForm(item,'payment_method',v)));
    fields.append(selectField('Paid by',f.user_id,[['','Select'],...meta.users.map(x=>[x.id,x.name])],v=>patchForm(item,'user_id',v)),selectField('Category',f.category_id,[['','Select'],...meta.categories.map(x=>[x.id,x.name])],v=>patchForm(item,'category_id',v)));
    const desc=field('Description','text',f.description,v=>patchForm(item,'description',v));desc.className='wide';fields.append(desc);
    const reimburse=node('label','Reimbursement required');const check=document.createElement('input');check.type='checkbox';check.checked=!!f.reimbursement_required;check.addEventListener('change',()=>patchForm(item,'reimbursement_required',check.checked).catch(showError));reimburse.append(check);fields.append(reimburse);box.append(fields);
  }
  const actions=node('div',undefined,'actions');
  if(item.status==='ready')actions.append(button('Save expense',()=>saveItem(item.id),false,'primary'));
  if(item.status==='manual_draft')actions.append(button(cloud?'Save when online':'Queue for upload',async()=>{const current=(await list()).find(x=>x.id===item.id);if(!current||current.status!=='manual_draft')return;if(!current.form?.user_id||!Number.isFinite(Number(current.form?.amount))||Number(current.form.amount)<=0){alert('Choose who paid and enter a positive amount before queueing.');return;}current.auto_save=cloud;current.status='manual_queued';current.error='';await put(current);await render();await checkConnection();},false,'primary'));
  if(item.status==='manual_queued')actions.append(button('Edit details',async()=>{const current=(await list()).find(x=>x.id===item.id);if(current?.status==='manual_queued'){current.status='manual_draft';await put(current);await render();}}));
  if(cloud&&item.status==='uncertain')actions.append(button('Retry safe save',()=>saveItem(item.id)));
  if(!cloud&&item.status==='uncertain'){actions.append(button('Confirmed saved — remove from queue',async()=>{if(confirm('Only remove this item if you confirmed the expense exists on your expense server. Remove it from this phone queue?')){await del(item.id);await render();}}));actions.append(button('Confirmed not saved — retry save',async()=>{if(confirm('Only retry if you checked the Mac and confirmed the expense was NOT saved. Allow another save attempt?')){item.status='ready';item.error='';await put(item);await render();}}));}
  if(item.status==='error')actions.append(button('Retry reading',async()=>{item.status=item.mode==='manual'?'manual_queued':'queued';item.error='';await put(item);await render();await checkConnection();}));
  if(!['reading','saving','uncertain'].includes(item.status))actions.append(button('Remove from queue',async()=>{if(confirm('Remove this item from the phone queue? Its original gallery image stays on your phone.')){await del(item.id);await render();}}));
  box.append(actions);$('items').append(box);
 }
}
async function refreshMeta(){meta=await jsonResponse(await fetchTimeout('/api/meta'));try{localStorage.setItem(queueMetaKey,JSON.stringify(meta));}catch{}}
async function syncQueue(){
 if(syncing)return;
 if(!navigator.locks){$('connection').textContent='Use Chrome with Web Locks to safely process the phone queue.';return;}
 await navigator.locks.request('oak-phone-queue-ocr',{ifAvailable:true},async lock=>{if(!lock)return;await syncQueueLocked();});
}
async function syncQueueLocked(){
 syncing=true;
 try{
  for(const old of await list()){
   if(old.status!=='queued'&&old.status!=='manual_queued')continue;const item=old;const manual=item.status==='manual_queued';item.mode=manual?'manual':'ocr';item.status='reading';item.error='';await put(item);await render();
   try{
    const fd=new FormData();fd.append('file',item.blob,item.name);
    const data=await jsonResponse(await fetchTimeout(manual?'/api/attachments':'/api/ocr',{method:'POST',body:fd},120000));
    item.data=manual?{...data,manual:true}:data;
    if(!manual)item.form={amount:data.amount??'',merchant:data.merchant??'',expense_date:data.expense_date??'',payment_method:data.payment_method==='unknown'?'':data.payment_method??'',user_id:meta.users[0]?.id||'',category_id:'',description:data.description||'',reimbursement_required:false};
    item.status='ready';
   }catch(e){const offline=e.name==='TypeError'||e.name==='AbortError';item.status=offline?(manual?'manual_queued':'queued'):'error';item.error=offline?'Connection interrupted. The screenshot remains queued for the next connection.':`Could not process image: ${e.message}. Tap Retry reading when connected.`;}
   await put(item);await render();
   if(cloud&&item.auto_save&&item.status==='ready')await saveItem(item.id,true);
  }
 }finally{syncing=false;}
}
async function checkConnection(){
 if(checking||!db)return;checking=true;
 try{await jsonResponse(await fetchTimeout('/api/health',{},5000));if(!metaReady){await refreshMeta();metaReady=true;await render();}$('connection').textContent='Server connected. Uploading queued screenshots.';await syncQueue();if(cloud){for(const i of await list())if(i.status==='uncertain'&&i.auto_save)await saveItem(i.id,true);}$('connection').textContent='Server connected. Review the entries below.';}
 catch{$('connection').textContent='Server unavailable. Screenshots remain stored on this phone until you reconnect.';}
 finally{checking=false;}
}
async function saveItem(id,automatic=false){
 if(!navigator.locks){alert('Safe saving requires a browser that supports Web Locks. Use Chrome on your Samsung.');return;}
 await navigator.locks.request('oak-receipt-save-'+id,{ifAvailable:true},async lock=>{
  if(!lock){alert('This item is already being saved in another tab.');return;}
  const item=(await list()).find(x=>x.id===id);if(!item||!['ready','uncertain'].includes(item.status))return;
  const f=item.form||{};if(!f.user_id||!Number.isFinite(Number(f.amount))||Number(f.amount)<=0){alert('Choose who paid and enter a positive amount.');return;}
  if(item.data?.duplicate){if(automatic){item.error='Possible duplicate. Review and save explicitly if needed.';await put(item);await render();return;}if(!confirm('This may be a duplicate. Save it anyway?'))return;}
  item.status='saving';item.error='';await put(item);await render();
  const payload={...f,amount:Number(f.amount),image_path:item.data.image_path,image_sha256:item.data.image_sha256,ocr_confidence:item.data.manual?null:item.data.ocr_confidence,ocr_raw:item.data.manual?{source:'offline_manual',original_filename:item.name}:item.data};
  try{
   const r=await fetchTimeout('/api/expenses',{method:'POST',headers:{'Content-Type':'application/json',...(cloud?{'Idempotency-Key':item.id}:{})},body:JSON.stringify(payload)},30000);
   if(!r.ok){const j=await r.json().catch(()=>({}));item.status=r.status>=500?'uncertain':'ready';item.error=r.status>=500?'Server error: the save result may be unknown. Check saved expenses on the expense server before retrying.':(j.error||`Save failed (${r.status}).`);await put(item);}
   else{await del(item.id);$('connection').textContent='Expense saved. The original image remains in your gallery.';}
  }catch{item.status='uncertain';item.error='Save result is unknown. Check Saved expenses on the expense server before doing anything else. Do not upload this item again until you confirm whether it was saved.';await put(item);}
  await render();
 });
}
$('files').addEventListener('change',async e=>{try{for(const file of Array.from(e.target.files||[])){if(file.size>12*1024*1024){alert(`${file.name} exceeds the 12 MB limit.`);continue;}const manual=$('entry-mode').value==='manual';await put({id:`${Date.now()}-${Math.random().toString(36).slice(2)}`,name:file.name,blob:file,mode:manual?'manual':'ocr',status:manual?'manual_draft':'queued',form:manual?{amount:'',merchant:'',expense_date:'',payment_method:'',user_id:'',category_id:'',description:'',reimbursement_required:false}:undefined,created:Date.now()});}e.target.value='';await render();await checkConnection();}catch(err){showError(err);alert('Could not store every image on the phone. Check available storage and the queue.');}});
$('sync').addEventListener('click',()=>checkConnection().catch(showError));
window.addEventListener('online',()=>checkConnection().catch(showError));document.addEventListener('visibilitychange',()=>{if(!document.hidden)checkConnection().catch(showError)});
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;$('install').hidden=false;});$('install').onclick=async()=>{if(installPrompt){await installPrompt.prompt();installPrompt=null;$('install').hidden=true;}};
(async()=>{try{
 if(!validQueueEnv)throw new Error('Cannot identify whether this is staging or live. Reconnect to the server and reopen the app.');
 if(!window.isSecureContext||!('serviceWorker' in navigator))throw new Error('Offline setup requires a trusted HTTPS connection.');
 db=await openDb();try{const saved=JSON.parse(localStorage.getItem(queueMetaKey)||'null');if(saved&&Array.isArray(saved.users)&&Array.isArray(saved.categories))meta=saved;}catch{}for(const item of await list()){if(item.status==='reading'){item.status=item.mode==='manual'?'manual_queued':'queued';await put(item);}else if(item.status==='saving'){item.status='uncertain';item.error='The previous save was interrupted. Check saved expenses on the expense server before retrying.';await put(item);}}
 await navigator.serviceWorker.register(cloud?'./sw.js':'/sw.js');await navigator.serviceWorker.ready;
 if(navigator.storage?.persist){const persistent=await navigator.storage.persist().catch(()=>false);$('storage').textContent=persistent?'Persistent phone storage granted.':'Phone storage is subject to browser limits. Keep the original gallery images.';}
 await render();await checkConnection();setInterval(()=>{if(!document.hidden)checkConnection().catch(showError)},30000);
}catch(e){$('files').disabled=true;$('sync').disabled=true;showError(e);}})();
