'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import SocialNav from '../../_components/SocialNav';
import { absoluteSocialUrl, socialFetch } from '../../_components/socialApi';
import styles from '../../social.module.css';

const PRESETS = [
  { key: 'instagram_reel', label: 'Instagram Reel · 9:16', platform: 'instagram', format: 'short_video', aspect_ratio: '9:16', duration_seconds: 15, subtitle_mode: 'bilingual' },
  { key: 'instagram_feed', label: 'Instagram Feed · 4:5', platform: 'instagram', format: 'still', aspect_ratio: '4:5', duration_seconds: 15, subtitle_mode: 'none' },
  { key: 'facebook_reel', label: 'Facebook Reel · 9:16', platform: 'facebook', format: 'short_video', aspect_ratio: '9:16', duration_seconds: 20, subtitle_mode: 'bilingual' },
  { key: 'redbook_video', label: 'RED Video · 9:16', platform: 'redbook', format: 'short_video', aspect_ratio: '9:16', duration_seconds: 20, subtitle_mode: 'chinese', language: 'Simplified Chinese' },
  { key: 'redbook_post', label: 'RED Image · 4:5', platform: 'redbook', format: 'still', aspect_ratio: '4:5', duration_seconds: 15, subtitle_mode: 'chinese', language: 'Simplified Chinese' },
  { key: 'wechat_channels', label: 'WeChat Channels · 9:16', platform: 'wechat_channels', format: 'short_video', aspect_ratio: '9:16', duration_seconds: 20, subtitle_mode: 'bilingual' },
  { key: 'tiktok', label: 'TikTok · 9:16', platform: 'tiktok', format: 'short_video', aspect_ratio: '9:16', duration_seconds: 15, subtitle_mode: 'bilingual' }
];

export default function SocialProjectEditor() {
  const params = useParams();
  const id = params?.id;
  const [project, setProject] = useState(null);
  const [assets, setAssets] = useState([]);
  const [brand, setBrand] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState('');
  const [schedule, setSchedule] = useState('');

  const load = async () => {
    try {
      setError('');
      const [p, a, b] = await Promise.all([socialFetch(`/projects/${id}`), socialFetch('/assets'), socialFetch('/brand')]);
      p.scenes = Array.isArray(p.scenes) ? p.scenes : [];
      p.template_style = p.template_style || b.default_template || 'classic';
      p.subtitle_mode = p.subtitle_mode || b.default_subtitle_mode || 'bilingual';
      setProject(p); setAssets(a); setBrand(b);
      if (p.scheduled_for) {
        const d = new Date(p.scheduled_for);
        const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0,16);
        setSchedule(local);
      }
    } catch (e) { setError(e.message); }
  };

  useEffect(() => { if (id) load(); }, [id]);

  const assetMap = useMemo(() => new Map(assets.map(a => [a.id, a])), [assets]);
  const visualAssets = useMemo(() => assets.filter(a => a.media_type === 'image' || a.media_type === 'video'), [assets]);
  const audioAssets = useMemo(() => assets.filter(a => a.media_type === 'audio'), [assets]);
  const change = (key, value) => setProject(p => ({ ...p, [key]: value }));
  const updateScene = (index, key, value) => setProject(p => ({ ...p, scenes: p.scenes.map((s, i) => i === index ? { ...s, [key]: value } : s) }));
  const removeScene = index => setProject(p => ({ ...p, scenes: p.scenes.filter((_, i) => i !== index) }));
  const addScene = () => setProject(p => ({ ...p, scenes: [...p.scenes, {
    asset_id: visualAssets[0]?.id || '', duration_seconds: 3, overlay: p.hook || p.title || '', notes: '',
    crop_position: 'center', text_position: 'bottom', transition: 'fade', subtitle_en: '', subtitle_zh: ''
  }] }));
  const moveScene = (index, direction) => setProject(p => {
    const target = index + direction;
    if (target < 0 || target >= p.scenes.length) return p;
    const scenes = [...p.scenes];
    [scenes[index], scenes[target]] = [scenes[target], scenes[index]];
    return { ...p, scenes };
  });

  const applyPreset = key => {
    const preset = PRESETS.find(p => p.key === key);
    if (!preset) return;
    const { key: _key, label: _label, ...values } = preset;
    setProject(p => ({ ...p, ...values, platform_preset: key, title: p.title, scenes: p.scenes }));
    setMessage(`Applied ${preset.label}. You can still edit every setting.`);
  };

  const save = async () => {
    setBusy('save'); setError(''); setMessage('');
    try {
      const updated = await socialFetch(`/projects/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ ...project, hashtags: Array.isArray(project.hashtags) ? project.hashtags : String(project.hashtags || '').split(/\s+/).filter(Boolean) })
      });
      setProject(updated); setMessage('Project saved.');
      return true;
    } catch (e) { setError(e.message); return false; }
    finally { setBusy(''); }
  };

  const render = async kind => {
    const ok = await save();
    if (!ok) return;
    setBusy(kind); setError(''); setMessage('');
    try {
      const data = await socialFetch(`/projects/${id}/render/${kind}`, { method: 'POST', body: '{}' });
      if (kind === 'still') {
        setProject(p => ({ ...p, cover_url: data.cover_url || data.render_url }));
        setMessage('Cover image rendered.');
      } else {
        setProject(p => ({ ...p, render_url: data.render_url }));
        setMessage('Video rendered.');
      }
    } catch (e) { setError(e.message); }
    finally { setBusy(''); }
  };

  const exportPack = async () => {
    setBusy('export'); setError('');
    try {
      const data = await socialFetch(`/projects/${id}/export`, { method: 'POST', body: '{}' });
      setProject(p => ({ ...p, export_url: data.export_url }));
      setMessage('Publishing package created.');
    } catch (e) { setError(e.message); }
    finally { setBusy(''); }
  };

  const scheduleProject = async () => {
    if (!schedule) return;
    setBusy('schedule'); setError('');
    try {
      const updated = await socialFetch(`/projects/${id}/schedule`, { method: 'POST', body: JSON.stringify({ scheduled_for: new Date(schedule).toISOString() }) });
      setProject(updated); setMessage('Project scheduled.');
    } catch (e) { setError(e.message); }
    finally { setBusy(''); }
  };

  if (!project) return <main className={styles.page}><SocialNav /><div className={styles.shell}>{error ? <div className={styles.error}>{error}</div> : <div className={styles.muted}>Loading project…</div>}</div></main>;

  const previewUrl = project.render_url || project.cover_url;

  return (
    <main className={styles.page}>
      <SocialNav />
      <div className={styles.shell}>
        <div className={styles.sectionHead}>
          <div><div className={styles.kicker}>Oak Social Editor v1.1</div><h1 className={styles.h2}>{project.title || 'Untitled project'}</h1><div className={styles.projectMeta}><span className={styles.badge}>{project.platform}</span><span>{project.format}</span><span>{project.status}</span></div></div>
          <div className={styles.actions} style={{ marginTop: 0 }}><button className={styles.button} onClick={save} disabled={busy === 'save'}>{busy === 'save' ? 'Saving…' : 'Save changes'}</button></div>
        </div>
        {message && <div className={styles.success} style={{ marginBottom: 14 }}>{message}</div>}
        {error && <div className={styles.error} style={{ marginBottom: 14 }}>{error}</div>}

        <section className={styles.panel}>
          <div className={styles.sectionHead}><div><div className={styles.kicker}>One-click setup</div><h2 className={styles.h3}>Platform preset</h2></div><span className={styles.muted}>Presets set the recommended canvas and format; all fields remain editable.</span></div>
          <div className={styles.presetRow}>{PRESETS.map(p => <button key={p.key} className={project.platform_preset === p.key ? styles.presetActive : styles.presetButton} onClick={() => applyPreset(p.key)}>{p.label}</button>)}</div>
        </section>

        <div className={styles.grid2}>
          <section className={styles.panel}>
            <h2 className={styles.h3}>Content & style</h2>
            <div className={styles.formGrid}>
              <div className={styles.field}><label className={styles.label}>Platform</label><select className={styles.select} value={project.platform} onChange={e => change('platform', e.target.value)}><option value="instagram">Instagram</option><option value="facebook">Facebook</option><option value="redbook">RED / Xiaohongshu</option><option value="wechat_channels">WeChat Channels</option><option value="tiktok">TikTok</option></select></div>
              <div className={styles.field}><label className={styles.label}>Format</label><select className={styles.select} value={project.format} onChange={e => change('format', e.target.value)}><option value="still">Still</option><option value="carousel">Carousel</option><option value="short_video">Short video</option></select></div>
              <div className={styles.field}><label className={styles.label}>Aspect ratio</label><select className={styles.select} value={project.aspect_ratio} onChange={e => change('aspect_ratio', e.target.value)}><option value="9:16">9:16 vertical</option><option value="4:5">4:5 portrait</option><option value="1:1">1:1 square</option><option value="16:9">16:9 landscape</option></select></div>
              <div className={styles.field}><label className={styles.label}>Language</label><input className={styles.input} value={project.language || ''} onChange={e => change('language', e.target.value)} /></div>
              <div className={styles.field}><label className={styles.label}>Oak template</label><select className={styles.select} value={project.template_style || 'classic'} onChange={e => change('template_style', e.target.value)}><option value="classic">Classic gradient</option><option value="minimal">Minimal glass box</option><option value="clean">Clean editorial</option></select></div>
              <div className={styles.field}><label className={styles.label}>Subtitle mode</label><select className={styles.select} value={project.subtitle_mode || 'bilingual'} onChange={e => change('subtitle_mode', e.target.value)}><option value="none">No subtitles</option><option value="english">English</option><option value="chinese">Chinese</option><option value="bilingual">Bilingual</option></select></div>
              <div className={styles.fieldFull}><label className={styles.label}>Title</label><input className={styles.input} value={project.title || ''} onChange={e => change('title', e.target.value)} /></div>
              <div className={styles.fieldFull}><label className={styles.label}>Hook</label><input className={styles.input} value={project.hook || ''} onChange={e => change('hook', e.target.value)} /></div>
              <div className={styles.fieldFull}><label className={styles.label}>Caption</label><textarea className={styles.textarea} value={project.caption || ''} onChange={e => change('caption', e.target.value)} /></div>
              <div className={styles.fieldFull}><label className={styles.label}>Hashtags</label><input className={styles.input} value={(project.hashtags || []).join(' ')} onChange={e => change('hashtags', e.target.value.split(/\s+/).filter(Boolean))} /></div>
            </div>
          </section>

          <section className={styles.panel}>
            <h2 className={styles.h3}>Preview / render</h2>
            <div className={styles.preview}>
              {previewUrl ? (previewUrl.endsWith('.mp4') ? <video src={absoluteSocialUrl(previewUrl)} controls /> : <img src={absoluteSocialUrl(previewUrl)} alt="Rendered project" />) : <div className={styles.muted} style={{ color: '#ddd', padding: 24 }}>Choose media, save, then render a cover or MP4.</div>}
            </div>
            <div className={styles.actions}>
              <button className={styles.buttonDark} onClick={() => render('still')} disabled={!!busy}>{busy === 'still' ? 'Rendering…' : 'Render cover'}</button>
              <button className={styles.buttonDark} onClick={() => render('video')} disabled={!!busy || !project.scenes.length}>{busy === 'video' ? 'Rendering video…' : 'Render MP4'}</button>
              <button className={styles.buttonGhost} onClick={exportPack} disabled={!!busy}>{busy === 'export' ? 'Packaging…' : 'Create publish package'}</button>
              {project.export_url && <a className={styles.buttonGhost} href={absoluteSocialUrl(project.export_url)}>Open package</a>}
            </div>
            <div className={styles.formGrid} style={{ marginTop: 18 }}>
              <div className={styles.field}><label className={styles.label}>Cover media</label><select className={styles.select} value={project.cover_asset_id || ''} onChange={e => change('cover_asset_id', e.target.value || null)}><option value="">First timeline scene</option>{visualAssets.map(a => <option key={a.id} value={a.id}>{a.original_name}</option>)}</select></div>
              <div className={styles.field}><label className={styles.label}>Background music</label><select className={styles.select} value={project.music_asset_id || ''} onChange={e => change('music_asset_id', e.target.value || null)}><option value="">No music</option>{audioAssets.map(a => <option key={a.id} value={a.id}>{a.original_name}</option>)}</select></div>
              <div className={styles.fieldFull}><label className={styles.label}>Music volume · {Math.round(Number(project.music_volume ?? 0.18) * 100)}%</label><input className={styles.range} type="range" min="0" max="0.8" step="0.02" value={Number(project.music_volume ?? 0.18)} onChange={e => change('music_volume', Number(e.target.value))} disabled={!project.music_asset_id} /></div>
            </div>
          </section>
        </div>

        <section className={styles.panel}>
          <div className={styles.sectionHead}><div><div className={styles.kicker}>Editable timeline</div><h2 className={styles.h3}>Scenes</h2></div><button className={styles.buttonGhost} onClick={addScene}>+ Add scene</button></div>
          <div className={styles.sceneList}>
            {project.scenes.map((scene, i) => {
              const selectedAsset = assetMap.get(scene.asset_id);
              return <div className={styles.scene} key={i}>
                <div className={styles.sceneHeader}><strong>Scene {i + 1}</strong><div className={styles.sceneActions}><button className={styles.smallButton} onClick={() => moveScene(i,-1)} disabled={i === 0}>↑</button><button className={styles.smallButton} onClick={() => moveScene(i,1)} disabled={i === project.scenes.length-1}>↓</button><button className={styles.buttonDanger} onClick={() => removeScene(i)}>Remove</button></div></div>
                <div className={styles.sceneEditorGrid}>
                  <div className={styles.field}><label className={styles.label}>Media</label><select className={styles.select} value={scene.asset_id || ''} onChange={e => updateScene(i, 'asset_id', e.target.value)}><option value="">Choose media…</option>{visualAssets.map(a => <option key={a.id} value={a.id}>{a.original_name}</option>)}</select>{selectedAsset && <span className={styles.muted}>{selectedAsset.media_type}</span>}</div>
                  <div className={styles.field}><label className={styles.label}>Duration</label><input className={styles.input} type="number" min="1" max="20" step="0.5" value={scene.duration_seconds || 3} onChange={e => updateScene(i, 'duration_seconds', Number(e.target.value))} /></div>
                  <div className={styles.field}><label className={styles.label}>Crop</label><select className={styles.select} value={scene.crop_position || 'center'} onChange={e => updateScene(i, 'crop_position', e.target.value)}><option value="center">Center</option><option value="top">Top</option><option value="bottom">Bottom</option><option value="left">Left</option><option value="right">Right</option></select></div>
                  <div className={styles.field}><label className={styles.label}>Text position</label><select className={styles.select} value={scene.text_position || 'bottom'} onChange={e => updateScene(i, 'text_position', e.target.value)}><option value="top">Top</option><option value="center">Center</option><option value="bottom">Bottom</option></select></div>
                  <div className={styles.field}><label className={styles.label}>Transition</label><select className={styles.select} value={scene.transition || 'fade'} onChange={e => updateScene(i, 'transition', e.target.value)}><option value="cut">Cut</option><option value="fade">Fade</option></select></div>
                  <div className={styles.fieldFull}><label className={styles.label}>Headline / overlay</label><input className={styles.input} value={scene.overlay || ''} onChange={e => updateScene(i, 'overlay', e.target.value)} /></div>
                  <div className={styles.field}><label className={styles.label}>English subtitle</label><input className={styles.input} value={scene.subtitle_en || ''} onChange={e => updateScene(i, 'subtitle_en', e.target.value)} /></div>
                  <div className={styles.field}><label className={styles.label}>Chinese subtitle</label><input className={styles.input} value={scene.subtitle_zh || ''} onChange={e => updateScene(i, 'subtitle_zh', e.target.value)} /></div>
                  <div className={styles.fieldFull}><label className={styles.label}>Editor notes</label><input className={styles.input} value={scene.notes || ''} onChange={e => updateScene(i, 'notes', e.target.value)} /></div>
                </div>
              </div>;
            })}
            {!project.scenes.length && <div className={styles.muted}>No scenes yet. Add a scene and choose an uploaded photo or video.</div>}
          </div>
        </section>

        <section className={styles.panel}>
          <div className={styles.grid2}>
            <div><div className={styles.kicker}>Publishing calendar</div><h2 className={styles.h3}>Schedule after approval</h2><p className={styles.muted}>The scheduled item becomes ready-to-publish at the due time. Direct account connectors remain a separate publishing layer.</p></div>
            <div className={styles.formGrid}>
              <div className={styles.fieldFull}><label className={styles.label}>Date & time</label><input className={styles.input} type="datetime-local" value={schedule} onChange={e => setSchedule(e.target.value)} /></div>
              <div className={styles.fieldFull}><button className={styles.button} onClick={scheduleProject} disabled={!schedule || !!busy}>{busy === 'schedule' ? 'Scheduling…' : 'Schedule project'}</button></div>
            </div>
          </div>
        </section>

        {brand && <div className={styles.muted}>Brand Kit: {brand.brand_name} · {brand.default_template || 'classic'} · {brand.font_family || 'Noto Sans CJK SC'}</div>}
      </div>
    </main>
  );
}
