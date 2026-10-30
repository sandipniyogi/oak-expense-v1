'use client';
import {useEffect,useState} from 'react';

import {expenseApiBase,newUploadId} from './expenseApi';
import ExpenseReview from './ExpenseReview';
import {batchManual,batchReviewError,batchPayload} from './batchReview.mjs';
const API=expenseApiBase();
const norm=s=>String(s||'').toLowerCase().replace(/[>›»→]/g,' ').replace(/[^a-z0-9\u3400-\u9fff]+/g,' ').trim();
const formFor=(user='')=>({user_id:user,category_id:'',amount:'',merchant:'',payment_method:'',expense_date:'',description:'',reimbursement_required:false});

function Preview({file}){
  const [src,setSrc]=useState('');
  const [zoom,setZoom]=useState(100);
  useEffect(()=>{const url=URL.createObjectURL(file);setSrc(url);return()=>URL.revokeObjectURL(url);},[file]);
  if(!src)return null;
  return <div style={{margin:'12px 0'}}>
    <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap',marginBottom:8}}>
      <button type="button" aria-label={`Zoom out ${file.name}`} disabled={zoom<=100} onClick={()=>setZoom(z=>Math.max(100,z-50))}>−</button>
      <label style={{display:'flex',alignItems:'center',gap:8}}>Image zoom
        <input type="range" min="100" max="500" step="25" value={zoom} onChange={e=>setZoom(Number(e.target.value))} aria-label={`Zoom ${file.name}`}/>
        <span>{zoom}%</span>
      </label>
      <button type="button" aria-label={`Zoom in ${file.name}`} disabled={zoom>=500} onClick={()=>setZoom(z=>Math.min(500,z+50))}>+</button>
      <button type="button" onClick={()=>setZoom(100)}>Reset zoom</button>
      <a href={src} target="_blank" rel="noopener noreferrer" className="button-link">Open full image</a>
    </div>
    <div style={{overflow:'auto',maxHeight:360,maxWidth:'100%',border:'1px solid #e5dfd5',borderRadius:10,padding:8,background:'#f7f4ee'}}>
      <img src={src} alt={`Screenshot ${file.name}`} style={{display:'block',width:`${180*zoom/100}px`,maxWidth:'none',height:'auto'}}/>
    </div>
    <p className="message">Use the slider or buttons to enlarge the image. Scroll inside the image box to inspect it.</p>
  </div>;
}

export default function BatchExpenses({meta,onSaved}){
  const [items,setItems]=useState([]);
  const [running,setRunning]=useState(false);
  const [notice,setNotice]=useState('');
  const [newMode,setNewMode]=useState('ocr');
  const update=(id,values)=>setItems(old=>old.map(x=>x.id===id?{...x,...values}:x));
  const edit=(id,key,value)=>setItems(old=>old.map(x=>x.id===id?{...x,form:{...x.form,[key]:value}}:x));
  const add=files=>{
    const selected=Array.from(files||[]);
    if(!selected.length)return;
    setItems(old=>[...old,...selected.map(file=>({id:newUploadId(),file,status:'waiting',mode:newMode,aiReview:null,confirmedFields:'',data:null,error:'',form:formFor(meta.users[0]?.id||'')}))]);
    setNotice(`${selected.length} image(s) added. Read them, then review every entry before saving.`);
  };
  async function read(itemsToRead){
    setRunning(true);setNotice('Reading screenshots one at a time…');
    for(const item of itemsToRead){
      update(item.id,{status:'reading',error:''});
      try{
        const fd=new FormData();fd.append('file',item.file);
        const response=await fetch(`${API}/ocr`,{method:'POST',body:fd});
        const result=await response.json();if(!response.ok)throw new Error(result.error||'OCR failed');
        const suggestion=norm(result.category_suggestion);
        const category=suggestion&&meta.categories.find(c=>{const saved=norm(c.name);return saved&&(saved===suggestion||saved.startsWith(suggestion)||suggestion.startsWith(saved));});
        update(item.id,{status:'ready',data:result,form:{...item.form,amount:result.amount??'',merchant:result.merchant??'',payment_method:result.payment_method==='unknown'?'':(result.payment_method??''),expense_date:result.expense_date??'',description:result.description||'',category_id:category?.id||item.form.category_id}});
      }catch(error){update(item.id,{status:'error',error:error.message||'OCR failed'});}
    }
    setNotice('Reading complete. Review all details and warnings before saving. Failed images can be retried or attached for manual entry.');setRunning(false);
  }
  async function attach(item){
    setRunning(true);update(item.id,{status:'reading',error:''});
    try{
      const fd=new FormData();fd.append('file',item.file);
      const response=await fetch(`${API}/attachments`,{method:'POST',body:fd});
      const result=await response.json();if(!response.ok)throw new Error(result.error||'Upload failed');
      update(item.id,{mode:'manual',status:'ready',data:{...result,manual:true},aiReview:null,confirmedFields:''});
    }catch(error){update(item.id,{status:'error',error:error.message||'Upload failed'});}
    setRunning(false);
  }
  async function save(item){
    const validation=batchReviewError(item);
    if(validation){update(item.id,{error:validation});return;}
    if(!item.data?.image_path){update(item.id,{error:'Read or attach this screenshot before saving.'});return;}
    const duplicateInBatch=items.some(other=>other.id!==item.id&&other.status==='saved'&&other.data?.image_sha256&&other.data.image_sha256===item.data?.image_sha256);
    if((item.data?.duplicate||duplicateInBatch)&&!window.confirm('A matching screenshot was found. Save this expense anyway?'))return;
    setRunning(true);update(item.id,{status:'saving',error:''});
    try{
      const payload=batchPayload(item);
      const response=await fetch(`${API}/expenses`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      if(!response.ok){const result=await response.json().catch(()=>({}));update(item.id,{status:'ready',error:result.error||`Save failed (${response.status}).`});}
      else{update(item.id,{status:'saved',error:''});setNotice('Expense saved. It is available in the expense report and Excel export.');try{await onSaved();}catch{setNotice('Expense saved, but the report could not refresh. Refresh the page to check it.');}}
    }catch(error){update(item.id,{status:'uncertain',error:'The save result is unknown due to a connection error. Check saved expenses before attempting another save; it may already have been saved.'});}
    setRunning(false);
  }
  async function saveAll(){
    const ready=items.filter(x=>x.status==='ready');
    const counts={};
    for(const x of items)if(x.data?.image_sha256)counts[x.data.image_sha256]=(counts[x.data.image_sha256]||0)+1;
    const eligible=ready.filter(x=>!x.data.duplicate&&counts[x.data.image_sha256]===1&&!batchReviewError(x));
    if(!eligible.length){setNotice('No eligible expenses. Complete required details and save any duplicate warnings individually.');return;}
    if(!window.confirm(`Save ${eligible.length} reviewed expense(s)? Entries with duplicate warnings or missing details will be skipped.`))return;
    setRunning(true);let saved=0;let uncertain=false;
    for(const item of eligible){
      update(item.id,{status:'saving',error:''});
      try{
        const payload=batchPayload(item);
        const response=await fetch(`${API}/expenses`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
        if(!response.ok){const result=await response.json().catch(()=>({}));update(item.id,{status:'ready',error:result.error||`Save failed (${response.status}).`});continue;}
        update(item.id,{status:'saved',error:''});saved++;
      }catch(error){update(item.id,{status:'uncertain',error:'The save result is unknown due to a connection error. Check saved expenses before attempting another save; it may already have been saved.'});uncertain=true;break;}
    }
    if(saved){try{await onSaved();}catch{setNotice('Expenses saved, but the report could not refresh. Refresh the page to check it.');setRunning(false);return;}}
    setNotice(`${saved} expense(s) saved. ${uncertain?'Stopped after an uncertain save; check the saved expenses list.':'Items with duplicate warnings, errors, or missing details were skipped.'}`);setRunning(false);
  }
  return <section className="card tablecard no-print" aria-label="Batch expense upload">
    <h2>Batch upload payment screenshots</h2>
    <p>Select multiple screenshots, read them, then review and save each expense. The existing report includes saved entries and their screenshots.</p>
    <label>Mode for newly added screenshots <select disabled={running} value={newMode} onChange={e=>setNewMode(e.target.value)}><option value="ocr">Alipay / WeChat OCR</option><option value="manual">Manual / Other app with optional AI help</option></select></label>
    <label className="batch-picker">Choose images <input type="file" accept="image/*" multiple disabled={running} onChange={e=>{add(e.target.files);e.target.value='';}}/></label>
    <button disabled={running||!items.some(x=>!batchManual(x)&&(x.status==='waiting'||x.status==='error'))} onClick={()=>read(items.filter(x=>!batchManual(x)&&(x.status==='waiting'||x.status==='error')))}>Read selected screenshots</button>
    <button disabled={running||!items.some(x=>x.status==='ready')} onClick={saveAll}>Save all reviewed expenses</button>
    {notice&&<p className="message" role="status">{notice}</p>}
    {items.map((item,index)=>{
      const duplicateInBatch=item.data?.image_sha256&&items.some(other=>other.id!==item.id&&other.data?.image_sha256===item.data.image_sha256);
      return <div key={item.id} style={{border:'1px solid #e5dfd5',borderRadius:14,padding:16,marginTop:14}}>
        <div className="row"><strong>{index+1}. {item.file.name}</strong><span>{item.status}</span></div>
        {!['saved','uncertain'].includes(item.status)&&<label>Screenshot mode <select disabled={running} value={batchManual(item)?'manual':'ocr'} onChange={e=>update(item.id,{mode:e.target.value,aiReview:null,confirmedFields:'',data:item.data?{...item.data,manual:e.target.value==='manual'}:null})}><option value="ocr">Alipay / WeChat OCR</option><option value="manual">Manual / Other app</option></select></label>}
        <Preview file={item.file}/>
        {item.error&&<p className="warn" role="alert">{item.error}</p>}
        {item.data?.duplicate&&<p className="warn">Possible duplicate already saved: ¥{item.data.duplicate.amount} on {item.data.duplicate.expense_date||'unknown date'}.</p>}
        {duplicateInBatch&&<p className="warn">This screenshot also appears in this batch. Check before saving.</p>}
        {['waiting','error'].includes(item.status)&&<button disabled={running} onClick={()=>attach(item)}>Attach and enter details manually</button>}
        {(item.status==='ready'||(batchManual(item)&&['waiting','error'].includes(item.status)))&&<>
          {item.data?.manual&&<p className="message">Manual entry: screenshot attached. Enter the expense details below.</p>}
          {item.data?.ocr_confidence!=null&&<p className="message">OCR confidence: {item.data.ocr_confidence}%</p>}
          <fieldset disabled={running} style={{border:0,padding:0,margin:0}}><div className="fields">
            <label>Amount (CNY)<input inputMode="decimal" value={item.form.amount} onChange={e=>edit(item.id,'amount',e.target.value)}/></label>
            <label>Merchant<input value={item.form.merchant} onChange={e=>edit(item.id,'merchant',e.target.value)}/></label>
            <label>Date<input type="date" value={item.form.expense_date} onChange={e=>edit(item.id,'expense_date',e.target.value)}/></label>
            <label>Payment<select value={item.form.payment_method} onChange={e=>edit(item.id,'payment_method',e.target.value)}><option value="">Unknown</option><option value="wechat">WeChat</option><option value="alipay">Alipay</option><option value="cash">Cash</option><option value="card">Card</option><option value="other">Other app</option></select></label>
            <label>Paid by<select value={item.form.user_id} onChange={e=>edit(item.id,'user_id',e.target.value)}><option value="">Select</option>{meta.users.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select></label>
            <label>Category<select value={item.form.category_id} onChange={e=>edit(item.id,'category_id',e.target.value)}><option value="">Select</option>{meta.categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
            {batchManual(item)?<label className="wide">What was this expense for? (required)<textarea rows="3" maxLength="2000" value={item.form.description} onChange={e=>edit(item.id,'description',e.target.value)} placeholder="Explain what this payment was used for"/></label>:<label className="wide">Description<input value={item.form.description} onChange={e=>edit(item.id,'description',e.target.value)}/></label>}
            <label className="check wide"><input type="checkbox" checked={item.form.reimbursement_required} onChange={e=>edit(item.id,'reimbursement_required',e.target.checked)}/>Personal money — reimbursement required</label>
          </div></fieldset>
          {batchManual(item)&&<>
            <ExpenseReview api={API} form={item.form} file={item.file} ocr={item.data} categories={meta.categories} busy={running} review={item.aiReview} onReview={review=>update(item.id,{aiReview:review})} onAttachment={data=>update(item.id,{status:'ready',data:{...data,manual:true},error:''})} onField={(field,value)=>edit(item.id,field,value)}/>
            <label className="check wide"><input type="checkbox" disabled={running} checked={item.confirmedFields===JSON.stringify(item.form)} onChange={e=>update(item.id,{confirmedFields:e.target.checked?JSON.stringify(item.form):''})}/>I checked the fields and purpose for this screenshot.</label>
          </>}
          {batchManual(item)&&batchReviewError(item)&&<p className="message">{batchReviewError(item)}</p>}
          <button className="primary" disabled={running||item.status!=='ready'||Boolean(batchReviewError(item))} onClick={()=>save(item)}>Save this expense</button>
        </>}
        {item.status==='saved'&&<p className="message">Saved successfully.</p>}
        {item.status==='uncertain'&&<p className="message">This entry is locked to avoid an accidental duplicate. Check the saved expenses list.</p>}
        {!['saving','reading'].includes(item.status)&&<button disabled={running} onClick={()=>setItems(old=>old.filter(x=>x.id!==item.id))}>Remove from list</button>}
      </div>;
    })}
  </section>;
}
