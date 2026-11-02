'use client';
import {useEffect,useState} from 'react';
import {expenseApiBase} from './expenseApi';
export default function StrictSyncStatus(){
 const [status,setStatus]=useState(null),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 async function refresh(){try{const r=await fetch(`${expenseApiBase()}/strict-sync/status`,{cache:'no-store'});const d=await r.json();setStatus(r.ok?d:{enabled:true,locked:true});}catch{setStatus({enabled:true,locked:true});}}
 useEffect(()=>{void refresh();const timer=setInterval(refresh,10000);return()=>clearInterval(timer)},[]);
 async function check(){setBusy(true);setMessage('Checking…');try{const r=await fetch(`${expenseApiBase()}/strict-sync/check`,{method:'POST',headers:{'X-Oak-Sync-Action':'check'}});const d=await r.json();setMessage(r.ok?'Check completed. Every save still requires fresh verification.':d.error||'Verification failed. Changes remain locked.');}catch{setMessage('Verification unavailable. Changes remain locked.')}finally{setBusy(false);await refresh()}}
 if(!status||status.enabled===false)return null;
 return <section role="status" aria-live="polite" style={{border:'1px solid #bd8c45',borderRadius:12,padding:16,marginBottom:16}}>
  <strong>Strict sync — changes require verification</strong>
  <p>Both systems must be online and verified. Browsing remains available. This staging patch has no live sync adapter.</p>
  <button type="button" disabled={busy} onClick={check}>{busy?'Checking…':'Check & Sync'}</button>
  <p>{message||status.reason||'Coordinator unavailable; changes are locked.'}</p>
 </section>;
}
