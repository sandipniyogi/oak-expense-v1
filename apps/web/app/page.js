'use client';
import { Fragment, useEffect, useRef, useState } from 'react';
import BatchExpenses from './BatchExpenses';
import CombinedExpenses from './CombinedExpenses';
import { expenseApiBase } from './expenseApi';

const API = expenseApiBase();

function paymentLabel(method) {
  if (method === 'wechat') return 'WeChat';
  if (method === 'alipay') return 'Alipay';
  if (method === 'all') return 'All payments';
  if (method === 'cash') return 'Cash';
  if (method === 'card') return 'Card';
  if (method === 'other') return 'Other app';
  return method || 'Unknown';
}

function money(value) {
  return `¥${Number(value || 0).toFixed(2)}`;
}

function csvCell(value) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`;
}

function expenseDate(row) {
  return row.expense_date || (row.created_at ? new Date(row.created_at).toISOString().slice(0, 10) : '');
}

function matchesTransactionSearch(row, query) {
  const terms = String(query || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  const text = [expenseDate(row), row.paid_by, row.merchant, row.category,
    row.payment_method, paymentLabel(row.payment_method), row.description,
    row.reimbursement_required ? (row.reimbursement_status || 'pending') : '']
    .filter(Boolean).join(' ').toLowerCase();
  return terms.every(term => {
    const amount = term.replace(/^[¥￥]/, '').replace(/,/g, '');
    if (/^\d+(?:\.\d{1,2})?$/.test(amount)) {
      return Math.round(Number(row.amount) * 100) === Math.round(Number(amount) * 100);
    }
    return text.includes(term);
  });
}

function normalizedCategory(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[>›»→]/g, ' ')
    .replace(/[^a-z0-9\u3400-\u9fff]+/g, ' ')
    .trim();
}

export default function Home() {
  const [meta,setMeta]=useState({users:[],categories:[]});
  const [captureMode,setCaptureMode]=useState('ocr');
  const [file,setFile]=useState(null);
  const [dragActive,setDragActive]=useState(false);
  const fileInputRef=useRef(null);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [data,setData]=useState(null);
  const [expenses,setExpenses]=useState([]);
  const [form,setForm]=useState({user_id:'',category_id:'',amount:'',merchant:'',payment_method:'',expense_date:'',description:'',reimbursement_required:false});

  const [editingId,setEditingId]=useState(null);
  const [editForm,setEditForm]=useState(null);
  const [editScreenshot,setEditScreenshot]=useState(null);
  const [editRemoveScreenshot,setEditRemoveScreenshot]=useState(false);
  const [editBusy,setEditBusy]=useState(false);
  const [editMessage,setEditMessage]=useState('');

  const [reportFilters,setReportFilters]=useState({payment_method:'all',user_id:'',amount:'',from:'',to:''});
  const [report,setReport]=useState(null);
  const [reportBusy,setReportBusy]=useState(false);
  const [reportMessage,setReportMessage]=useState('');
  const [transactionSearch,setTransactionSearch]=useState('');
  const [reportPage,setReportPage]=useState(1);
  const [reportPageSize,setReportPageSize]=useState(10);

  const reportRows=report?.rows||[];
  const detailRows=reportRows.filter(row=>matchesTransactionSearch(row,transactionSearch));
  const detailTotal=detailRows.reduce((sum,row)=>sum+Math.round(Number(row.amount||0)*100),0)/100;
  const reportTotalPages=Math.max(1,Math.ceil(detailRows.length/reportPageSize));
  const reportCurrentPage=Math.min(reportPage,reportTotalPages);
  const reportPageStart=(reportCurrentPage-1)*reportPageSize;
  const reportPageRows=detailRows.slice(reportPageStart,reportPageStart+reportPageSize);
  const reportVisibleStart=detailRows.length?reportPageStart+1:0;
  const reportVisibleEnd=Math.min(reportPageStart+reportPageSize,detailRows.length);
  const reportDates=reportRows.map(expenseDate).filter(Boolean).sort();
  const reportStartDate=report?.filter?.from||reportDates[0]||'—';
  const reportEndDate=report?.filter?.to||reportDates[reportDates.length-1]||'—';

  function selectScreenshot(candidate){
    if(!candidate) return;
    setFile(candidate);
    setData(null);
    const type=candidate.type||'unknown file type';
    const size=(candidate.size/1024/1024).toFixed(2);
    setMessage(`Selected: ${candidate.name} · ${type} · ${size} MB`);
  }

  function handleFileInput(event){
    selectScreenshot(event.target.files?.[0]||null);
  }

  function handleDragOver(event){
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect='copy';
    setDragActive(true);
  }

  function handleDragLeave(event){
    event.preventDefault();
    event.stopPropagation();
    // Ignore leave events caused by moving between children inside the drop zone.
    if(event.currentTarget.contains(event.relatedTarget)) return;
    setDragActive(false);
  }

  function handleDrop(event){
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);

    const dropped=[...(event.dataTransfer.files||[])];
    if(!dropped.length){
      setMessage('No file was detected in the drop. Try dropping the image file itself.');
      return;
    }

    selectScreenshot(dropped[0]);
  }

  const load = async()=>{
    const [m,e]=await Promise.all([fetch(`${API}/meta`).then(r=>r.json()),fetch(`${API}/expenses`).then(r=>r.json())]);
    setMeta(m); setExpenses(e);
    if(!form.user_id && m.users[0]) setForm(f=>({...f,user_id:m.users[0].id}));
  };

  async function generateReport(filters=reportFilters){
    setReportBusy(true); setReportMessage('Generating report…');
    try{
      const params=new URLSearchParams();
      params.set('payment_method',filters.payment_method||'all');
      if(filters.amount.trim()) params.set('amount',filters.amount.trim());
      if(filters.user_id) params.set('user_id',filters.user_id);
      if(filters.from) params.set('from',filters.from);
      if(filters.to) params.set('to',filters.to);

      const r=await fetch(`${API}/reports/expenses?${params.toString()}`);
      const j=await r.json();
      if(!r.ok) throw new Error(j.error||'Report failed');
      setReport(j);
      setReportPage(1);
      setReportMessage(`${j.summary.transaction_count} transaction${j.summary.transaction_count===1?'':'s'} in this report.`);
    }catch(e){
      setReportMessage(e.message);
    }finally{
      setReportBusy(false);
    }
  }

  useEffect(()=>{
    load().catch(console.error);
    generateReport().catch(console.error);
  },[]);

  useEffect(()=>{
    if(reportPage>reportTotalPages) setReportPage(reportTotalPages);
  },[reportPage,reportTotalPages]);

  async function runOcr(){
    if(!file) return;
    setBusy(true); setMessage('Reading screenshot…');
    const fd=new FormData(); fd.append('file',file);
    try{
      const r=await fetch(`${API}/ocr`,{method:'POST',body:fd});
      const j=await r.json(); if(!r.ok) throw new Error(j.error||'OCR failed');
      setData(j);
      const suggestedCategory = j.category_suggestion
        ? meta.categories.find(category => {
            const saved=normalizedCategory(category.name);
            const suggested=normalizedCategory(j.category_suggestion);
            return saved === suggested || saved.startsWith(suggested) || suggested.startsWith(saved);
          })
        : null;
      setForm(f=>({
        ...f,
        amount:j.amount??'',
        merchant:j.merchant??'',
        payment_method:j.payment_method==='unknown'?'':(j.payment_method??''),
        expense_date:j.expense_date??'',
        description:j.description||f.description||'',
        category_id:suggestedCategory?.id||f.category_id
      }));
      if(j.duplicate){
        setMessage('Possible duplicate detected. Please review.');
      }else if(j.source_type==='transaction_details'){
        const pieces=[
          j.amount!=null ? `¥${Number(j.amount).toFixed(2)}` : null,
          j.merchant || null,
          j.expense_date || null,
          j.payment_instrument || 'Other app'
        ].filter(Boolean);
        setMessage(`Transaction details recognized: ${pieces.join(' · ')}. Review before saving.`);
      }else{
        setMessage('OCR complete — review before saving.');
      }
    }catch(e){setMessage(e.message)}finally{setBusy(false)}
  }

  async function uploadManualScreenshot(){
    if(!file) throw new Error('Choose a screenshot before saving.');
    const fd=new FormData();
    fd.append('file',file);
    const r=await fetch(`${API}/attachments`,{method:'POST',body:fd});
    const j=await r.json();
    if(!r.ok) throw new Error(j.error||'Screenshot upload failed');
    return j;
  }

  async function save(){
    setBusy(true); setMessage(captureMode==='manual'?'Uploading screenshot and saving expense…':'Saving expense…');
    try{
      let savedData=data;
      if(captureMode==='manual'){
        if(!file && !data?.image_path) throw new Error('Choose a screenshot for this manual expense.');
        if(file && !data?.image_path){
          savedData=await uploadManualScreenshot();
          setData(savedData);
        }
      }

      const payload={
        ...form,
        amount:Number(form.amount),
        image_path:savedData?.image_path,
        image_sha256:savedData?.image_sha256,
        ocr_confidence:captureMode==='manual'?null:savedData?.ocr_confidence,
        ocr_raw:captureMode==='manual'
          ? {source:'manual',payment_source:'other_app',original_filename:file?.name||null}
          : (savedData||{})
      };
      const r=await fetch(`${API}/expenses`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      const j=await r.json(); if(!r.ok) throw new Error(j.error||'Save failed');
      setMessage(captureMode==='manual'?'Manual expense saved with screenshot.':'Expense saved.'); setData(null); setFile(null);
      setForm(f=>({...f,category_id:'',amount:'',merchant:'',payment_method:captureMode==='manual'?'other':'',expense_date:'',description:'',reimbursement_required:false}));
      await Promise.all([load(),generateReport(reportFilters)]);
    }catch(e){setMessage(e.message)}finally{setBusy(false)}
  }

  function startEdit(expense){
    setEditingId(expense.id);
    setEditForm({
      user_id: expense.user_id || '',
      category_id: expense.category_id || '',
      amount: expense.amount ?? '',
      merchant: expense.merchant || '',
      payment_method: expense.payment_method || '',
      expense_date: expenseDate(expense),
      description: expense.description || '',
      reimbursement_required: Boolean(expense.reimbursement_required)
    });
    setEditScreenshot(null);
    setEditRemoveScreenshot(false);
    setEditMessage('Edit the values below. You can also replace or remove the saved screenshot.');
  }

  function cancelEdit(){
    setEditingId(null);
    setEditForm(null);
    setEditScreenshot(null);
    setEditRemoveScreenshot(false);
    setEditMessage('');
  }

  async function saveEdit(){
    if(!editingId || !editForm) return;
    setEditBusy(true);
    setEditMessage('Saving changes…');
    try{
      let attachment={};
      if(editScreenshot){
        const fd=new FormData();
        fd.append('file',editScreenshot);
        const uploadResponse=await fetch(`${API}/attachments`,{method:'POST',body:fd});
        const uploaded=await uploadResponse.json();
        if(!uploadResponse.ok) throw new Error(uploaded.error||'Replacement screenshot upload failed');
        attachment={
          image_path:uploaded.image_path,
          image_sha256:uploaded.image_sha256,
          ocr_raw:{source:'manual_replacement',original_filename:editScreenshot.name},
          ocr_confidence:null
        };
      }

      const payload={
        ...editForm,
        amount:Number(editForm.amount),
        remove_screenshot:editRemoveScreenshot&&!editScreenshot,
        ...attachment
      };

      const r=await fetch(`${API}/expenses/${editingId}`,{
        method:'PUT',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify(payload)
      });
      const j=await r.json();
      if(!r.ok) throw new Error(j.error||'Update failed');

      setEditMessage('Expense updated.');
      await Promise.all([load(),generateReport(reportFilters)]);
      cancelEdit();
    }catch(e){
      setEditMessage(e.message);
    }finally{
      setEditBusy(false);
    }
  }

  async function deleteExpense(expense){
    const label=[expenseDate(expense),expense.merchant||paymentLabel(expense.payment_method),money(expense.amount)].filter(Boolean).join(' · ');
    if(!window.confirm(`Delete this expense permanently?\n\n${label}\n\nIts attached screenshot will also be removed if it is not used by another expense.`)) return;
    setEditBusy(true);
    try{
      const r=await fetch(`${API}/expenses/${expense.id}`,{method:'DELETE'});
      const j=await r.json();
      if(!r.ok) throw new Error(j.error||'Delete failed');
      if(editingId===expense.id) cancelEdit();
      setMessage('Expense deleted.');
      await Promise.all([load(),generateReport(reportFilters)]);
    }catch(e){
      setMessage(e.message);
    }finally{
      setEditBusy(false);
    }
  }

  async function chooseReportMethod(payment_method){
    const next={...reportFilters,payment_method};
    setReportFilters(next);
    await generateReport(next);
  }

  async function applyQuickRange(kind){
    const now = new Date();
    const format = date => {
      const y=date.getFullYear();
      const m=String(date.getMonth()+1).padStart(2,'0');
      const d=String(date.getDate()).padStart(2,'0');
      return `${y}-${m}-${d}`;
    };
    let from='';
    let to='';
    if(kind==='month'){
      from=format(new Date(now.getFullYear(),now.getMonth(),1));
      to=format(now);
    }else if(kind==='30'){
      const start=new Date(now);
      start.setDate(start.getDate()-29);
      from=format(start);
      to=format(now);
    }
    const next={...reportFilters,from,to};
    setReportFilters(next);
    await generateReport(next);
  }

  async function downloadReportExcel(){
    if(!report?.rows?.length) return;

    setReportMessage('Building Excel report with screenshots…');
    try{
      const params=new URLSearchParams();
      const applied=report.filter;
      params.set('payment_method',applied.payment_method||'all');
      if(applied.amount != null) params.set('amount',applied.amount);
      if(applied.user_id) params.set('user_id',applied.user_id);
      if(applied.from) params.set('from',applied.from);
      if(applied.to) params.set('to',applied.to);

      const r=await fetch(`${API}/reports/expenses.xlsx?${params.toString()}`);
      if(!r.ok){
        const j=await r.json().catch(()=>({}));
        throw new Error(j.error||'Excel export failed');
      }

      const blob=await r.blob();
      const url=URL.createObjectURL(blob);
      const link=document.createElement('a');
      link.href=url;
      link.download=`oak-expense-report-${report.filter.payment_method||'all'}-${report.filter.user_id||'all-people'}-${reportStartDate}-to-${reportEndDate}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setReportMessage(`Excel downloaded with ${reportRows.length} transaction screenshot${reportRows.length===1?'':'s'}.`);
    }catch(e){
      setReportMessage(e.message);
    }
  }

  function downloadReportCsv(){
    if(!report?.rows?.length) return;

    const headers=['Date','Paid by','Merchant','Category','Payment method','Amount','Currency','Reimbursement','Description'];
    const totalAmount=Number(report.summary?.total_amount||0).toFixed(2);
    const currency=report.rows[0]?.currency||'CNY';
    const lines=[
      headers.map(csvCell).join(','),
      ...report.rows.map(row=>[
        expenseDate(row),
        row.paid_by||'',
        row.merchant||'',
        row.category||'',
        paymentLabel(row.payment_method),
        Number(row.amount||0).toFixed(2),
        row.currency||'CNY',
        row.reimbursement_required ? row.reimbursement_status||'pending' : 'not required',
        row.description||''
      ].map(csvCell).join(',')),
      [
        '',
        '',
        'TOTAL',
        '',
        '',
        totalAmount,
        currency,
        '',
        `Report total: ${reportStartDate} to ${reportEndDate}`
      ].map(csvCell).join(',')
    ];

    const blob=new Blob([`\uFEFF${lines.join('\n')}`],{type:'text/csv;charset=utf-8'});
    const url=URL.createObjectURL(blob);
    const link=document.createElement('a');
    const from=report.filter.from||'start';
    const to=report.filter.to||'today';
    link.href=url;
    link.download=`oak-expense-report-${report.filter.payment_method}-${report.filter.user_id||'all-people'}-${from}-to-${to}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  return <main className="expense-home">
    <header className="expense-header"><div><span className="eyebrow">THE OAK LOUNGE · SHANGHAI</span><h1>Expense management</h1><p>Capture payments, review transactions, and prepare reports in one place.</p></div><div className="badge">EXPENSES</div></header>
    <nav className="expense-nav no-print" aria-label="Expense page sections">
      <a href="#single-capture">Single expense</a><a href="#batch-capture">Batch upload</a><a href="#combine-payments">Combine payments</a><a href="#expense-report">Reports</a><a href="#saved-expenses">Saved expenses</a>
    </nav>
    <div className="expense-section-heading no-print"><div><span className="eyebrow">SINGLE PAYMENT</span><h2>Capture an expense</h2><p>Upload a screenshot, then check the details before saving.</p></div></div>

    <section id="single-capture" className="grid capture-section">
      <div className="card">
        <h2>1 · Add payment screenshot</h2>
        <div className="segmented no-print" aria-label="Expense capture mode">
          <button className={captureMode==='ocr'?'active':''} disabled={busy} onClick={()=>{setCaptureMode('ocr');setData(null);setMessage('');}}>Alipay / WeChat OCR</button>
          <button className={captureMode==='manual'?'active':''} disabled={busy} onClick={()=>{setCaptureMode('manual');setData(null);setMessage('Manual mode: enter the amount yourself, then save. The screenshot will be attached to Excel.');setForm(f=>({...f,payment_method:'other'}));}}>Manual / Other app</button>
        </div>
        <label
          className={`drop ${dragActive?'drag-active':''} ${file?'has-file':''}`}
          onDragEnter={handleDragOver}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <input
            ref={fileInputRef}
            type="file"
            onClick={e=>{e.currentTarget.value='';}}
            onChange={handleFileInput}
          />
          <strong>{file?file.name:'Drop screenshot here or click to choose'}</strong>
          <span>{file
            ? `${file.type||'Unknown type'} · ${(file.size/1024/1024).toFixed(2)} MB · Ready to ${captureMode==='ocr'?'read':'attach'}`
            : captureMode==='ocr'
              ? 'Drag a WeChat/Alipay image here, or click to browse. JPG, PNG, WebP and other supported images are accepted.'
              : 'Drag any payment-app screenshot here, or click to browse. You will enter the amount manually.'}
          </span>
          {file&&<span className="file-ready">✓ Image selected successfully</span>}
        </label>
        {captureMode==='ocr'
          ? <button disabled={!file||busy} onClick={runOcr}>{busy?'Working…':'Read screenshot'}</button>
          : <p className="message">Enter the amount and details manually on the right. The screenshot uploads automatically when you save.</p>}
        {message&&<p className="message">{message}</p>}
        {data?.duplicate&&<div className="warn">Duplicate: ¥{data.duplicate.amount} on {data.duplicate.expense_date||'unknown date'}</div>}
      </div>

      <div className="card">
        <h2>2 · Verify expense</h2>
        <div className="fields">
          <label>Amount (CNY)<input value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})} inputMode="decimal" placeholder="0.00"/></label>
          <label>Merchant<input value={form.merchant} onChange={e=>setForm({...form,merchant:e.target.value})} placeholder="Merchant name"/></label>
          <label>Date<input type="date" value={form.expense_date} onChange={e=>setForm({...form,expense_date:e.target.value})}/></label>
          <label>Payment<select value={form.payment_method} onChange={e=>setForm({...form,payment_method:e.target.value})}><option value="">Unknown</option><option value="wechat">WeChat</option><option value="alipay">Alipay</option><option value="cash">Cash</option><option value="card">Card</option><option value="other">Other app</option></select></label>
          <label>Paid by<select value={form.user_id} onChange={e=>setForm({...form,user_id:e.target.value})}>{meta.users.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
          <label>Category<select value={form.category_id} onChange={e=>setForm({...form,category_id:e.target.value})}><option value="">Select</option>{meta.categories.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
          <label className="wide">Description<input value={form.description} onChange={e=>setForm({...form,description:e.target.value})} placeholder="Optional note"/></label>
          <label className="check wide"><input type="checkbox" checked={form.reimbursement_required} onChange={e=>setForm({...form,reimbursement_required:e.target.checked})}/> Personal money — reimbursement required</label>
        </div>
        {captureMode==='ocr'&&data?.ocr_confidence!=null&&<div className="confidence">OCR confidence: {data.ocr_confidence}%</div>}
        <button className="primary" disabled={busy||!form.user_id||!form.amount||(captureMode==='manual'&&!file&&!data?.image_path)} onClick={save}>{captureMode==='manual'?'Save manual expense':'Save expense'}</button>
      </div>
    </section>

    <div id="batch-capture" className="batch-section"><BatchExpenses meta={meta} onSaved={async()=>{await Promise.all([load(),generateReport(reportFilters)]);}} /></div>

    <div id="combine-payments"><CombinedExpenses meta={meta} onSaved={async()=>{await Promise.all([load(),generateReport(reportFilters)]);}} /></div>

    <section id="expense-report" className="card tablecard report-card">
      <div className="report-heading">
        <div><span className="eyebrow">PAYMENT REPORT</span><h2>Expense summary</h2><p>A simple report for WeChat, Alipay, or all saved payments.</p></div>
        {report?.generated_at&&<span className="generated">Generated {new Date(report.generated_at).toLocaleString()}</span>}
      </div>

      <div className="report-controls no-print">
        <div className="segmented" aria-label="Payment report type">
          {['all','wechat','alipay','other'].map(method=><button key={method} className={reportFilters.payment_method===method?'active':''} disabled={reportBusy} onClick={()=>chooseReportMethod(method)}>{paymentLabel(method)}</button>)}
        </div>
        <div className="quick-ranges">
          <button disabled={reportBusy} onClick={()=>applyQuickRange('month')}>This month</button>
          <button disabled={reportBusy} onClick={()=>applyQuickRange('30')}>Last 30 days</button>
          <button disabled={reportBusy} onClick={()=>applyQuickRange('all')}>All time</button>
        </div>
        <label>Paid by<select value={reportFilters.user_id} disabled={reportBusy} onChange={e=>{const next={...reportFilters,user_id:e.target.value};setReportFilters(next);generateReport(next);}} style={{display:'block',marginTop:5,border:'1px solid #d6d0c5',borderRadius:10,padding:10,background:'#fff',fontSize:16,maxWidth:'100%'}}><option value="">All people</option>{(meta.report_users||meta.users).map(person=><option key={person.id} value={person.id}>{person.name}{person.active===false?' (inactive)':''}</option>)}</select></label>
        <label>Exact amount (CNY)<input type="text" inputMode="decimal" placeholder="e.g. 250.00" value={reportFilters.amount} disabled={reportBusy} onChange={e=>setReportFilters({...reportFilters,amount:e.target.value})} onKeyDown={e=>{if(e.key==='Enter') generateReport(reportFilters);}}/><small>Leave blank for all amounts. Search matches the saved expense total.</small></label>
        <button disabled={reportBusy} onClick={()=>{const next={...reportFilters,user_id:'',amount:''};setReportFilters(next);generateReport(next);}}>Clear person / amount</button>
        <label>Start date<input type="date" value={reportFilters.from} onChange={e=>setReportFilters({...reportFilters,from:e.target.value})}/></label>
        <label>End date<input type="date" value={reportFilters.to} onChange={e=>setReportFilters({...reportFilters,to:e.target.value})}/></label>
        <button className="generate-button" disabled={reportBusy} onClick={()=>generateReport(reportFilters)}>{reportBusy?'Generating…':'Generate report'}</button>
        <button className="primary" disabled={!reportRows.length||reportBusy} onClick={downloadReportExcel}>Download Excel + screenshots</button>
        <button disabled={!reportRows.length} onClick={downloadReportCsv}>Download CSV</button>
        <button disabled={!reportRows.length} onClick={()=>window.print()}>Print / Save PDF</button>
      </div>

      {reportMessage&&<p className="message no-print">{reportMessage}</p>}

      {report&&<>
        <div className="simple-report-period">
          <div><span>Report type</span><strong>{paymentLabel(report.filter.payment_method)}</strong><small style={{display:'block',marginTop:5}}>Paid by: {report.filter.paid_by||'All people'}</small>{report.filter.amount!=null&&<small style={{display:'block',marginTop:5}}>Exact amount: {money(report.filter.amount)}</small>}</div>
          <div><span>Start date</span><strong>{reportStartDate}</strong></div>
          <div><span>End date</span><strong>{reportEndDate}</strong></div>
        </div>

        <div className="simple-summary-grid">
          <div className="simple-total-card">
            <span>Total spend</span>
            <strong>{money(report.summary.total_amount)}</strong>
            <small>{reportStartDate} → {reportEndDate}</small>
          </div>
          <div className="simple-stat-card"><span>Transactions</span><strong>{report.summary.transaction_count}</strong><small>Saved expenses in this period</small></div>
          <div className="simple-stat-card"><span>WeChat</span><strong>{money(report.summary.wechat_total)}</strong><small>{report.summary.wechat_count} transaction{Number(report.summary.wechat_count)===1?'':'s'}</small></div>
          <div className="simple-stat-card"><span>Alipay</span><strong>{money(report.summary.alipay_total)}</strong><small>{report.summary.alipay_count} transaction{Number(report.summary.alipay_count)===1?'':'s'}</small></div>
        </div>

        <div className="report-table-heading"><div><span className="eyebrow">DETAIL</span><h3>Transactions</h3></div><span>{detailRows.length} matching records · {money(detailTotal)}</span></div>

        <div className="no-print" style={{margin:'16px 0'}}>
          <label htmlFor="transaction-search">Search transactions</label>
          <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:6}}>
            <input id="transaction-search" type="search" value={transactionSearch} placeholder="Name, amount, merchant, category, date or description" onChange={e=>{setTransactionSearch(e.target.value);setReportPage(1);}} style={{flex:'1 1 260px',minWidth:0,padding:12,border:'1px solid #d6d0c5',borderRadius:10,fontSize:16}}/>
            <button disabled={!transactionSearch} onClick={()=>{setTransactionSearch('');setReportPage(1);}}>Clear search</button>
          </div>
          <p className="section-note">Searches all loaded transactions in this report, across every page. Try Sandip 250 to find an exact amount paid by Sandip. Report filters still apply. Summary cards, downloads and printing use the full report.</p>
          <p role="status" aria-live="polite">{detailRows.length} matches out of {reportRows.length} loaded transactions · Matching total: {money(detailTotal)}</p>
        </div>

        <div className="transaction-pagination no-print">
          <div className="pagination-status">
            Showing <strong>{reportVisibleStart}-{reportVisibleEnd}</strong> of <strong>{detailRows.length}</strong> matching transactions
          </div>
          <label className="page-size-label">Rows per page
            <select value={reportPageSize} onChange={e=>{setReportPageSize(Number(e.target.value));setReportPage(1);}}>
              <option value="10">10</option>
              <option value="25">25</option>
              <option value="50">50</option>
            </select>
          </label>
        </div>

        <div className="tablewrap report-table screen-report-table"><table><thead><tr><th>Date</th><th>Paid by</th><th>Merchant</th><th>Category</th><th>Method</th><th>Amount</th><th>Reimburse</th><th>Description</th></tr></thead><tbody>
          {reportPageRows.map(e=><tr key={e.id}><td>{expenseDate(e)||'—'}</td><td>{e.paid_by||'—'}</td><td>{e.merchant||'—'}</td><td>{e.category||'—'}</td><td><span className={`method-pill ${String(e.payment_method||'other').toLowerCase()}`}>{paymentLabel(e.payment_method)}</span></td><td className="money">{money(e.amount)}</td><td>{e.reimbursement_required?(e.reimbursement_status||'Pending'):'—'}</td><td>{e.description||'—'}</td></tr>)}
          {!detailRows.length&&<tr><td colSpan="8" className="empty">No transactions match. Clear the search or change the report filters.</td></tr>}
        </tbody>{detailRows.length>0&&<tfoot><tr className="report-total-row"><td colSpan="5">MATCHING TOTAL · {reportStartDate} → {reportEndDate}</td><td className="money">{money(detailTotal)}</td><td colSpan="2"></td></tr></tfoot>}</table></div>

        {detailRows.length>0&&<div className="pagination-controls no-print">
          <button disabled={reportCurrentPage<=1} onClick={()=>setReportPage(1)}>First</button>
          <button disabled={reportCurrentPage<=1} onClick={()=>setReportPage(p=>Math.max(1,p-1))}>Previous</button>
          <span>Page <strong>{reportCurrentPage}</strong> of <strong>{reportTotalPages}</strong></span>
          <button disabled={reportCurrentPage>=reportTotalPages} onClick={()=>setReportPage(p=>Math.min(reportTotalPages,p+1))}>Next</button>
          <button disabled={reportCurrentPage>=reportTotalPages} onClick={()=>setReportPage(reportTotalPages)}>Last</button>
        </div>}

        <div className="print-only-report-table"><table><thead><tr><th>Date</th><th>Paid by</th><th>Merchant</th><th>Category</th><th>Method</th><th>Amount</th><th>Reimburse</th><th>Description</th></tr></thead><tbody>
          {reportRows.map(e=><tr key={`print-${e.id}`}><td>{expenseDate(e)||'—'}</td><td>{e.paid_by||'—'}</td><td>{e.merchant||'—'}</td><td>{e.category||'—'}</td><td>{paymentLabel(e.payment_method)}</td><td className="money">{money(e.amount)}</td><td>{e.reimbursement_required?(e.reimbursement_status||'Pending'):'—'}</td><td>{e.description||'—'}</td></tr>)}
        </tbody>{reportRows.length>0&&<tfoot><tr className="report-total-row"><td colSpan="5">TOTAL · {reportStartDate} → {reportEndDate}</td><td className="money">{money(report.summary.total_amount)}</td><td colSpan="2"></td></tr></tfoot>}</table></div>
      </>}
    </section>

    <section id="saved-expenses" className="card tablecard recent-card">
      <div className="row"><div><h2>Saved expenses</h2><p className="section-note">Edit values, replace/remove screenshots, or delete an incorrect record directly here.</p></div><span>{expenses.length} records</span></div>
      <div className="tablewrap"><table className="saved-expenses-table"><thead><tr><th>Date</th><th>Paid by</th><th>Merchant</th><th>Category</th><th>Method</th><th>Amount</th><th>Reimburse</th><th>Screenshot</th><th>Actions</th></tr></thead><tbody>
        {expenses.map(e=><Fragment key={e.id}>
          <tr className={editingId===e.id?'selected-expense-row':''}>
            <td>{expenseDate(e)||'—'}</td><td>{e.paid_by||'—'}</td><td>{e.merchant||'—'}</td><td>{e.category||'—'}</td><td>{paymentLabel(e.payment_method)}</td><td className="money">{money(e.amount)}</td><td>{e.reimbursement_required?(e.reimbursement_status||'Pending'):'—'}</td>
            <td>{e.combined_count>0 ? <div className="screenshot-actions">{Array.from({length:e.combined_count},(_,i)=><a key={i} className="text-link" href={`${API}/expenses/${e.id}/combined-screenshot/${i}`} target="_blank" rel="noreferrer">View {i+1}</a>)}</div> : e.image_path?<a className="text-link" href={`${API}/expenses/${e.id}/screenshot`} target="_blank" rel="noreferrer">View</a>:<span className="muted">None</span>}</td>
            <td><div className="row-actions"><button disabled={editBusy||e.combined_count>0} title={e.combined_count>0?"Combined entries cannot be edited yet":undefined} onClick={()=>startEdit(e)}>Edit</button><button className="danger-button" disabled={editBusy} onClick={()=>deleteExpense(e)}>Delete</button></div></td>
          </tr>
          {editingId===e.id&&editForm&&<tr className="expense-editor-row"><td colSpan="9">
            <div className="expense-editor">
              <div className="editor-heading"><div><span className="eyebrow">EDIT SAVED EXPENSE</span><h3>{expenseDate(e)||'No date'} · {e.merchant||paymentLabel(e.payment_method)}</h3></div><button disabled={editBusy} onClick={cancelEdit}>Close</button></div>
              <div className="fields edit-fields">
                <label>Amount (CNY)<input value={editForm.amount} onChange={ev=>setEditForm({...editForm,amount:ev.target.value})} inputMode="decimal"/></label>
                <label>Merchant<input value={editForm.merchant} onChange={ev=>setEditForm({...editForm,merchant:ev.target.value})}/></label>
                <label>Date<input type="date" value={editForm.expense_date} onChange={ev=>setEditForm({...editForm,expense_date:ev.target.value})}/></label>
                <label>Payment<select value={editForm.payment_method} onChange={ev=>setEditForm({...editForm,payment_method:ev.target.value})}><option value="">Unknown</option><option value="wechat">WeChat</option><option value="alipay">Alipay</option><option value="cash">Cash</option><option value="card">Card</option><option value="other">Other app</option></select></label>
                <label>Paid by<select value={editForm.user_id} onChange={ev=>setEditForm({...editForm,user_id:ev.target.value})}>{meta.users.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
                <label>Category<select value={editForm.category_id} onChange={ev=>setEditForm({...editForm,category_id:ev.target.value})}><option value="">Select</option>{meta.categories.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
                <label className="wide">Description<input value={editForm.description} onChange={ev=>setEditForm({...editForm,description:ev.target.value})}/></label>
                <label className="check wide"><input type="checkbox" checked={editForm.reimbursement_required} onChange={ev=>setEditForm({...editForm,reimbursement_required:ev.target.checked})}/> Personal money — reimbursement required</label>
              </div>

              <div className="screenshot-editor">
                <div className="screenshot-status">
                  <strong>Payment screenshot</strong>
                  <span>{editScreenshot?`Replacement selected: ${editScreenshot.name}`:editRemoveScreenshot?'Current screenshot will be removed.':e.image_path?'Current screenshot is attached.':'No screenshot is currently attached.'}</span>
                </div>
                <div className="screenshot-actions">
                  {e.image_path&&!editRemoveScreenshot&&!editScreenshot&&<a className="button-link" href={`${API}/expenses/${e.id}/screenshot`} target="_blank" rel="noreferrer">View current</a>}
                  <label className="button-link file-button">{e.image_path?'Replace screenshot':'Add screenshot'}<input type="file" onChange={ev=>{setEditScreenshot(ev.target.files?.[0]||null);setEditRemoveScreenshot(false);}}/></label>
                  {e.image_path&&!editScreenshot&&<button className={editRemoveScreenshot?'active-remove danger-button':'danger-button'} type="button" onClick={()=>setEditRemoveScreenshot(v=>!v)}>{editRemoveScreenshot?'Keep screenshot':'Remove screenshot'}</button>}
                  {editScreenshot&&<button type="button" onClick={()=>setEditScreenshot(null)}>Clear replacement</button>}
                </div>
              </div>

              {editMessage&&<p className="message">{editMessage}</p>}
              <div className="editor-footer"><button disabled={editBusy} onClick={cancelEdit}>Cancel</button><button className="primary" disabled={editBusy||!editForm.user_id||!editForm.amount} onClick={saveEdit}>{editBusy?'Saving…':'Save changes'}</button></div>
            </div>
          </td></tr>}
        </Fragment>)}
        {!expenses.length&&<tr><td colSpan="9" className="empty">No saved expenses yet. Add a new expense above.</td></tr>}
      </tbody></table></div>
    </section>
  </main>
}
