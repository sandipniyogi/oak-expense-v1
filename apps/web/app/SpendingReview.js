'use client';
import {useEffect,useRef,useState} from 'react';
export default function SpendingReview({api,filter,onReview,busy}){
 const [result,setResult]=useState(null),[working,setWorking]=useState(false),[message,setMessage]=useState('');
 const active=useRef(0);useEffect(()=>()=>{active.current++;},[]);
 async function run(){
  const id=++active.current;setWorking(true);setResult(null);setMessage('Calculating spending checks and asking local AI…');
  try{
   const response=await fetch(`${api}/reports/spending-review`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(filter),signal:AbortSignal.timeout(150000)});
   const data=await response.json();if(!response.ok)throw Error(data.error||'Spending review failed.');if(id===active.current){setResult(data);setMessage('Review ready. No expenses have been changed.');}
  }catch(e){if(id===active.current)setMessage(e.name==='TimeoutError'?'Review timed out. Retry when local AI is ready.':e.message);}
  finally{if(id===active.current)setWorking(false);}
 }
 return <section style={{padding:16,border:'1px solid #d6d0c5',borderRadius:12,margin:'16px 0'}} aria-label="AI spending review">
  <h3>Spending checks and suggestions</h3><p>Choose start and end dates and generate the report. Compare category spending with the preceding period of the same length. Flags are prompts to review, not confirmed mistakes.</p>
  <button disabled={busy||working||!filter.from||!filter.to} onClick={run}>{working?'Reviewing…':'AI spending review'}</button>
  {message&&<p role="status">{message}</p>}
  {result&&<><p>Compared with {result.previous_period.from} → {result.previous_period.to}, using the same payer, category, payment-method and amount filters.</p>
   <div className="tablewrap"><table><thead><tr><th>Category</th><th>Currency</th><th>Selected period</th><th>Previous period</th><th>Change</th></tr></thead><tbody>{result.categories.map((g,i)=><tr key={i}><td>{g.category}</td><td>{g.currency}</td><td>{g.current}</td><td>{g.previous}</td><td>{g.change} ({g.percent===null?'No previous spend':`${g.percent}%`})</td></tr>)}</tbody></table></div>
   <p>{result.checks_scope} Showing up to 50 flagged payments.</p><h4>Payments to check ({result.flagged_count})</h4>
   {!result.flagged_count&&<p>No missing-purpose/category/vendor or possible-repeat flags in the checked transactions.</p>}
   {result.flags.map(f=><div key={f.id} style={{marginBottom:12}}><strong>{f.merchant||'Vendor missing'} · {f.amount}</strong><ul>{f.reasons.map((reason,i)=><li key={i}>{reason}</li>)}</ul><button disabled={busy} onClick={()=>onReview({id:f.id})}>Review / edit payment</button></div>)}
   <p>{result.ai_status}</p>{result.ai&&<><h4>AI suggestions</h4><p>{result.ai.summary}</p><ul>{result.ai.actions.map((a,i)=><li key={i}>{a}</li>)}</ul></>}
   <p>{result.note}</p><p>For large increases, compare purchase quantities, unit prices and operating needs before deciding whether to reduce spending. Set budgets after confirming those needs.</p>
  </>}
 </section>;
}
