'use client';

import { useEffect, useMemo, useState } from 'react';
import SocialNav from '../_components/SocialNav';
import { absoluteSocialUrl, socialFetch } from '../_components/socialApi';
import styles from '../social.module.css';

export default function SocialMediaPage() {
  const [assets, setAssets] = useState([]);
  const [files, setFiles] = useState([]);
  const [tags, setTags] = useState('');
  const [notes, setNotes] = useState('');
  const [query, setQuery] = useState('');
  const [type, setType] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    try {
      setError('');
      const params = new URLSearchParams();
      if (query) params.set('q', query);
      if (type) params.set('media_type', type);
      const data = await socialFetch(`/assets?${params.toString()}`);
      setAssets(data);
    } catch (e) { setError(e.message); }
  };

  useEffect(() => { load(); }, [type]);

  const selectedSize = useMemo(() => files.reduce((n, f) => n + f.size, 0), [files]);

  const upload = async (e) => {
    e.preventDefault();
    if (!files.length) return;
    setBusy(true); setMessage(''); setError('');
    try {
      const fd = new FormData();
      files.forEach(f => fd.append('files', f));
      fd.append('tags', tags);
      fd.append('notes', notes);
      const result = await socialFetch('/assets/upload', { method: 'POST', body: fd });
      setMessage(`${result.assets.length} asset(s) uploaded.`);
      setFiles([]); setTags(''); setNotes('');
      const input = document.getElementById('social-media-files');
      if (input) input.value = '';
      await load();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  const archive = async (id) => {
    if (!window.confirm('Archive this media item? The original file stays on disk but it will no longer be offered to the Social Agent.')) return;
    try {
      await socialFetch(`/assets/${id}`, { method: 'DELETE' });
      await load();
    } catch (e) { setError(e.message); }
  };

  return (
    <main className={styles.page}>
      <SocialNav />
      <div className={styles.shell}>
        <div className={styles.sectionHead}>
          <div><div className={styles.kicker}>Content source</div><h1 className={styles.h2}>Media Library</h1></div>
          <div className={styles.muted}>Original files are preserved. Renders are saved separately.</div>
        </div>

        <section className={styles.panel}>
          <h2 className={styles.h3}>Upload Oak photos and videos</h2>
          <form onSubmit={upload} className={styles.formGrid}>
            <div className={styles.fieldFull}>
              <label className={styles.label}>Files</label>
              <input id="social-media-files" className={styles.input} type="file" multiple accept="image/*,video/*,audio/*" onChange={e => setFiles(Array.from(e.target.files || []))} />
              <div className={styles.muted}>{files.length ? `${files.length} file(s), ${(selectedSize / 1024 / 1024).toFixed(1)} MB` : 'Select photos, videos or audio. Up to 300 MB per file.'}</div>
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Tags</label>
              <input className={styles.input} value={tags} onChange={e => setTags(e.target.value)} placeholder="Bar, cocktails, Friday, atmosphere" />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Notes for AI</label>
              <input className={styles.input} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Signature cocktail on main bar" />
            </div>
            <div className={styles.fieldFull}>
              <button className={styles.button} disabled={busy || !files.length}>{busy ? 'Uploading…' : 'Upload media'}</button>
            </div>
          </form>
          {message && <div className={styles.success} style={{ marginTop: 14 }}>{message}</div>}
          {error && <div className={styles.error} style={{ marginTop: 14 }}>{error}</div>}
        </section>

        <section className={styles.panel}>
          <div className={styles.sectionHead}>
            <div><div className={styles.kicker}>Library</div><h2 className={styles.h3}>{assets.length} active assets</h2></div>
            <div className={styles.actions} style={{ marginTop: 0 }}>
              <input className={styles.input} style={{ width: 240 }} value={query} onChange={e => setQuery(e.target.value)} placeholder="Search name, tag or note" onKeyDown={e => { if (e.key === 'Enter') load(); }} />
              <select className={styles.select} style={{ width: 130 }} value={type} onChange={e => setType(e.target.value)}>
                <option value="">All media</option><option value="image">Images</option><option value="video">Videos</option><option value="audio">Audio</option>
              </select>
              <button className={styles.buttonGhost} onClick={load}>Search</button>
            </div>
          </div>

          <div className={styles.assetGrid}>
            {assets.map(asset => (
              <article className={styles.assetCard} key={asset.id}>
                <div className={styles.assetMedia}>
                  {asset.thumbnail_url ? <img src={absoluteSocialUrl(asset.thumbnail_url)} alt={asset.original_name} /> : <div className={styles.muted}>{asset.media_type.toUpperCase()}</div>}
                </div>
                <div className={styles.assetBody}>
                  <div className={styles.assetTitle} title={asset.original_name}>{asset.original_name}</div>
                  <div className={styles.assetMeta}>{asset.media_type}{asset.width && asset.height ? ` · ${asset.width}×${asset.height}` : ''}{asset.duration_seconds ? ` · ${Number(asset.duration_seconds).toFixed(1)}s` : ''}</div>
                  <div className={styles.assetMeta}>{(asset.tags || []).join(' · ') || 'No tags'}</div>
                  <div className={styles.actions}>
                    <a className={styles.smallButton} href={absoluteSocialUrl(asset.url)} target="_blank" rel="noreferrer">Open</a>
                    <button className={styles.smallButton} onClick={() => archive(asset.id)}>Archive</button>
                  </div>
                </div>
              </article>
            ))}
          </div>
          {!assets.length && <div className={styles.muted}>No media yet. Upload the first Oak Lounge photo or video above.</div>}
        </section>
      </div>
    </main>
  );
}
