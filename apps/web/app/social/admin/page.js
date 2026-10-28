'use client';

import { useEffect, useMemo, useState } from 'react';
import SocialNav from '../_components/SocialNav';
import { absoluteSocialUrl, socialFetch } from '../_components/socialApi';
import styles from '../social.module.css';

const PLATFORMS = [
  ['instagram', 'Instagram'], ['facebook', 'Facebook'], ['redbook', 'RED / Xiaohongshu'], ['wechat_channels', 'WeChat Channels'], ['tiktok', 'TikTok']
];

export default function SocialAdminPage() {
  const [brand, setBrand] = useState(null);
  const [agent, setAgent] = useState(null);
  const [health, setHealth] = useState(null);
  const [assets, setAssets] = useState([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState('');

  const load = async () => {
    try {
      const [b, a, h, media] = await Promise.all([socialFetch('/brand'), socialFetch('/agent/settings'), socialFetch('/health'), socialFetch('/assets')]);
      setBrand(b); setAgent(a); setHealth(h); setAssets(media);
    } catch (e) { setError(e.message); }
  };
  useEffect(() => { load(); }, []);

  const imageAssets = useMemo(() => assets.filter(a => a.media_type === 'image'), [assets]);
  const logoAsset = imageAssets.find(a => a.id === brand?.logo_asset_id);

  const saveBrand = async () => {
    setBusy('brand'); setError(''); setMessage('');
    try {
      const updated = await socialFetch('/brand', { method: 'PUT', body: JSON.stringify(brand) });
      setBrand(updated); setMessage('Brand Kit saved. New renders will use these settings.');
    } catch (e) { setError(e.message); }
    finally { setBusy(''); }
  };

  const togglePlatform = value => setAgent(a => ({ ...a, platforms: a.platforms.includes(value) ? a.platforms.filter(x => x !== value) : [...a.platforms, value] }));
  const saveAgent = async () => {
    setBusy('agent'); setError(''); setMessage('');
    try {
      const updated = await socialFetch('/agent/settings', { method: 'PUT', body: JSON.stringify(agent) });
      setAgent(updated); setMessage('Weekly agent settings saved.');
    } catch (e) { setError(e.message); }
    finally { setBusy(''); }
  };
  const runNow = async () => {
    setBusy('run'); setError(''); setMessage('');
    try {
      const result = await socialFetch('/agent/run-now', { method: 'POST', body: '{}' });
      setMessage(`Weekly agent draft created with ${result.projects?.length || 0} project(s). Open Dashboard or Calendar to review.`);
      await load();
    } catch (e) { setError(e.message); }
    finally { setBusy(''); }
  };

  if (!brand || !agent) return <main className={styles.page}><SocialNav /><div className={styles.shell}>{error ? <div className={styles.error}>{error}</div> : <div className={styles.muted}>Loading Social Admin…</div>}</div></main>;

  return (
    <main className={styles.page}>
      <SocialNav />
      <div className={styles.shell}>
        <div className={styles.sectionHead}><div><div className={styles.kicker}>Social configuration</div><h1 className={styles.h2}>Admin & Brand Kit</h1></div><div className={styles.projectMeta}><span className={styles.badge}>{health?.model || 'Qwen3'}</span><span>{health?.ollama_reachable ? 'Ollama online' : 'Ollama unavailable'}</span></div></div>
        {message && <div className={styles.success} style={{ marginBottom: 14 }}>{message}</div>}
        {error && <div className={styles.error} style={{ marginBottom: 14 }}>{error}</div>}

        <section className={styles.panel}>
          <div className={styles.sectionHead}><div><div className={styles.kicker}>Reusable identity</div><h2 className={styles.h3}>Oak Brand Kit</h2></div><button className={styles.button} onClick={saveBrand} disabled={busy === 'brand'}>{busy === 'brand' ? 'Saving…' : 'Save Brand Kit'}</button></div>
          <div className={styles.brandKitGrid}>
            <div className={styles.formGrid}>
              <div className={styles.field}><label className={styles.label}>Brand name</label><input className={styles.input} value={brand.brand_name || ''} onChange={e => setBrand({ ...brand, brand_name: e.target.value })} /></div>
              <div className={styles.field}><label className={styles.label}>Languages</label><input className={styles.input} value={(brand.languages || []).join(', ')} onChange={e => setBrand({ ...brand, languages: e.target.value.split(',').map(x => x.trim()).filter(Boolean) })} /></div>
              <div className={styles.fieldFull}><label className={styles.label}>Tone</label><input className={styles.input} value={brand.tone || ''} onChange={e => setBrand({ ...brand, tone: e.target.value })} /></div>
              <div className={styles.fieldFull}><label className={styles.label}>Brand rules for AI</label><textarea className={styles.textarea} value={brand.brand_rules || ''} onChange={e => setBrand({ ...brand, brand_rules: e.target.value })} /></div>
              <div className={styles.fieldFull}><label className={styles.label}>Default call to action</label><input className={styles.input} value={brand.default_cta || ''} onChange={e => setBrand({ ...brand, default_cta: e.target.value })} /></div>

              <div className={styles.field}><label className={styles.label}>Primary color</label><div className={styles.colorField}><input type="color" value={brand.primary_color || '#855d3b'} onChange={e => setBrand({ ...brand, primary_color: e.target.value })} /><input className={styles.input} value={brand.primary_color || '#855d3b'} onChange={e => setBrand({ ...brand, primary_color: e.target.value })} /></div></div>
              <div className={styles.field}><label className={styles.label}>Accent color</label><div className={styles.colorField}><input type="color" value={brand.accent_color || '#d9b382'} onChange={e => setBrand({ ...brand, accent_color: e.target.value })} /><input className={styles.input} value={brand.accent_color || '#d9b382'} onChange={e => setBrand({ ...brand, accent_color: e.target.value })} /></div></div>
              <div className={styles.field}><label className={styles.label}>Text color</label><div className={styles.colorField}><input type="color" value={brand.text_color || '#ffffff'} onChange={e => setBrand({ ...brand, text_color: e.target.value })} /><input className={styles.input} value={brand.text_color || '#ffffff'} onChange={e => setBrand({ ...brand, text_color: e.target.value })} /></div></div>
              <div className={styles.field}><label className={styles.label}>Font</label><select className={styles.select} value={brand.font_family || 'Noto Sans CJK SC'} onChange={e => setBrand({ ...brand, font_family: e.target.value })}><option value="Noto Sans CJK SC">Noto Sans CJK</option><option value="Noto Serif CJK SC">Noto Serif CJK</option></select></div>
              <div className={styles.field}><label className={styles.label}>Default template</label><select className={styles.select} value={brand.default_template || 'classic'} onChange={e => setBrand({ ...brand, default_template: e.target.value })}><option value="classic">Classic gradient</option><option value="minimal">Minimal glass box</option><option value="clean">Clean editorial</option></select></div>
              <div className={styles.field}><label className={styles.label}>Default subtitles</label><select className={styles.select} value={brand.default_subtitle_mode || 'bilingual'} onChange={e => setBrand({ ...brand, default_subtitle_mode: e.target.value })}><option value="none">None</option><option value="english">English</option><option value="chinese">Chinese</option><option value="bilingual">Bilingual</option></select></div>
              <div className={styles.field}><label className={styles.label}>Watermark / logo position</label><select className={styles.select} value={brand.watermark_position || 'bottom-left'} onChange={e => setBrand({ ...brand, watermark_position: e.target.value })}><option value="top-left">Top left</option><option value="top-right">Top right</option><option value="bottom-left">Bottom left</option><option value="bottom-right">Bottom right</option></select></div>
              <div className={styles.field}><label className={styles.label}>Logo image from Media Library</label><select className={styles.select} value={brand.logo_asset_id || ''} onChange={e => setBrand({ ...brand, logo_asset_id: e.target.value || null })}><option value="">Text watermark only</option>{imageAssets.map(a => <option key={a.id} value={a.id}>{a.original_name}</option>)}</select></div>
            </div>

            <div className={styles.brandPreview} style={{ '--oak-primary': brand.primary_color || '#855d3b', '--oak-accent': brand.accent_color || '#d9b382', '--oak-text': brand.text_color || '#ffffff' }}>
              {logoAsset && <img src={absoluteSocialUrl(logoAsset.thumbnail_url || logoAsset.url)} alt="Brand logo" className={styles.brandLogoPreview} />}
              <div className={styles.brandPreviewInner}>
                <span className={styles.brandPreviewAccent} />
                <div className={styles.brandPreviewTitle}>Friday Night at {brand.brand_name || 'Oak Lounge'}</div>
                <div className={styles.brandPreviewSub}>周五之夜 · Cocktails · Food · Atmosphere</div>
                <div className={styles.brandPreviewWatermark}>{brand.brand_name || 'Oak Lounge'}</div>
              </div>
              <p className={styles.muted}>This is a UI preview. Actual still/video renders apply the Brand Kit through FFmpeg/Sharp.</p>
            </div>
          </div>
        </section>

        <section className={styles.panel}>
          <div className={styles.sectionHead}><div><div className={styles.kicker}>Proactive agent</div><h2 className={styles.h3}>Weekly draft generator</h2></div><button className={styles.buttonDark} onClick={runNow} disabled={busy === 'run'}>{busy === 'run' ? 'Qwen is drafting…' : 'Run agent now'}</button></div>
          <p className={styles.muted}>The weekly agent creates drafts from recent Oak media. It never auto-publishes. Review, edit, render, then schedule or export.</p>
          <div className={styles.formGrid}>
            <div className={styles.field}><label className={styles.label}>Enabled</label><label className={styles.checkChip}><input type="checkbox" checked={!!agent.enabled} onChange={e => setAgent({ ...agent, enabled: e.target.checked })} />Create weekly drafts automatically</label></div>
            <div className={styles.field}><label className={styles.label}>Timezone</label><input className={styles.input} value={agent.timezone || 'Asia/Shanghai'} onChange={e => setAgent({ ...agent, timezone: e.target.value })} /></div>
            <div className={styles.field}><label className={styles.label}>Weekday</label><select className={styles.select} value={agent.weekday} onChange={e => setAgent({ ...agent, weekday: Number(e.target.value) })}><option value="1">Monday</option><option value="2">Tuesday</option><option value="3">Wednesday</option><option value="4">Thursday</option><option value="5">Friday</option><option value="6">Saturday</option><option value="7">Sunday</option></select></div>
            <div className={styles.field}><label className={styles.label}>Hour (0–23)</label><input className={styles.input} type="number" min="0" max="23" value={agent.hour} onChange={e => setAgent({ ...agent, hour: Number(e.target.value) })} /></div>
            <div className={styles.fieldFull}><label className={styles.label}>Platforms</label><div className={styles.checkRow}>{PLATFORMS.map(([v, label]) => <label key={v} className={styles.checkChip}><input type="checkbox" checked={(agent.platforms || []).includes(v)} onChange={() => togglePlatform(v)} />{label}</label>)}</div></div>
            <div className={styles.fieldFull}><label className={styles.label}>Weekly goal</label><textarea className={styles.textarea} value={agent.goal || ''} onChange={e => setAgent({ ...agent, goal: e.target.value })} /></div>
            <div className={styles.fieldFull}><button className={styles.button} onClick={saveAgent} disabled={busy === 'agent'}>{busy === 'agent' ? 'Saving…' : 'Save weekly agent'}</button></div>
          </div>
          <div className={styles.muted} style={{ marginTop: 12 }}>Last run: {agent.last_run_at ? new Date(agent.last_run_at).toLocaleString() : 'Never'}</div>
        </section>

        <section className={styles.panel}>
          <div className={styles.kicker}>Publishing connections</div><h2 className={styles.h3}>Assisted publishing mode</h2>
          <div className={styles.grid3}>
            <div className={styles.card}><strong>Instagram / Facebook</strong><p className={styles.muted}>Create platform-ready exports now. Official Meta account connector remains the next publishing layer.</p></div>
            <div className={styles.card}><strong>RED / WeChat Channels</strong><p className={styles.muted}>Create Chinese/bilingual assets and publishing packages without fragile unofficial browser automation.</p></div>
            <div className={styles.card}><strong>TikTok</strong><p className={styles.muted}>Create 9:16 drafts and exports now. Official Content Posting API can be connected separately.</p></div>
          </div>
        </section>
      </div>
    </main>
  );
}
