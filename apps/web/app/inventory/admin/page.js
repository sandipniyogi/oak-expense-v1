'use client';

import { useEffect, useMemo, useState } from 'react';
import styles from '../inventory.module.css';

function apiBase(){ return '/module-api/inventory'; }

function aiBase(){ return '/module-api/ai'; }

function emptyProduct(){
  return {
    name:'', sku:'', category_id:'', subcategory:'', tracking_type:'weight',
    display_unit:'kg', reorder_point:'0', par_level:'0', pack_label:'',
    pack_quantity:'', pack_unit:'kg', notes:''
  };
}

function unitOptions(trackingType){
  if(trackingType === 'weight') return ['kg','g'];
  if(trackingType === 'volume') return ['L','ml'];
  return ['each'];
}

function convertDisplayValue(value,fromUnit,toUnit){
  const x=Number(value);
  if(!Number.isFinite(x)||fromUnit===toUnit) return value;
  if(fromUnit==='kg'&&toUnit==='g') return String(x*1000);
  if(fromUnit==='g'&&toUnit==='kg') return String(x/1000);
  if(fromUnit==='L'&&toUnit==='ml') return String(x*1000);
  if(fromUnit==='ml'&&toUnit==='L') return String(x/1000);
  return value;
}

export default function InventoryAdmin(){
  const [data,setData]=useState(null);
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);
  const [tab,setTab]=useState('products');

  const [product,setProduct]=useState(emptyProduct());
  const [selectedId,setSelectedId]=useState('');
  const [pack,setPack]=useState({label:'',quantity:'',unit:'kg',barcode:''});
  const [barcode,setBarcode]=useState('');
  const [category,setCategory]=useState({name:'',code:''});
  const [supplier,setSupplier]=useState({name:'',contact_name:'',phone:'',email:''});
  const [location,setLocation]=useState({name:'',code:'',category_id:''});

  const [editProduct,setEditProduct]=useState(null);
  const [editCategory,setEditCategory]=useState(null);
  const [editSupplier,setEditSupplier]=useState(null);
  const [editLocation,setEditLocation]=useState(null);
  const [editPack,setEditPack]=useState(null);
  const [editBarcode,setEditBarcode]=useState(null);

  const [aiPrompt,setAiPrompt]=useState('');
  const [aiProposal,setAiProposal]=useState(null);
  const [aiHealth,setAiHealth]=useState(null);
  const [aiBusy,setAiBusy]=useState(false);

  async function request(url,options){
    const r=await fetch(url,options);
    const b=await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(b.error||`Request failed (${r.status})`);
    return b;
  }

  async function load(){
    try{
      const d=await request(`${apiBase()}/dashboard`);
      setData(d);
      if(!product.category_id&&d.categories?.[0]) setProduct(p=>({...p,category_id:d.categories[0].id}));
      if(!location.category_id&&d.categories?.[0]) setLocation(p=>({...p,category_id:d.categories[0].id}));
    }catch(e){ setMessage(e.message); }
  }

  useEffect(()=>{ load(); },[]);

  const selected=useMemo(
    ()=>data?.products?.find(p=>p.id===selectedId)||null,
    [data,selectedId]
  );

  function trackingChanged(v){
    const du=v==='weight'?'kg':v==='volume'?'L':'each';
    setProduct(p=>({...p,tracking_type:v,display_unit:du,pack_unit:du}));
    setPack(p=>({...p,unit:du}));
  }

  async function createProduct(e){
    e.preventDefault(); setBusy(true);
    try{
      await request(`${apiBase()}/products`,{
        method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(product)
      });
      setProduct(p=>({...emptyProduct(),category_id:p.category_id}));
      setMessage('Product created. Oak generated an internal barcode automatically.');
      await load();
    }catch(e){ setMessage(e.message); }finally{ setBusy(false); }
  }

  async function createCategory(e){
    e.preventDefault(); setBusy(true);
    try{
      await request(`${apiBase()}/categories`,{
        method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(category)
      });
      setCategory({name:'',code:''}); setMessage('Category created.'); await load();
    }catch(e){ setMessage(e.message); }finally{ setBusy(false); }
  }

  async function createSupplier(e){
    e.preventDefault(); setBusy(true);
    try{
      await request(`${apiBase()}/suppliers`,{
        method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(supplier)
      });
      setSupplier({name:'',contact_name:'',phone:'',email:''}); setMessage('Supplier created.'); await load();
    }catch(e){ setMessage(e.message); }finally{ setBusy(false); }
  }

  async function createLocation(e){
    e.preventDefault(); setBusy(true);
    try{
      await request(`${apiBase()}/locations`,{
        method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(location)
      });
      setLocation(p=>({name:'',code:'',category_id:p.category_id})); setMessage('Stock location created.'); await load();
    }catch(e){ setMessage(e.message); }finally{ setBusy(false); }
  }

  async function addPack(e){
    e.preventDefault(); if(!selected)return; setBusy(true);
    try{
      await request(`${apiBase()}/products/${selected.id}/packs`,{
        method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(pack)
      });
      setPack({label:'',quantity:'',unit:selected.display_unit,barcode:''});
      setMessage('Pack size added.'); await load();
    }catch(e){ setMessage(e.message); }finally{ setBusy(false); }
  }

  async function addBarcode(e){
    e.preventDefault(); if(!selected)return; setBusy(true);
    try{
      await request(`${apiBase()}/products/${selected.id}/barcodes`,{
        method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({barcode})
      });
      setBarcode(''); setMessage('Supplier barcode assigned to product.'); await load();
    }catch(e){ setMessage(e.message); }finally{ setBusy(false); }
  }

  async function seed(){
    setBusy(true);
    try{
      setData(await request(`${apiBase()}/seed-samples`,{method:'POST'}));
      setMessage('Three sample products were added for testing.');
    }catch(e){ setMessage(e.message); }finally{ setBusy(false); }
  }

  function startProductEdit(p){
    setEditProduct({
      id:p.id, name:p.name, sku:p.sku, category_id:p.category_id,
      subcategory:p.subcategory||'', tracking_type:p.tracking_type,
      display_unit:p.display_unit, reorder_point:String(p.reorder_display??0),
      par_level:String(p.par_display??0), notes:p.notes||''
    });
    setMessage('');
  }

  function changeEditDisplayUnit(newUnit){
    setEditProduct(p=>p?({
      ...p,
      display_unit:newUnit,
      reorder_point:convertDisplayValue(p.reorder_point,p.display_unit,newUnit),
      par_level:convertDisplayValue(p.par_level,p.display_unit,newUnit)
    }):p);
  }

  async function saveProduct(e){
    e.preventDefault(); if(!editProduct)return; setBusy(true);
    try{
      await request(`${apiBase()}/products/${editProduct.id}`,{
        method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify(editProduct)
      });
      setMessage('Product updated. Existing stock history and Oak internal barcode were preserved.');
      setEditProduct(null); await load();
    }catch(e){ setMessage(e.message); }finally{ setBusy(false); }
  }

  function startCategoryEdit(c){
    setEditCategory({id:c.id,name:c.name,code:c.code,sort_order:String(c.sort_order??100)});
    setMessage('');
  }

  async function saveCategory(e){
    e.preventDefault(); if(!editCategory)return; setBusy(true);
    try{
      await request(`${apiBase()}/categories/${editCategory.id}`,{
        method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(editCategory)
      });
      setMessage('Category updated.'); setEditCategory(null); await load();
    }catch(e){ setMessage(e.message); }finally{ setBusy(false); }
  }

  function startSupplierEdit(s){
    setEditSupplier({id:s.id,name:s.name,contact_name:s.contact_name||'',phone:s.phone||'',email:s.email||'',notes:s.notes||''});
    setMessage('');
  }

  async function saveSupplier(e){
    e.preventDefault(); if(!editSupplier)return; setBusy(true);
    try{
      await request(`${apiBase()}/suppliers/${editSupplier.id}`,{
        method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(editSupplier)
      });
      setMessage('Supplier updated.'); setEditSupplier(null); await load();
    }catch(e){ setMessage(e.message); }finally{ setBusy(false); }
  }

  function startLocationEdit(l){
    setEditLocation({id:l.id,name:l.name,code:l.code,category_id:l.category_id||''});
    setMessage('');
  }

  async function saveLocation(e){
    e.preventDefault(); if(!editLocation)return; setBusy(true);
    try{
      await request(`${apiBase()}/locations/${editLocation.id}`,{
        method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(editLocation)
      });
      setMessage('Stock location updated.'); setEditLocation(null); await load();
    }catch(e){ setMessage(e.message); }finally{ setBusy(false); }
  }

  function startPackEdit(p){
    setEditPack({id:p.id,label:p.label,quantity:String(p.qty_display),unit:selected?.display_unit||'kg',preferred:Boolean(p.preferred)});
    setMessage('');
  }

  async function savePack(e){
    e.preventDefault(); if(!selected||!editPack)return; setBusy(true);
    try{
      await request(`${apiBase()}/products/${selected.id}/packs/${editPack.id}`,{
        method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(editPack)
      });
      setMessage('Pack size updated. Historical receipts keep their original quantities.');
      setEditPack(null); await load();
    }catch(e){ setMessage(e.message); }finally{ setBusy(false); }
  }

  function startBarcodeEdit(b){
    setEditBarcode({id:b.id,barcode:b.barcode,barcode_type:b.barcode_type});
    setMessage('');
  }

  async function saveBarcode(e){
    e.preventDefault(); if(!selected||!editBarcode)return; setBusy(true);
    try{
      await request(`${apiBase()}/products/${selected.id}/barcodes/${editBarcode.id}`,{
        method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({barcode:editBarcode.barcode})
      });
      setMessage('Barcode updated.'); setEditBarcode(null); await load();
    }catch(e){ setMessage(e.message); }finally{ setBusy(false); }
  }

  async function checkAi(){
    setAiBusy(true);
    try{
      const h=await request(`${aiBase()}/health`);
      setAiHealth(h);
      setMessage(h.model_available ? `Local AI ready: ${h.model}` : `Oak AI service is running, but ${h.model} is not available in Ollama.`);
    }catch(e){
      setAiHealth({ok:false,error:e.message});
      setMessage(`Local AI unavailable: ${e.message}`);
    }finally{ setAiBusy(false); }
  }

  async function analyzeWithAi(e){
    e?.preventDefault?.();
    if(!aiPrompt.trim()) { setMessage('Describe the product you want Oak AI to prepare.'); return; }
    setAiBusy(true); setAiProposal(null);
    try{
      const result=await request(`${aiBase()}/product-proposal`,{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          prompt:aiPrompt,
          categories:(data?.categories||[]).map(c=>({name:c.name,code:c.code})),
          existing_products:(data?.products||[]).map(p=>({name:p.name,sku:p.sku,category_code:p.category_code,subcategory:p.subcategory||''}))
        })
      });
      setAiProposal(result.proposal);
      setAiHealth(result.health||aiHealth);
      setMessage('Oak AI prepared a proposal. Review every field before approving.');
    }catch(e){
      setMessage(`Oak AI could not prepare the proposal: ${e.message}`);
    }finally{ setAiBusy(false); }
  }

  function updateAiProduct(field,value){
    setAiProposal(p=>p?({...p,product:{...p.product,[field]:value}}):p);
  }

  function updateAiPack(index,field,value){
    setAiProposal(p=>p?({...p,packs:p.packs.map((x,i)=>i===index?{...x,[field]:value}:x)}):p);
  }

  function removeAiPack(index){
    setAiProposal(p=>p?({...p,packs:p.packs.filter((_,i)=>i!==index)}):p);
  }

  function addAiPack(){
    setAiProposal(p=>p?({...p,packs:[...p.packs,{label:'',quantity:1,unit:p.product.display_unit||'each'}]}):p);
  }

  async function approveAiProposal(){
    if(!aiProposal) return;
    setAiBusy(true);
    try{
      const created=await request(`${apiBase()}/ai/apply-product-proposal`,{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({prompt:aiPrompt,proposal:aiProposal,approved_by:'Oak Admin'})
      });
      setMessage(`Created ${created.product.name} from the approved AI proposal. Oak barcode: ${created.product.internal_barcode}`);
      setAiProposal(null); setAiPrompt('');
      await load();
    }catch(e){ setMessage(`Could not apply AI proposal: ${e.message}`); }
    finally{ setAiBusy(false); }
  }

  return <main className={styles.page}>
    <header className={styles.topbar}>
      <div>
        <div className={styles.eyebrow}>Oak Lounge Inventory</div>
        <h1 className={styles.title}>Admin Panel</h1>
        <p className={styles.subtitle}>Create and edit categories, products, pack sizes, suppliers, stock locations and external barcodes.</p>
      </div>
      <nav className={styles.nav}>
        <a href="/inventory">Dashboard</a><a href="/inventory/operations">Operations</a><a href="/inventory/receive">Receive</a><a href="/inventory/scan">Scan</a><a href="/inventory/labels">Labels</a>
      </nav>
    </header>

    {message&&<div className={styles.message}>{message}</div>}

    <div className={styles.adminTabs}>
      {['products','categories','suppliers','locations','barcodes','ai'].map(x=><button key={x} className={tab===x?styles.active:''} onClick={()=>setTab(x)}>{x==='ai'?'AI Assistant':x[0].toUpperCase()+x.slice(1)}</button>)}
    </div>

    {tab==='products'&&<>
      <section className={styles.panel}>
        <div className={styles.sectionHeader}>
          <div><h2>Add product</h2><p className={styles.help}>Choose Kitchen, Bar or Shisha first, then define how Oak tracks the item.</p></div>
          <button className={styles.secondary} onClick={seed} disabled={busy}>Add sample products</button>
        </div>
        <form onSubmit={createProduct}>
          <div className={styles.formGrid3}>
            <label>Category<select required value={product.category_id} onChange={e=>setProduct(p=>({...p,category_id:e.target.value}))}><option value="">Select category</option>{(data?.categories||[]).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
            <label>Product name<input required value={product.name} onChange={e=>setProduct(p=>({...p,name:e.target.value}))} placeholder="e.g. Double Apple Flavor"/></label>
            <label>SKU<input required value={product.sku} onChange={e=>setProduct(p=>({...p,sku:e.target.value}))} placeholder="e.g. SHI-DOUBLEAPPLE"/></label>
            <label>Subcategory<input value={product.subcategory} onChange={e=>setProduct(p=>({...p,subcategory:e.target.value}))} placeholder="Flavor / Spirits / Protein"/></label>
            <label>Tracking type<select value={product.tracking_type} onChange={e=>trackingChanged(e.target.value)}><option value="weight">Weight</option><option value="volume">Volume</option><option value="count">Count</option></select></label>
            <label>Display unit<select value={product.display_unit} onChange={e=>setProduct(p=>({...p,display_unit:e.target.value,pack_unit:e.target.value}))}>{unitOptions(product.tracking_type).map(u=><option key={u} value={u}>{u}</option>)}</select></label>
            <label>Reorder at<input type="number" min="0" step="any" value={product.reorder_point} onChange={e=>setProduct(p=>({...p,reorder_point:e.target.value}))}/></label>
            <label>Target / par level<input type="number" min="0" step="any" value={product.par_level} onChange={e=>setProduct(p=>({...p,par_level:e.target.value}))}/></label>
            <label>First pack label<input value={product.pack_label} onChange={e=>setProduct(p=>({...p,pack_label:e.target.value}))} placeholder="200 g box / 750 ml bottle"/></label>
            <label>Pack quantity<input type="number" min="0" step="any" value={product.pack_quantity} onChange={e=>setProduct(p=>({...p,pack_quantity:e.target.value}))}/></label>
            <label>Pack unit<select value={product.pack_unit} onChange={e=>setProduct(p=>({...p,pack_unit:e.target.value}))}>{unitOptions(product.tracking_type).map(u=><option key={u} value={u}>{u}</option>)}</select></label>
            <label>Notes<input value={product.notes} onChange={e=>setProduct(p=>({...p,notes:e.target.value}))}/></label>
          </div>
          <div className={styles.buttonRow}><button disabled={busy}>Create product + barcode</button></div>
        </form>
      </section>

      {editProduct&&<section className={`${styles.panel} ${styles.editPanel}`}>
        <div className={styles.sectionHeader}><div><h2>Edit product</h2><p className={styles.help}>Edit the product without losing stock movements, receipts or barcode history.</p></div><button type="button" className={styles.secondary} onClick={()=>setEditProduct(null)}>Cancel</button></div>
        <form onSubmit={saveProduct}>
          <div className={styles.formGrid3}>
            <label>Category<select required value={editProduct.category_id} onChange={e=>setEditProduct(p=>({...p,category_id:e.target.value}))}>{(data?.categories||[]).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
            <label>Product name<input required value={editProduct.name} onChange={e=>setEditProduct(p=>({...p,name:e.target.value}))}/></label>
            <label>SKU<input required value={editProduct.sku} onChange={e=>setEditProduct(p=>({...p,sku:e.target.value}))}/></label>
            <label>Subcategory<input value={editProduct.subcategory} onChange={e=>setEditProduct(p=>({...p,subcategory:e.target.value}))}/></label>
            <label>Tracking type<input value={editProduct.tracking_type} disabled/><span className={styles.lockNote}>Locked after creation to protect historical quantities.</span></label>
            <label>Display unit<select value={editProduct.display_unit} onChange={e=>changeEditDisplayUnit(e.target.value)}>{unitOptions(editProduct.tracking_type).map(u=><option key={u} value={u}>{u}</option>)}</select></label>
            <label>Reorder at<input type="number" min="0" step="any" value={editProduct.reorder_point} onChange={e=>setEditProduct(p=>({...p,reorder_point:e.target.value}))}/></label>
            <label>Target / par level<input type="number" min="0" step="any" value={editProduct.par_level} onChange={e=>setEditProduct(p=>({...p,par_level:e.target.value}))}/></label>
            <label>Notes<input value={editProduct.notes} onChange={e=>setEditProduct(p=>({...p,notes:e.target.value}))}/></label>
          </div>
          <div className={styles.buttonRow}><button disabled={busy}>Save product changes</button><button type="button" className={styles.secondary} onClick={()=>setEditProduct(null)}>Cancel</button></div>
        </form>
      </section>}

      <section className={styles.panel}>
        <h2>Products</h2><p className={styles.help}>Use Edit for product details, or Manage for pack sizes and barcodes.</p>
        <div className={styles.tableWrap}><table><thead><tr><th>Category</th><th>Product</th><th>SKU</th><th>Unit</th><th>Internal barcode</th><th>Actions</th></tr></thead><tbody>
          {(data?.products||[]).map(p=><tr key={p.id}><td>{p.category_name}</td><td>{p.name}<small>{p.subcategory||''}</small></td><td className={styles.code}>{p.sku}</td><td>{p.display_unit}</td><td className={styles.code}>{p.internal_barcode}</td><td><div className={styles.actions}><button className={styles.secondary} onClick={()=>startProductEdit(p)}>Edit</button><button className={styles.secondary} onClick={()=>{setSelectedId(p.id);setPack(x=>({...x,unit:p.display_unit}));setEditPack(null);setEditBarcode(null);setTab('barcodes');}}>Manage</button></div></td></tr>)}
        </tbody></table></div>
      </section>
    </>}

    {tab==='categories'&&<>
      <div className={styles.grid2}>
        <section className={styles.panel}><h2>Add category</h2><p className={styles.help}>Kitchen, Bar and Shisha already exist. Add more only if Oak Lounge needs them.</p><form onSubmit={createCategory}><div className={styles.formGrid}><label>Name<input required value={category.name} onChange={e=>setCategory(p=>({...p,name:e.target.value}))}/></label><label>Code<input value={category.code} onChange={e=>setCategory(p=>({...p,code:e.target.value}))} placeholder="AUTO IF BLANK"/></label></div><div className={styles.buttonRow}><button disabled={busy}>Add category</button></div></form></section>
        <section className={styles.panel}><h2>Categories</h2><div className={styles.tableWrap}><table><thead><tr><th>Name</th><th>Code</th><th>Order</th><th></th></tr></thead><tbody>{(data?.categories||[]).map(c=><tr key={c.id}><td>{c.name}</td><td className={styles.code}>{c.code}</td><td>{c.sort_order}</td><td><button className={styles.secondary} onClick={()=>startCategoryEdit(c)}>Edit</button></td></tr>)}</tbody></table></div></section>
      </div>
      {editCategory&&<section className={`${styles.panel} ${styles.editPanel}`}><div className={styles.sectionHeader}><div><h2>Edit category</h2></div><button type="button" className={styles.secondary} onClick={()=>setEditCategory(null)}>Cancel</button></div><form onSubmit={saveCategory}><div className={styles.formGrid3}><label>Name<input required value={editCategory.name} onChange={e=>setEditCategory(p=>({...p,name:e.target.value}))}/></label><label>Code<input required value={editCategory.code} onChange={e=>setEditCategory(p=>({...p,code:e.target.value}))}/></label><label>Display order<input type="number" value={editCategory.sort_order} onChange={e=>setEditCategory(p=>({...p,sort_order:e.target.value}))}/></label></div><div className={styles.buttonRow}><button disabled={busy}>Save category</button></div></form></section>}
    </>}

    {tab==='suppliers'&&<>
      <div className={styles.grid2}>
        <section className={styles.panel}><h2>Add supplier</h2><form onSubmit={createSupplier}><div className={styles.formGrid}><label>Supplier name<input required value={supplier.name} onChange={e=>setSupplier(p=>({...p,name:e.target.value}))}/></label><label>Contact person<input value={supplier.contact_name} onChange={e=>setSupplier(p=>({...p,contact_name:e.target.value}))}/></label><label>Phone<input value={supplier.phone} onChange={e=>setSupplier(p=>({...p,phone:e.target.value}))}/></label><label>Email<input value={supplier.email} onChange={e=>setSupplier(p=>({...p,email:e.target.value}))}/></label></div><div className={styles.buttonRow}><button disabled={busy}>Add supplier</button></div></form></section>
        <section className={styles.panel}><h2>Suppliers</h2><div className={styles.tableWrap}><table><thead><tr><th>Supplier</th><th>Contact</th><th>Phone</th><th></th></tr></thead><tbody>{(data?.suppliers||[]).map(s=><tr key={s.id}><td>{s.name}</td><td>{s.contact_name||'—'}</td><td>{s.phone||'—'}</td><td><button className={styles.secondary} onClick={()=>startSupplierEdit(s)}>Edit</button></td></tr>)}</tbody></table></div></section>
      </div>
      {editSupplier&&<section className={`${styles.panel} ${styles.editPanel}`}><div className={styles.sectionHeader}><div><h2>Edit supplier</h2></div><button type="button" className={styles.secondary} onClick={()=>setEditSupplier(null)}>Cancel</button></div><form onSubmit={saveSupplier}><div className={styles.formGrid3}><label>Supplier name<input required value={editSupplier.name} onChange={e=>setEditSupplier(p=>({...p,name:e.target.value}))}/></label><label>Contact person<input value={editSupplier.contact_name} onChange={e=>setEditSupplier(p=>({...p,contact_name:e.target.value}))}/></label><label>Phone<input value={editSupplier.phone} onChange={e=>setEditSupplier(p=>({...p,phone:e.target.value}))}/></label><label>Email<input value={editSupplier.email} onChange={e=>setEditSupplier(p=>({...p,email:e.target.value}))}/></label><label>Notes<input value={editSupplier.notes} onChange={e=>setEditSupplier(p=>({...p,notes:e.target.value}))}/></label></div><div className={styles.buttonRow}><button disabled={busy}>Save supplier</button></div></form></section>}
    </>}

    {tab==='locations'&&<>
      <div className={styles.grid2}>
        <section className={styles.panel}><h2>Add stock location</h2><form onSubmit={createLocation}><div className={styles.formGrid}><label>Name<input required value={location.name} onChange={e=>setLocation(p=>({...p,name:e.target.value}))} placeholder="e.g. Bar Fridge"/></label><label>Category<select value={location.category_id} onChange={e=>setLocation(p=>({...p,category_id:e.target.value}))}>{(data?.categories||[]).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>Code<input value={location.code} onChange={e=>setLocation(p=>({...p,code:e.target.value}))} placeholder="AUTO IF BLANK"/></label></div><div className={styles.buttonRow}><button disabled={busy}>Add location</button></div></form></section>
        <section className={styles.panel}><h2>Locations</h2><div className={styles.tableWrap}><table><thead><tr><th>Location</th><th>Category</th><th>Code</th><th></th></tr></thead><tbody>{(data?.locations||[]).map(l=><tr key={l.id}><td>{l.name}</td><td>{l.category_name||'General'}</td><td className={styles.code}>{l.code}</td><td><button className={styles.secondary} onClick={()=>startLocationEdit(l)}>Edit</button></td></tr>)}</tbody></table></div></section>
      </div>
      {editLocation&&<section className={`${styles.panel} ${styles.editPanel}`}><div className={styles.sectionHeader}><div><h2>Edit stock location</h2></div><button type="button" className={styles.secondary} onClick={()=>setEditLocation(null)}>Cancel</button></div><form onSubmit={saveLocation}><div className={styles.formGrid3}><label>Name<input required value={editLocation.name} onChange={e=>setEditLocation(p=>({...p,name:e.target.value}))}/></label><label>Category<select value={editLocation.category_id} onChange={e=>setEditLocation(p=>({...p,category_id:e.target.value}))}><option value="">General / none</option>{(data?.categories||[]).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>Code<input required value={editLocation.code} onChange={e=>setEditLocation(p=>({...p,code:e.target.value}))}/></label></div><div className={styles.buttonRow}><button disabled={busy}>Save location</button></div></form></section>}
    </>}

    {tab==='ai'&&<>
      <section className={`${styles.panel} ${styles.aiPanel}`}>
        <div className={styles.sectionHeader}>
          <div>
            <div className={styles.aiEyebrow}>Local AI · Qwen3 8B</div>
            <h2>Oak Admin Assistant</h2>
            <p className={styles.help}>Describe a product in normal language. Oak AI prepares a structured proposal only; nothing is saved until you approve it.</p>
          </div>
          <button type="button" className={styles.secondary} onClick={checkAi} disabled={aiBusy}>Check local AI</button>
        </div>

        <div className={styles.aiStatusRow}>
          <span className={`${styles.aiStatus} ${aiHealth?.model_available?styles.aiStatusReady:aiHealth?styles.aiStatusWarn:''}`}>
            {aiHealth?.model_available?'Local AI ready':aiHealth?'AI needs attention':'Status not checked'}
          </span>
          <span className={styles.muted}>{aiHealth?.model||'qwen3:8b'} · Ollama stays on this Mac</span>
        </div>

        <form onSubmit={analyzeWithAi}>
          <label>Tell Oak AI what you want to add
            <textarea value={aiPrompt} onChange={e=>setAiPrompt(e.target.value)} placeholder="Example: Add Double Apple shisha flavor. We buy 200g and 1kg boxes. Track by weight in grams, reorder below 400g and target 2kg."/>
          </label>
          <div className={styles.aiExamples}>
            <button type="button" className={styles.secondary} onClick={()=>setAiPrompt('Add Double Apple shisha flavor. We buy 200g and 1kg boxes. Track by weight in grams, reorder below 400g and target 2kg.')}>Shisha example</button>
            <button type="button" className={styles.secondary} onClick={()=>setAiPrompt('Add Bombay Sapphire Gin to Bar, Spirits. Track by volume in ml. We buy 750ml bottles. Reorder below 1500ml and target 6 litres.')}>Bar example</button>
            <button type="button" className={styles.secondary} onClick={()=>setAiPrompt('Add chicken breast to Kitchen, Protein. Track by weight in kg. We normally receive 5kg packs. Reorder below 3kg and target 15kg.')}>Kitchen example</button>
          </div>
          <div className={styles.buttonRow}><button disabled={aiBusy||!aiPrompt.trim()}>{aiBusy?'Analyzing locally…':'Analyze with local AI'}</button></div>
        </form>
      </section>

      {aiProposal&&<section className={`${styles.panel} ${styles.aiProposal}`}>
        <div className={styles.sectionHeader}>
          <div><h2>AI proposed product</h2><p className={styles.help}>Review and edit the proposal. Approval uses the normal Inventory API and is recorded in the AI audit log.</p></div>
          <span className={styles.aiConfidence}>Confidence {Math.round(Number(aiProposal.confidence||0)*100)}%</span>
        </div>

        {aiProposal.summary&&<div className={styles.aiSummary}>{aiProposal.summary}</div>}
        {(aiProposal.warnings||[]).length>0&&<div className={styles.aiWarnings}><strong>Review notes</strong><ul>{aiProposal.warnings.map((w,i)=><li key={i}>{w}</li>)}</ul></div>}
        {(aiProposal.duplicate_candidates||[]).length>0&&<div className={styles.aiWarnings}><strong>Possible duplicates</strong><ul>{aiProposal.duplicate_candidates.map((w,i)=><li key={i}>{w}</li>)}</ul></div>}

        <div className={styles.formGrid3}>
          <label>Category<select value={aiProposal.product.category_code||''} onChange={e=>updateAiProduct('category_code',e.target.value)}>{(data?.categories||[]).map(c=><option key={c.id} value={c.code}>{c.name}</option>)}</select></label>
          <label>Product name<input value={aiProposal.product.name||''} onChange={e=>updateAiProduct('name',e.target.value)}/></label>
          <label>SKU<input value={aiProposal.product.sku||''} onChange={e=>updateAiProduct('sku',e.target.value)}/></label>
          <label>Subcategory<input value={aiProposal.product.subcategory||''} onChange={e=>updateAiProduct('subcategory',e.target.value)}/></label>
          <label>Tracking type<select value={aiProposal.product.tracking_type||'weight'} onChange={e=>{const t=e.target.value;const du=t==='weight'?'g':t==='volume'?'ml':'each';setAiProposal(p=>({...p,product:{...p.product,tracking_type:t,display_unit:du},packs:p.packs.map(x=>({...x,unit:du}))}));}}><option value="weight">Weight</option><option value="volume">Volume</option><option value="count">Count</option></select></label>
          <label>Display unit<select value={aiProposal.product.display_unit||'g'} onChange={e=>updateAiProduct('display_unit',e.target.value)}>{unitOptions(aiProposal.product.tracking_type||'weight').map(u=><option key={u} value={u}>{u}</option>)}</select></label>
          <label>Reorder at<input type="number" min="0" step="any" value={aiProposal.product.reorder_point??0} onChange={e=>updateAiProduct('reorder_point',e.target.value)}/></label>
          <label>Target / par level<input type="number" min="0" step="any" value={aiProposal.product.par_level??0} onChange={e=>updateAiProduct('par_level',e.target.value)}/></label>
          <label>Notes<input value={aiProposal.product.notes||''} onChange={e=>updateAiProduct('notes',e.target.value)}/></label>
        </div>

        <div className={styles.aiPackHeader}><h3>Suggested purchase packs</h3><button type="button" className={styles.secondary} onClick={addAiPack}>Add pack</button></div>
        <div className={styles.aiPackList}>
          {(aiProposal.packs||[]).map((p,i)=><div className={styles.aiPackRow} key={i}>
            <label>Label<input value={p.label||''} onChange={e=>updateAiPack(i,'label',e.target.value)}/></label>
            <label>Quantity<input type="number" min="0.0001" step="any" value={p.quantity??''} onChange={e=>updateAiPack(i,'quantity',e.target.value)}/></label>
            <label>Unit<select value={p.unit||aiProposal.product.display_unit} onChange={e=>updateAiPack(i,'unit',e.target.value)}>{unitOptions(aiProposal.product.tracking_type||'weight').map(u=><option key={u} value={u}>{u}</option>)}</select></label>
            <button type="button" className={styles.secondary} onClick={()=>removeAiPack(i)}>Remove</button>
          </div>)}
        </div>

        <div className={styles.aiApproval}>
          <div><strong>Human approval required</strong><span>AI cannot create or change inventory until you press Approve & Create.</span></div>
          <div className={styles.buttonRow}><button type="button" disabled={aiBusy} onClick={approveAiProposal}>Approve & Create</button><button type="button" className={styles.secondary} onClick={()=>setAiProposal(null)}>Cancel proposal</button></div>
        </div>
      </section>}
    </>}

    {tab==='barcodes'&&<>
      <section className={styles.panel}>
        <h2>Product barcode & pack management</h2>
        <p className={styles.help}>Each product receives a permanent Oak internal barcode. Supplier/pack barcodes and pack sizes can be edited here.</p>
        <label>Select product<select value={selectedId} onChange={e=>{setSelectedId(e.target.value);const p=data?.products?.find(x=>x.id===e.target.value);if(p)setPack(x=>({...x,unit:p.display_unit}));setEditPack(null);setEditBarcode(null);}}><option value="">Choose product</option>{(data?.products||[]).map(p=><option key={p.id} value={p.id}>{p.category_name} · {p.name}</option>)}</select></label>

        {selected&&<div className={styles.grid2} style={{marginTop:15}}>
          <div>
            <h3>{selected.name}</h3>
            <p>Oak barcode: <span className={styles.code}>{selected.internal_barcode}</span></p>
            <img className={styles.barcodeImage} src={`${apiBase()}/barcode/${encodeURIComponent(selected.internal_barcode)}.png`} alt={`Barcode for ${selected.name}`}/>
            <div className={styles.buttonRow}><a className={styles.button} href={`/inventory/labels/${selected.id}`}>Print label</a></div>

            <h3>Known barcodes</h3>
            <div className={styles.tableWrap}><table><thead><tr><th>Barcode</th><th>Type</th><th></th></tr></thead><tbody>{selected.barcodes.map(b=><tr key={b.id}><td className={styles.code}>{b.barcode}</td><td>{b.barcode_type}</td><td>{b.barcode_type==='internal'?<span className={styles.lockNote}>Locked</span>:<button className={styles.secondary} onClick={()=>startBarcodeEdit(b)}>Edit</button>}</td></tr>)}</tbody></table></div>

            {editBarcode&&<form className={styles.editCard} onSubmit={saveBarcode}><h3>Edit {editBarcode.barcode_type} barcode</h3><label>Barcode<input required value={editBarcode.barcode} onChange={e=>setEditBarcode(p=>({...p,barcode:e.target.value}))}/></label><div className={styles.buttonRow}><button disabled={busy}>Save barcode</button><button type="button" className={styles.secondary} onClick={()=>setEditBarcode(null)}>Cancel</button></div></form>}
          </div>

          <div>
            <form onSubmit={addPack}><h3>Add pack size</h3><label>Pack label<input required value={pack.label} onChange={e=>setPack(p=>({...p,label:e.target.value}))} placeholder="120 g box / 24-can case"/></label><div className={styles.formGrid}><label>Quantity<input required type="number" step="any" min="0.0001" value={pack.quantity} onChange={e=>setPack(p=>({...p,quantity:e.target.value}))}/></label><label>Unit<select value={pack.unit} onChange={e=>setPack(p=>({...p,unit:e.target.value}))}>{unitOptions(selected.tracking_type).map(u=><option key={u} value={u}>{u}</option>)}</select></label></div><label>Barcode on this pack (optional)<input value={pack.barcode} onChange={e=>setPack(p=>({...p,barcode:e.target.value}))}/></label><div className={styles.buttonRow}><button disabled={busy}>Add pack</button></div></form>

            <h3>Pack sizes</h3>
            <div className={styles.tableWrap}><table><thead><tr><th>Pack</th><th>Quantity</th><th>Preferred</th><th></th></tr></thead><tbody>{selected.packs.map(p=><tr key={p.id}><td>{p.label}</td><td>{p.qty_display} {selected.display_unit}</td><td>{p.preferred?'Yes':'No'}</td><td><button className={styles.secondary} onClick={()=>startPackEdit(p)}>Edit</button></td></tr>)}</tbody></table></div>

            {editPack&&<form className={styles.editCard} onSubmit={savePack}><h3>Edit pack size</h3><label>Pack label<input required value={editPack.label} onChange={e=>setEditPack(p=>({...p,label:e.target.value}))}/></label><div className={styles.formGrid}><label>Quantity<input required type="number" min="0.0001" step="any" value={editPack.quantity} onChange={e=>setEditPack(p=>({...p,quantity:e.target.value}))}/></label><label>Unit<select value={editPack.unit} onChange={e=>setEditPack(p=>({...p,unit:e.target.value}))}>{unitOptions(selected.tracking_type).map(u=><option key={u} value={u}>{u}</option>)}</select></label></div><label className={styles.checkboxRow}><input type="checkbox" checked={editPack.preferred} onChange={e=>setEditPack(p=>({...p,preferred:e.target.checked}))}/> Preferred pack for receiving</label><div className={styles.buttonRow}><button disabled={busy}>Save pack</button><button type="button" className={styles.secondary} onClick={()=>setEditPack(null)}>Cancel</button></div></form>}

            <form onSubmit={addBarcode}><h3>Add supplier barcode</h3><label>Scan/type barcode<input required value={barcode} onChange={e=>setBarcode(e.target.value)} placeholder="EAN / UPC / Code128"/></label><div className={styles.buttonRow}><button disabled={busy}>Assign barcode</button></div></form>
          </div>
        </div>}
      </section>
    </>}
  </main>;
}
