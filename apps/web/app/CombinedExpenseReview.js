'use client';
import {useEffect,useRef,useState} from 'react';
import {combinedReviewInput,combinedReviewKey} from './combinedReview.mjs';
export default function CombinedExpenseReview({api,form,parts,total,categories,busy,review,onReview,onCategory}){
 const [working,setWorking]=useState(false),[message,setMessage]=useState('');
 const active=useRef(0);useEffect(()=>()=>{active.current++;},[]);
 const key=combinedReviewKey(form,parts,total),current=useRef(key);current.current=key;
 const stale=review&&review.key!==key;
 async function run(){
  const captured=key,id=++active.current;setWorking(true);onReview(null);
  setMessage('Asking local AI about the combined expense…');
  try{
   const r=await fetch(`${api}/expenses/review`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(combinedReviewInput(form,parts,total)),signal:AbortSignal.timeout(130000)});
   const result=await r.json();if(!r.ok)throw Error(result.error||'AI review unavailable.');
   if(id!==active.current)return;
   if(current.current!==captured){setMessage('Details changed. Run AI again for the current expense.');return;}
   onReview({key:captured,result,reviewed_at:new Date().toISOString()});setMessage('Review the suggestion and warnings before saving.');
  }catch(e){if(id===active.current)setMessage(e.name==='TimeoutError'?'AI timed out. Continue manually.':e.message+' You can continue manually.');}
  finally{if(id===active.current)setWorking(false);}
 }
 return <div className="ai-expense-review" style={{padding:14,margin:'16px 0',border:'1px solid #d6d0c5',borderRadius:10}}>
  <h3>AI help for this combined expense</h3>
  <p>First read the screenshots, then explain what these payments were for. Local AI uses the available OCR text and your explanation to suggest a category and flag details to check. It does not change amounts, vendor, payer or purpose.</p>
  {parts.some(p=>!p.data?.lines?.length)&&<p className="warn">Some screenshots have no readable text. Use Read screenshots before attaching manually, or describe their contents below. AI cannot inspect unread image details.</p>}
  <button type="button" disabled={busy||working||!categories.length||parts.some(p=>p.status!=='ready')} onClick={run}>{working?'Reviewing…':'Suggest category and check combined expense'}</button>
  {message&&<p role="status">{message}</p>}
  {review&&<><p><strong>Suggested category:</strong> {review.result.category?.name||'Needs human choice'}</p><p>{review.result.reason}</p>
   {stale&&<p className="warn">These suggestions are for earlier details. Run AI again or review manually.</p>}
   {review.result.category&&<button type="button" disabled={busy||working||stale} onClick={()=>onCategory(review.result.category.id)}>Use suggested category</button>}
   <ul>{(review.result.warnings||[]).map((w,i)=><li key={i}>{w}</li>)}</ul><small>Model: {review.result.model}. Suggestions require human review.</small></>}
 </div>;
}
