'use client';
import {useEffect,useRef,useState} from 'react';
import {manualScreenshotReview,readableSuggestions,manualReviewIsCurrent} from './manualScreenshotReview.mjs';
export default function ExpenseReview({api,form,file,ocr,categories,busy,review,onReview,onAttachment,onField}){
 const [working,setWorking]=useState(false),[message,setMessage]=useState('');
 const active=useRef(0);
 useEffect(()=>()=>{active.current+=1;},[]);
 const snapshot=JSON.stringify(form);
 const current=useRef(snapshot);current.current=snapshot;
 const stale=review&&!manualReviewIsCurrent(review,form);
 async function run(){
  if(working||busy)return;
  const id=++active.current;const input={...form};const captured=JSON.stringify(input);
  setWorking(true);onReview(null);setMessage('Reading the manual screenshot, then asking local AI…');
  try{
   const reading=await manualScreenshotReview({api,file,existing:ocr});
   if(id!==active.current)return;
   const evidence=reading.ocr;
   if(evidence?.image_path)onAttachment(evidence);
   setMessage((reading.warning?reading.warning+' ':'')+'Asking local AI… this can take up to two minutes.');
   const response=await fetch(`${api}/expenses/review`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({expense:input,ocr:evidence?{amount:evidence.amount,merchant:evidence.merchant,expense_date:evidence.expense_date,lines:evidence.lines}:null}),signal:AbortSignal.timeout(130000)});
   const result=await response.json();if(!response.ok)throw Error(result.error||'AI review unavailable.');
   if(id!==active.current)return;
   if(current.current!==captured){setMessage('The fields changed during AI review. Run it again for the current details.');return;}
   onReview({input,result,screenshot_fields:readableSuggestions(evidence),reading_warning:reading.warning,reviewed_at:new Date().toISOString()});setMessage((reading.warning?reading.warning+' ':'')+'Suggestions ready. Check each value before using it.');
  }catch(error){if(id===active.current)setMessage(error.name==='TimeoutError'?'Local AI timed out. You can continue manually.':error.message||'Local AI unavailable. Continue manually.');}
  finally{if(id===active.current)setWorking(false);}
 }
 return <div className="ai-expense-review" style={{margin:'16px 0',padding:14,border:'1px solid #d6d0c5',borderRadius:10}}>
  <h3>Help with this manual / other-app receipt</h3>
  <p>The screenshot is read with OCR, then local AI uses the text and your explanation to suggest a category and flag details to check. It cannot confirm what was purchased or approve this expense. Manual entry always remains available.</p>
  <button type="button" disabled={busy||working||!categories.length} onClick={run}>{working?'Reviewing…':'Read screenshot and suggest details'}</button>
  {message&&<p role="status">{message}</p>}
  {review&&<div>
   {stale&&<p className="warn">These suggestions are for earlier values. Run AI review again for the current fields, or finish reviewing manually.</p>}
   {review.screenshot_fields?.length>0&&<div><strong>Read from screenshot — check before using:</strong><ul>{review.screenshot_fields.map(item=><li key={item.field}>{item.label}: {item.value} <button type="button" disabled={busy||working||stale} onClick={()=>onField(item.field,item.value)}>Use {item.label.toLowerCase()}</button></li>)}</ul></div>}
   <p><strong>Suggested category:</strong> {review.result.category?.name||'Needs human choice'}</p>
   <p>{review.result.reason}</p>
   {review.result.category&&<button type="button" disabled={busy||working||stale} onClick={()=>onField('category_id',review.result.category.id)}>Use suggested category</button>}
   {review.result.warnings.length>0&&<ul>{review.result.warnings.map((warning,i)=><li key={i}>{warning}</li>)}</ul>}
   <small>Model: {review.result.model}. These are suggestions, not verified facts.</small>
  </div>}
 </div>;
}
