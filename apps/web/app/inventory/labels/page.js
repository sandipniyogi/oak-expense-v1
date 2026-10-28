'use client';

import { useEffect, useMemo, useState } from 'react';
import styles from '../inventory.module.css';

function apiBase(){ return typeof window !== 'undefined' && window.location.port === '3100' ? 'http://localhost:4300' : 'http://localhost:4200'; }

export default function BatchLabels(){
  const [data,setData]=useState(null); const [message,setMessage]=useState(''); const [query,setQuery]=useState(''); const [category,setCategory]=useState('ALL'); const [selected,setSelected]=useState({});
  async function request(url){const r=await fetch(url);const b=await r.json().catch(()=>({}));if(!r.ok)throw new Error(b.error||`Request failed (${r.status})`);return b;}
  useEffect(()=>{request(`${apiBase()}/dashboard`).then(setData).catch(e=>setMessage(e.message));},[]);
  const visible=useMemo(()=> (data?.products||[]).filter(p=>(category==='ALL'||p.category_id===category)&&(!query||`${p.name} ${p.sku} ${p.category_name}`.toLowerCase().includes(query.toLowerCase()))),[data,category,query]);
  const chosen=(data?.products||[]).filter(p=>selected[p.id]);
  function toggle(id){setSelected(s=>({...s,[id]:!s[id]}));}
  function selectVisible(){setSelected(s=>{const n={...s};visible.forEach(p=>n[p.id]=true);return n;});}
  function clear(){setSelected({});}
  return <main className={styles.page}>
    <header className={`${styles.topbar} ${styles.labelPrintHide}`}><div><div className={styles.eyebrow}>Oak Lounge Inventory</div><h1 className={styles.title}>Barcode Label Center</h1><p className={styles.subtitle}>Select multiple Kitchen, Bar or Shisha products and print Oak Code128 labels in one batch.</p></div><nav className={styles.nav}><a href="/inventory">Dashboard</a><a href="/inventory/operations">Operations</a><a href="/inventory/scan">Scan</a><a href="/inventory/admin">Admin</a></nav></header>
    {message&&<div className={`${styles.message} ${styles.labelPrintHide}`}>{message}</div>}
    <section className={`${styles.panel} ${styles.labelPrintHide}`}><div className={styles.sectionHeader}><div><h2>Select labels</h2><p className={styles.help}>{chosen.length} selected</p></div><div className={styles.labelToolbar}><input placeholder="Search product / SKU" value={query} onChange={e=>setQuery(e.target.value)}/><select value={category} onChange={e=>setCategory(e.target.value)}><option value="ALL">All categories</option>{(data?.categories||[]).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select><button className={styles.secondary} onClick={selectVisible}>Select visible</button><button className={styles.secondary} onClick={clear}>Clear</button><button disabled={!chosen.length} onClick={()=>window.print()}>Print selected</button></div></div><div className={styles.tableWrap}><table><thead><tr><th></th><th>Category</th><th>Product</th><th>SKU</th><th>Oak barcode</th></tr></thead><tbody>{visible.map(p=><tr key={p.id}><td><input style={{width:'auto'}} type="checkbox" checked={Boolean(selected[p.id])} onChange={()=>toggle(p.id)}/></td><td>{p.category_name}</td><td><strong>{p.name}</strong><small>{p.subcategory||''}</small></td><td className={styles.code}>{p.sku}</td><td className={styles.code}>{p.internal_barcode}</td></tr>)}</tbody></table></div></section>
    <section><div className={styles.labelGrid}>{chosen.map(p=><article key={p.id} className={styles.labelCard}><div className={styles.eyebrow}>Oak Lounge · {p.category_name}</div><h3>{p.name}</h3><p className={styles.code}>{p.sku}</p><img src={`${apiBase()}/barcode/${encodeURIComponent(p.internal_barcode)}.png`} alt={`Barcode for ${p.name}`}/><p className={styles.code}>{p.internal_barcode}</p></article>)}</div>{!chosen.length&&<div className={`${styles.empty} ${styles.labelPrintHide}`}><h2>No labels selected</h2><p>Select products above, then use Print selected.</p></div>}</section>
  </main>;
}
