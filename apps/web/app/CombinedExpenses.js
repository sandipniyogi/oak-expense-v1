'use client';
import {useEffect,useRef,useState} from 'react';
import {expenseApiBase,newUploadId} from './expenseApi';
import {combinedSummary,combinedValidation,saveCombined} from './combinedSave.mjs';
import CombinedExpenseReview from './CombinedExpenseReview';
import {combinedReviewKey} from './combinedReview.mjs';
const API=expenseApiBase();
function ImagePreview({file}){
  const [url,setUrl]=useState('');
  const [zoom,setZoom]=useState(100);
  useEffect(()=>{const u=URL.createObjectURL(file);setUrl(u);return()=>URL.revokeObjectURL(u);},[file]);
  if(!url)return null;
  return <div className="combined-preview" style={{flex:'1 1 240px',maxWidth:'100%',minWidth:0}}>
    <div className="combined-zoom" style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap',marginBottom:8}}>
      <button type="button" aria-label={`Zoom out ${file.name}`} disabled={zoom<=100} onClick={()=>setZoom(z=>Math.max(100,z-50))}>−</button>
      <label style={{display:'flex',alignItems:'center',gap:6}}>Zoom <input type="range" min="100" max="500" step="25" value={zoom} onChange={e=>setZoom(Number(e.target.value))} aria-label={`Zoom ${file.name}`}/> {zoom}%</label>
      <button type="button" aria-label={`Zoom in ${file.name}`} disabled={zoom>=500} onClick={()=>setZoom(z=>Math.min(500,z+50))}>+</button>
      <button type="button" onClick={()=>setZoom(100)}>Reset</button>
      <a href={url} target="_blank" rel="noopener noreferrer" className="button-link">Open full image</a>
    </div>
    <div tabIndex={0} role="region" aria-label={`Scrollable screenshot ${file.name}`} style={{maxHeight:360,maxWidth:'100%',overflow:'auto',border:'1px solid #e5dfd5',borderRadius:10,padding:8,background:'#f7f4ee'}}>
      <img src={url} alt={`Screenshot ${file.name}`} style={{display:'block',width:`${180*zoom/100}px`,height:'auto',maxWidth:'none'}}/>
    </div>
    <p className="message">Use the controls to enlarge the screenshot, then scroll inside the image to inspect it.</p>
  </div>;
}
export default function CombinedExpenses({meta,onSaved}){
  const saving=useRef(false);
  const [parts,setParts]=useState([]),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[locked,setLocked]=useState(false);
  const [form,setForm]=useState({user_id:'',merchant:'',category_id:'',payment_method:'',expense_date:'',description:'',reimbursement_required:false});
  const [aiReview,setAiReview]=useState(null);
  const change=(id,fields)=>setParts(old=>old.map(p=>p.id===id?{...p,...fields}:p));
  const add=files=>{const f=Array.from(files||[]);if(parts.length+f.length>20){setNotice('Choose no more than 20 screenshots for one combined expense.');return;}setParts(old=>[...old,...f.map(file=>({id:newUploadId(),file,status:'waiting',amounts:[''],expense_date:'',data:null}))]);setNotice('Read screenshots to suggest details, or enter amounts manually. Save will attach any screenshots that are not uploaded yet.');};
  async function processParts(){
    setBusy(true);let latest=form.expense_date;let merchant=form.merchant;let method=form.payment_method;let suggestedPayer=form.user_id||meta.users[0]?.id||'';
    for(const p of parts.filter(x=>x.status==='waiting'||x.status==='error')){
      change(p.id,{status:'reading',error:''});
      try{
        const fd=new FormData();fd.append('file',p.file);
        const r=await fetch(`${API}/ocr`,{method:'POST',body:fd});const d=await r.json();if(!r.ok)throw new Error(d.error||'OCR failed');
        change(p.id,{status:'ready',data:d,amounts:[d.amount??''],expense_date:d.expense_date??''});
        if(d.expense_date&&(!latest||d.expense_date>latest))latest=d.expense_date;
        if(!merchant&&d.merchant)merchant=d.merchant;
        if(!method&&d.payment_method&&d.payment_method!=='unknown')method=d.payment_method;
      }catch(e){change(p.id,{status:'error',error:e.message||'OCR failed'});}
    }
    setForm(old=>({...old,user_id:suggestedPayer,merchant,expense_date:latest,payment_method:method}));setNotice('Review each amount, the vendor, payer and payment method. Adjust the combined date if needed.');setBusy(false);
  }
  async function manual(p){setBusy(true);try{const fd=new FormData();fd.append('file',p.file);const r=await fetch(`${API}/attachments`,{method:'POST',body:fd});const d=await r.json();if(!r.ok)throw new Error(d.error||'Upload failed');change(p.id,{status:'ready',data:d,error:''});}catch(e){change(p.id,{status:'error',error:e.message});}setBusy(false);}
  const {count,total}=combinedSummary(parts);
  async function save(){
    if(saving.current||busy||locked)return;
    const invalid=combinedValidation(parts,form);
    if(invalid){setNotice(invalid);return;}
    if(!window.confirm(`Save ${count} payments as one expense of ¥${(total/100).toFixed(2)} for ${form.merchant}? Confirm every amount, category, purpose, vendor and payer. The vendor, payer and payment method must apply to all payments.`))return;
    saving.current=true;setBusy(true);
    try{
      await saveCombined({api:API,parts,form,humanReview:{purpose:form.description,final_fields:{...form,amount:(total/100).toFixed(2)},confirmed_at:new Date().toISOString(),ai_review:aiReview?.key===combinedReviewKey(form,parts,total)?aiReview:null},onPart:change,onProgress:setNotice});
      setAiReview(null);setParts([]);setForm({user_id:'',merchant:'',category_id:'',payment_method:'',expense_date:'',description:'',reimbursement_required:false});
      setNotice('Combined expense saved. Its payment screenshots are available in saved expenses and the Excel Combined screenshots sheet.');
      try{await onSaved();}catch{setNotice('Expense saved. Refresh the page to update the report.');}
    }catch(error){
      if(error.outcomeUnknown)setLocked(true);
      setNotice(error.message||'Unable to save. Review the screenshots and try again.');
    }finally{saving.current=false;setBusy(false);}
  }
  return <section className="card tablecard no-print combined-card" aria-label="Combine vendor payments">
    <h2>Combine payments for one vendor</h2><p>Upload one or more screenshots for the same vendor, payer and payment method. Add each payment amount shown and review the combined total. Saving automatically attaches any screenshots you have not uploaded yet.</p>
    <label className="batch-picker">Choose screenshots <input type="file" accept="image/*" multiple disabled={busy||locked} onChange={e=>{add(e.target.files);e.target.value='';}}/></label>
    <button disabled={busy||locked||!parts.some(p=>p.status==='waiting'||p.status==='error')} onClick={processParts}>Read screenshots</button>
    {notice&&<p className="message" role="status">{notice}</p>}
    {parts.map((p,i)=><div key={p.id} className="combined-item" style={{padding:16,margin:'14px 0',border:'1px solid #dce5dc',borderRadius:12}}>
      <strong>{i+1}. {p.file.name}</strong> <span> · {{waiting:'Not attached yet — attaches on save',reading:'Reading screenshot…',uploading:'Attaching screenshot…',ready:'Attached',error:'Needs attention'}[p.status]||p.status}</span><div className="combined-review" style={{display:'flex',gap:18,alignItems:'flex-start',flexWrap:'wrap',marginTop:10}}><ImagePreview file={p.file}/>
      <div className="combined-amounts" style={{flex:'1 1 350px'}}>
        <div className="fields"><label>Payment date<input type="date" value={p.expense_date} disabled={busy||locked} onChange={e=>change(p.id,{expense_date:e.target.value})}/></label></div>
        <p className="message">Payment amounts in this screenshot</p>
        {p.amounts.map((amount,j)=><div key={j} className="combined-amount-row" style={{display:'flex',alignItems:'end',gap:8,marginBottom:8}}>
          <label style={{flex:'1 1 auto',fontSize:12,fontWeight:700}}>Amount {j+1} (CNY)<input style={{display:'block',width:'100%',marginTop:6,padding:10,border:'1px solid #d6d0c5',borderRadius:10}} inputMode="decimal" value={amount} disabled={busy||locked} onChange={e=>change(p.id,{amounts:p.amounts.map((x,k)=>k===j?e.target.value:x)})}/></label>
          {p.amounts.length>1&&<button type="button" disabled={busy||locked} onClick={()=>change(p.id,{amounts:p.amounts.filter((_,k)=>k!==j)})} aria-label={`Remove amount ${j+1}`}>Remove amount</button>}
        </div>)}
        <button type="button" disabled={busy||locked||p.amounts.length>=50} onClick={()=>change(p.id,{amounts:[...p.amounts,'']})}>+ Add another amount</button>
      </div></div>
      {p.data?.duplicate&&<p className="warn">Possible duplicate: this screenshot is attached to a saved expense.</p>}{p.error&&<p className="warn">{p.error}</p>}
      {(p.status==='waiting'||p.status==='error')&&<button disabled={busy||locked} onClick={()=>manual(p)}>Attach now (optional)</button>}
      <button disabled={busy||locked} onClick={()=>setParts(old=>old.filter(x=>x.id!==p.id))}>Remove</button>
    </div>)}
    {parts.length>0&&<><div className="fields combined-details">
      <label>Vendor<input value={form.merchant} disabled={busy||locked} onChange={e=>setForm({...form,merchant:e.target.value})}/></label>
      <label>Combined expense date<input type="date" value={form.expense_date} disabled={busy||locked} onChange={e=>setForm({...form,expense_date:e.target.value})}/></label>
      <label>Paid by<select value={form.user_id} disabled={busy||locked} onChange={e=>setForm({...form,user_id:e.target.value})}><option value="">Select</option>{meta.users.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select></label>
      <label>Payment method<select value={form.payment_method} disabled={busy||locked} onChange={e=>setForm({...form,payment_method:e.target.value})}><option value="">Select</option><option value="wechat">WeChat</option><option value="alipay">Alipay</option><option value="cash">Cash</option><option value="card">Card</option><option value="other">Other app</option></select></label>
      <label>Category<select value={form.category_id} disabled={busy||locked} onChange={e=>setForm({...form,category_id:e.target.value})}><option value="">Select</option>{meta.categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <label>Purpose / description<input value={form.description} disabled={busy||locked} onChange={e=>setForm({...form,description:e.target.value})}/></label>
      <label className="check wide"><input type="checkbox" checked={form.reimbursement_required} disabled={busy||locked} onChange={e=>setForm({...form,reimbursement_required:e.target.checked})}/>Personal money — reimbursement required</label>
    </div><CombinedExpenseReview api={API} form={form} parts={parts} total={total} categories={meta.categories} busy={busy||locked} review={aiReview} onReview={setAiReview} onCategory={id=>setForm(old=>({...old,category_id:id}))}/><p><strong>Combined total: {total===null?'Enter valid amounts':`¥${(total/100).toFixed(2)}`}</strong></p><button className="primary" disabled={busy||locked} onClick={save}>{busy?'Working…':'Save as one expense'}</button></>}
  </section>;
}
