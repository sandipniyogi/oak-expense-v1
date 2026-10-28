'use client';

import { useEffect, useState } from 'react';
import styles from '../../inventory.module.css';

function apiBase(){ return typeof window !== 'undefined' && window.location.port === '3100' ? 'http://localhost:4300' : 'http://localhost:4200'; }

export default function ProductLabel({params}){
  const [product,setProduct]=useState(null); const [message,setMessage]=useState('');
  useEffect(()=>{Promise.resolve(params).then(p=>fetch(`${apiBase()}/products/${p.id}`).then(async r=>{const b=await r.json();if(!r.ok)throw new Error(b.error||'Product not found');setProduct(b.product);}).catch(e=>setMessage(e.message)));},[params]);
  return <main className={styles.page}><div className={`${styles.noPrint} ${styles.nav}`}><a href="/inventory/admin">← Admin</a><button onClick={()=>window.print()}>Print label</button></div>{message&&<div className={styles.message}>{message}</div>}{product&&<section className={styles.labelSheet}><div className={styles.eyebrow}>Oak Lounge · {product.category_name}</div><h1>{product.name}</h1><h2>{product.subcategory||product.category_name}</h2><img className={styles.barcodeImage} src={`${apiBase()}/barcode/${encodeURIComponent(product.internal_barcode)}.png`} alt={`Barcode ${product.internal_barcode}`}/><p className={styles.code}>{product.sku}</p></section>}</main>;
}
