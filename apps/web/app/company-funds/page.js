'use client';
import {useEffect,useRef,useState} from 'react';
import {movementPreview} from './balance.mjs';
import {expenseApiBase} from '../expenseApi';
const API=expenseApiBase(),money=n=>'¥'+(Number(n||0)/100).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const labels={reimbursement:'Company pays individual — offset balance',return:'Individual pays company — return / offset balance',advance:'Company advance for future spending',capital:'Capital contribution — separate from expense balance',personal_withdrawal:'Capital drawing — separate from expense balance',opening_due_partner:'Opening: company owes individual',opening_due_company:'Opening: individual owes / holds company money'};
const sources={personal:'Personal money — company expense',advance:'Company advance — company expense',company:'Paid directly by company'};
function today(){const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());return ['year','month','day'].map(k=>parts.find(p=>p.type===k).value).join('-')}
function key(){return globalThis.crypto?.randomUUID?.()||Date.now()+'-'+Math.random().toString(36).slice(2)}
export default function CompanyFunds(){
 const [month,setMonth]=useState(today().slice(0,7)),[person,setPerson]=useState('all'),[data,setData]=useState(null),[error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[page,setPage]=useState(1),[search,setSearch]=useState(''),[choices,setChoices]=useState({}),[form,setForm]=useState({partner_id:'',kind:'reimbursement',amount:'',occurred_on:today(),purpose:'',request_id:key()});
 async function load(){const r=await fetch(API+'/company-funds?month='+encodeURIComponent(month),{cache:'no-store'});const d=await r.json();if(!r.ok)throw Error(d.error||'Company funds unavailable');setData(d);setForm(f=>({...f,partner_id:f.partner_id||d.users.find(u=>u.role!=='company')?.id||''}))}
 useEffect(()=>{setData(null);setError('');setPage(1);load().catch(e=>setError(e.message))},[month]);
 async function send(path,method,body){setBusy(true);setError('');setMessage('');try{const r=await fetch(API+path,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json();if(!r.ok)throw Error(d.error||'Save failed');await load();setMessage('Saved; balances updated.');return true}catch(e){setError(e.message);return false}finally{setBusy(false)}}
 const detailsDialog = useRef(null);
 const [detailsId, setDetailsId] = useState(null);
 const [detailsMonth, setDetailsMonth] = useState('');
 const [detailsPage, setDetailsPage] = useState(1);
 const [detailsPageSize, setDetailsPageSize] = useState(10);
 const [detailsResult, setDetailsResult] = useState(null);

 useEffect(() => {
   if (!detailsId || !detailsMonth || detailsMonth === data?.summary.month) return;
   const controller = new AbortController();
   async function loadDetails() {
     try {
       const response = await fetch(API + '/company-funds?month=' + encodeURIComponent(detailsMonth), {
         signal: controller.signal, cache: 'no-store',
       });
       const result = await response.json();
       if (!response.ok) throw new Error(result.error || 'Could not load this month.');
       if (!controller.signal.aborted) setDetailsResult({month: detailsMonth, data: result});
     } catch (error) {
       if (!controller.signal.aborted) setDetailsResult({month: detailsMonth, error: error.message});
     }
   }
   loadDetails();
   return () => controller.abort();
 }, [detailsId, detailsMonth, data?.summary.month]);

 const activeDetails = detailsResult?.month === detailsMonth ? detailsResult : null;
 const detailsData = data?.summary.month === detailsMonth ? data : activeDetails?.data;
 const selected = detailsData?.summary.partners.find(partner => partner.id === detailsId);
 const detailsName = data?.summary.partners.find(partner => partner.id === detailsId)?.name;
 const monthlyExpenses = selected ? detailsData.expenses.filter(expense =>
   expense.user_id === selected.id && expense.day.startsWith(detailsMonth + '-')
 ) : [];
 const detailsPageCount = Math.max(1, Math.ceil(monthlyExpenses.length / detailsPageSize));
 const currentDetailsPage = Math.min(detailsPage, detailsPageCount);
 const detailsStart = (currentDetailsPage - 1) * detailsPageSize;
 const visibleDetails = monthlyExpenses.slice(detailsStart, detailsStart + detailsPageSize);
 const monthlyMovements = selected ? detailsData.entries.filter(entry =>
   entry.partner_id === selected.id && entry.occurred_on.startsWith(detailsMonth + '-')
 ) : [];

 function openDetails(id) {
   setDetailsId(id);
   setDetailsPage(1);
   setDetailsMonth(data.summary.month);
   setDetailsResult(null);
   detailsDialog.current.showModal();
 }
 const preview=movementPreview(data?.summary,form);
 const field=(k,v)=>setForm(f=>({...f,[k]:v}));const partners=(data?.summary.partners||[]).filter(p=>person==='all'||p.id===person);const expenses=(data?.expenses||[]).filter(e=>(person==='all'||e.user_id===person)&&`${e.day} ${e.paid_by} ${e.description} ${e.merchant} ${e.amount}`.toLowerCase().includes(search.toLowerCase()));const last=Math.max(1,Math.ceil(expenses.length/12)),visible=expenses.slice((page-1)*12,page*12);const entries=(data?.entries||[]).filter(e=>e.occurred_on.startsWith(month)&&(person==='all'||e.partner_id===person));
 return <main className="funds"><style jsx>{`
 .funds{max-width:1260px;margin:auto;padding:24px;font:15px system-ui;color:#243b2e}section{border:1px solid #d5e0d8;background:white;border-radius:14px;padding:20px;margin:20px 0}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}.wide{grid-column:1/-1}label{display:flex;flex-direction:column;gap:6px}input,select,textarea,button{font:inherit;border:1px solid #b5c8ba;border-radius:7px;padding:9px;max-width:100%}textarea{min-height:76px}button{background:#22563c;color:white;cursor:pointer}button:disabled{opacity:.5}.row{display:flex;gap:12px;flex-wrap:wrap;align-items:center}.scroll{overflow-x:auto}table{width:100%;min-width:780px;border-collapse:collapse}th,td{text-align:left;padding:11px;border-bottom:1px solid #e3eae5;vertical-align:top}th{font-size:12px}small{display:block;color:#657669;margin-top:6px}.notice{background:#fff0d1;padding:12px;border-radius:8px}.error{background:#ffe5df;padding:12px}.void{opacity:.6;text-decoration:line-through}.funding{min-width:220px}.preview{background:#edf7ef;padding:14px;border-radius:8px;margin:16px 0}.preview strong{display:block}.movement-fields{border:0;padding:0;margin:0;min-width:0}.movement-fields legend{font-weight:600;margin-bottom:12px}@media(max-width:680px){.funds{padding:12px}.grid{grid-template-columns:1fr}section{padding:14px}}
 `}</style><a href="/">← Back to expenses</a><h1>Company funds & monthly settlement</h1><p>Track money withdrawn, what it paid for, and who is still owed money.</p><p className="notice">Company payments reduce what the company owes you. Payments back to the company move the balance in the opposite direction. Reviewed company expenses increase what is owed to you. Capital contributions and capital drawings remain separate.</p><div className="row"><label>Month<input type="month" value={month} onChange={e=>setMonth(e.target.value)}/></label><label>Individual<select value={person} onChange={e=>{setPerson(e.target.value);setPage(1)}}><option value="all">All individuals</option>{data?.users.filter(u=>u.role!=='company').map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select></label></div>{error&&<p className="error" role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
 {data&&<><section><h2>Monthly settlement — {month}</h2>{data.summary.provisional&&<p className="notice">Provisional: {data.summary.unreviewed_expense_ids.length} expenses through this month need funding review and are excluded.</p>}<div className="scroll"><table><thead><tr><th>Individual</th><th>Opening net</th><th>Personal spending</th><th>Advance-funded spending</th><th>Company advances paid this month</th><th>Returned</th><th>Reimbursed</th><th>Opening adjustments</th><th>Company owes individual</th><th>Individual holds / owes company</th></tr></thead><tbody>{partners.map(p=><tr key={p.id}><td><button type="button" onClick={() => openDetails(p.id)} aria-label={'View spending for '+p.name}>{p.name} · View details</button><small>Capital: {money(p.capital_cents)}<br/>Drawings: {money(p.personal_withdrawals_cents)}</small></td><td>{money(p.opening_cents)}</td><td>{money(p.personal_spend_cents)}</td><td>{money(p.advance_spend_cents)}</td><td>{money(p.advances_cents)}</td><td>{money(p.returns_cents)}</td><td>{money(p.reimbursements_cents)}</td><td>{money(p.adjustments_cents)}</td><td><strong>{money(Math.max(p.closing_cents,0))}</strong>{p.closing_cents===0&&<small>Settled</small>}</td><td><strong>{money(Math.max(-p.closing_cents,0))}</strong><small>Advance-only cash tracker: {money(p.cash_held_cents)}</small></td></tr>)}</tbody></table></div><p><strong>Company overview — all individuals</strong></p><p>Recorded cash out: {money(data.summary.company_cash_out_cents)} · Cash returned / capital received: {money(data.summary.company_cash_in_cents)} · Reviewed business expenses: {money(data.summary.company_business_expense_cents)}</p><p>Company advances paid this month: <strong>{money(data.summary.partners.reduce((total, p) => total + p.advances_cents, 0))}</strong></p><p>Company paid directly this month: {money(data.summary.company_paid_cents)}</p></section>
 <section><h2>Record payment or money movement</h2><p>Choose who paid whom. These entries settle existing balances; the payment itself is not another expense.</p><div className="row"><button type="button" disabled={busy} onClick={()=>field('kind','reimbursement')}>Company → individual</button><button type="button" disabled={busy} onClick={()=>field('kind','return')}>Individual → company</button></div><form onSubmit={async e=>{e.preventDefault();if(await send('/company-funds/entries','POST',form))setForm(f=>({...f,amount:'',purpose:'',request_id:key()}))}}><fieldset className="movement-fields" disabled={busy}><legend>Payment details</legend><div className="grid"><label>Individual<select required value={form.partner_id} onChange={e=>field('partner_id',e.target.value)}>{data.users.filter(u=>u.role!=='company').map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select></label><label>Type<select value={form.kind} onChange={e=>field('kind',e.target.value)}>{Object.entries(labels).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label><label>Amount (CNY)<input required type="number" min="0.01" step="0.01" value={form.amount} onChange={e=>field('amount',e.target.value)}/></label><label>Date<input required type="date" value={form.occurred_on} onChange={e=>field('occurred_on',e.target.value)}/></label><label className="wide">Purpose / bank reference<textarea required maxLength={1000} value={form.purpose} onChange={e=>field('purpose',e.target.value)}/></label><div className="wide">{preview&&(preview.included?<div className="preview" role="status"><strong>Balance preview — {month}</strong><p>Before: company owes {money(preview.beforeAmounts.company_owes_cents)} · individual owes / holds {money(preview.beforeAmounts.individual_owes_cents)}</p><p>After saving: company owes {money(preview.afterAmounts.company_owes_cents)} · individual owes / holds {money(preview.afterAmounts.individual_owes_cents)}</p>{preview.effect===0&&<p>This capital entry is recorded separately and does not settle the expense balance.</p>}{preview.changesOpening&&<p>This earlier-dated payment also changes this month’s opening balance.</p>}<small>Estimate using the loaded report. The server recalculates after saving.{preview.provisional?' Unreviewed expenses are excluded; review them for a complete balance.':''}</small></div>:<p className="notice">This date is after the selected month. It will not change this month’s report; select the payment month to see it.</p>)}</div><div><button disabled={busy}>{busy?'Saving…':'Save movement'}</button></div></div></fieldset></form><small>Use “Company pays individual” for transfers that settle their balance, including amounts that cross zero. Use “Individual pays company” for repayments. Select capital drawing only for an intentionally separate capital movement. Opening adjustments are only for balances not already represented by earlier expenses or movements. Do not enter an opening balance twice.</small></section>
 <section><h2>Money movements this month</h2><div className="scroll"><table><thead><tr><th>Date</th><th>Individual</th><th>Type</th><th>Amount</th><th>Purpose</th><th>Correction</th></tr></thead><tbody>{entries.map(e=><tr key={e.id} className={e.voided_at?'void':''}><td>{e.occurred_on}</td><td>{data.users.find(u=>u.id===e.partner_id)?.name}</td><td>{labels[e.kind]}</td><td>{money(e.amount_cents)}</td><td>{e.purpose}{e.voided_at&&<small>Voided: {e.void_reason}</small>}</td><td>{!e.voided_at&&<button disabled={busy} onClick={()=>{const reason=window.prompt('Reason to void this movement (history is retained):');if(reason)send('/company-funds/entries/'+e.id+'/void','POST',{reason})}}>Void</button>}</td></tr>)}</tbody></table></div>{!entries.length&&<p>No movements in this month.</p>}</section>
 <section><h2>Review what each person spent</h2><p>Link existing expenses once; no duplicate expense is created. Amount or Paid by changes require review again. Company-paid expenses must have Paid by set to Company on the expense.</p><label>Search payments<input value={search} placeholder="Vendor, individual, date, description or amount" onChange={e=>{setSearch(e.target.value);setPage(1)}}/></label><div className="scroll"><table><thead><tr><th>Date / Paid by</th><th>Vendor / purpose</th><th>Amount</th><th>Funding source</th><th>Review</th></tr></thead><tbody>{visible.map(e=><tr key={e.id}><td>{e.day}<small>{e.paid_by||'No individual selected'}</small></td><td>{e.merchant}<small>{e.description}</small>{e.image_path&&<a href={`${API}/expenses/${e.id}/screenshot`} target="_blank" rel="noreferrer">View receipt</a>}</td><td>{e.currency} {e.amount}</td><td className="funding"><select aria-label={'Funding for '+(e.description||e.merchant||e.id)} value={choices[e.id]??e.funding_source??''} onChange={ev=>setChoices(old=>({...old,[e.id]:ev.target.value}))}><option value="" disabled>Select source</option>{Object.entries(sources).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></td><td><small>{e.reviewed?'Reviewed':'Needs review — excluded'}</small><button disabled={busy} onClick={()=>{const funding_source=choices[e.id]??e.funding_source;if(!funding_source){setError('Select a funding source');return}send('/company-funds/expenses/'+e.id,'PUT',{funding_source})}}>Confirm source</button></td></tr>)}</tbody></table></div><div className="row"><button disabled={page<=1} onClick={()=>setPage(p=>p-1)}>Previous</button><span>Page {Math.min(page,last)} of {last} · {expenses.length} expenses through selected month</span><button disabled={page>=last} onClick={()=>setPage(p=>p+1)}>Next</button></div></section></>}
 <dialog ref={detailsDialog} aria-labelledby="individual-funds-title" onClose={() => setDetailsId(null)}
   style={{width:'min(900px, 92vw)',maxHeight:'85vh',border:'1px solid #d5e0d8',borderRadius:14,padding:20,color:'#243b2e'}}>
   <form method="dialog"><button autoFocus>Close</button></form>
   <h2 id="individual-funds-title">{detailsName || 'Individual spending'}</h2>
   <label>Month<input type="month" value={detailsMonth} onChange={event => {
     setDetailsResult(null);
     setDetailsMonth(event.target.value);
     setDetailsPage(1);
   }}/></label>
   {!detailsMonth && <p>Select a month to see spending and payments.</p>}
   {detailsMonth && activeDetails?.error && <p role="alert">{activeDetails.error}</p>}
   {detailsMonth && !detailsData && !activeDetails?.error && <p role="status">Loading monthly details…</p>}
   {detailsData && !selected && <p>No settlement details available for this person.</p>}
   {selected && <>
     <p><strong>{selected.closing_cents > 0
       ? 'Company owes ' + selected.name + ' ' + money(selected.closing_cents)
       : selected.closing_cents < 0
         ? selected.name + ' holds or owes the company ' + money(-selected.closing_cents)
         : 'Settled · ¥0.00'}</strong></p>
     <p>Reviewed spending this month <strong>{money(selected.personal_spend_cents + selected.advance_spend_cents)}</strong></p>
     <p>Received from the company this month <strong>{money(selected.advances_cents + selected.reimbursements_cents)}</strong></p>
     <div className="grid">
       <p>Paid personally <strong>{money(selected.personal_spend_cents)}</strong></p>
       <p>Spent from advances <strong>{money(selected.advance_spend_cents)}</strong></p>
       <p>Advances received <strong>{money(selected.advances_cents)}</strong></p>
       <p>Reimbursements received <strong>{money(selected.reimbursements_cents)}</strong></p>
       <p>Returned to the company <strong>{money(selected.returns_cents)}</strong></p>
     </div>
     {detailsData.summary.provisional && <p className="notice">Settlement is provisional. Expenses awaiting funding review are excluded.</p>}
     <h3>What {selected.name} spent on</h3>
     {monthlyExpenses.length ? <>
       <label>Expenses per page
         <select value={detailsPageSize} onChange={event => {
           setDetailsPageSize(Number(event.target.value));
           setDetailsPage(1);
         }}>
           {[10, 25, 50, 100].map(size => <option key={size} value={size}>{size}</option>)}
         </select>
       </label>
       <div className="scroll"><table>
       <thead><tr><th>Date</th><th>Vendor / purpose</th><th>Amount</th><th>Funding</th></tr></thead>
       <tbody>{visibleDetails.map(expense => <tr key={expense.id}>
         <td>{expense.day}</td>
         <td>{expense.merchant || '—'}<small>{expense.description || 'No purpose recorded'}</small>
           {expense.image_path && <a href={API + '/expenses/' + expense.id + '/screenshot'} target="_blank" rel="noreferrer">View receipt</a>}
         </td>
         <td>{expense.currency} {expense.amount}</td>
         <td>{expense.reviewed ? sources[expense.funding_source] : 'Needs review · excluded'}</td>
       </tr>)}</tbody>
     </table></div>
       <div className="row" aria-label="Expense pagination">
         <button type="button" disabled={currentDetailsPage === 1} onClick={() => setDetailsPage(currentDetailsPage - 1)}>Previous</button>
         <span role="status">{detailsStart + 1}–{detailsStart + visibleDetails.length} of {monthlyExpenses.length} expenses · Page {currentDetailsPage} of {detailsPageCount}</span>
         <button type="button" disabled={currentDetailsPage === detailsPageCount} onClick={() => setDetailsPage(currentDetailsPage + 1)}>Next</button>
       </div>
     </> : <p>No expenses recorded for this person in the selected month.</p>}
     <h3>Money movements</h3>
     {monthlyMovements.length ? <ul>{monthlyMovements.map(entry => <li key={entry.id}>
       {entry.occurred_on} · {labels[entry.kind]} · {money(entry.amount_cents)} · {entry.purpose}
       {entry.voided_at && ' · Voided'}
     </li>)}</ul> : <p>No money movements in the selected month.</p>}
   </>}
 </dialog>
 </main>
}
