'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import SocialNav from '../_components/SocialNav';
import { absoluteSocialUrl, socialFetch } from '../_components/socialApi';
import styles from '../social.module.css';

const PLATFORM_OPTIONS = [
  ['instagram', 'Instagram'], ['facebook', 'Facebook'], ['redbook', 'RED / Xiaohongshu'], ['wechat_channels', 'WeChat Channels'], ['tiktok', 'TikTok']
];
const LANGUAGE_OPTIONS = ['English', 'Simplified Chinese'];

export default function SocialCreatePage() {
  const router = useRouter();
  const [assets, setAssets] = useState([]);
  const [selected, setSelected] = useState([]);
  const [brief, setBrief] = useState('Create a premium Oak Lounge campaign using our real venue media.');
  const [objective, setObjective] = useState('Increase visits and engagement.');
  const [platforms, setPlatforms] = useState(['instagram', 'redbook', 'wechat_channels', 'tiktok']);
  const [languages, setLanguages] = useState(['English', 'Simplified Chinese']);
  const [proposal, setProposal] = useState(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    socialFetch('/assets').then(setAssets).catch(e => setError(e.message));
  }, []);

  const toggle = (value, list, setList) => setList(list.includes(value) ? list.filter(x => x !== value) : [...list, value]);
  const toggleAsset = id => setSelected(selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id]);

  const generate = async () => {
    setBusy(true); setError(''); setProposal(null);
    try {
      const data = await socialFetch('/ai/plan', {
        method: 'POST',
        body: JSON.stringify({ brief, objective, platforms, languages, asset_ids: selected })
      });
      setProposal(data.proposal);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  const updatePost = (index, key, value) => {
    setProposal(prev => ({ ...prev, posts: prev.posts.map((p, i) => i === index ? { ...p, [key]: value } : p) }));
  };

  const saveDrafts = async () => {
    if (!proposal) return;
    setSaving(true); setError('');
    try {
      const data = await socialFetch('/campaigns', {
        method: 'POST',
        body: JSON.stringify({ brief, objective, platforms, languages, proposal, source: 'manual' })
      });
      if (data.projects?.length) router.push(`/social/projects/${data.projects[0].id}`);
      else router.push('/social');
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  return (
    <main className={styles.page}>
      <SocialNav />
      <div className={styles.shell}>
        <div className={styles.sectionHead}>
          <div><div className={styles.kicker}>Local AI campaign planner</div><h1 className={styles.h2}>Create with Qwen3</h1></div>
          <div className={styles.muted}>AI proposes. You edit and approve.</div>
        </div>

        <section className={styles.panel}>
          <div className={styles.formGrid}>
            <div className={styles.fieldFull}>
              <label className={styles.label}>Campaign brief</label>
              <textarea className={styles.textarea} value={brief} onChange={e => setBrief(e.target.value)} placeholder="Example: Promote Friday night cocktails, atmosphere and live music. International audience in China. Do not invent any discounts." />
            </div>
            <div className={styles.fieldFull}>
              <label className={styles.label}>Objective</label>
              <input className={styles.input} value={objective} onChange={e => setObjective(e.target.value)} />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Platforms</label>
              <div className={styles.checkRow}>
                {PLATFORM_OPTIONS.map(([value, label]) => <label className={styles.checkChip} key={value}><input type="checkbox" checked={platforms.includes(value)} onChange={() => toggle(value, platforms, setPlatforms)} />{label}</label>)}
              </div>
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Languages</label>
              <div className={styles.checkRow}>
                {LANGUAGE_OPTIONS.map(value => <label className={styles.checkChip} key={value}><input type="checkbox" checked={languages.includes(value)} onChange={() => toggle(value, languages, setLanguages)} />{value}</label>)}
              </div>
            </div>
          </div>
        </section>

        <section className={styles.panel}>
          <div className={styles.sectionHead}>
            <div><div className={styles.kicker}>Optional but recommended</div><h2 className={styles.h3}>Choose real Oak media</h2></div>
            <div className={styles.muted}>{selected.length} selected</div>
          </div>
          <div className={styles.assetGrid}>
            {assets.slice(0, 40).map(asset => (
              <article key={asset.id} className={`${styles.assetCard} ${selected.includes(asset.id) ? styles.assetSelected : ''}`} onClick={() => toggleAsset(asset.id)} style={{ cursor: 'pointer' }}>
                <div className={styles.assetCheck}><input type="checkbox" checked={selected.includes(asset.id)} onChange={() => {}} /></div>
                <div className={styles.assetMedia}>{asset.thumbnail_url ? <img src={absoluteSocialUrl(asset.thumbnail_url)} alt={asset.original_name} /> : <div className={styles.muted}>{asset.media_type}</div>}</div>
                <div className={styles.assetBody}><div className={styles.assetTitle}>{asset.original_name}</div><div className={styles.assetMeta}>{(asset.tags || []).join(' · ')}</div></div>
              </article>
            ))}
          </div>
          {!assets.length && <div className={styles.notice}>No media uploaded yet. You can still generate copy and scene ideas, or upload photos/videos first from Media.</div>}
          <div className={styles.actions}>
            <button className={styles.buttonDark} onClick={generate} disabled={busy || !brief.trim() || !platforms.length}>{busy ? <><span className={styles.spinner} /> Qwen is planning…</> : 'Generate campaign proposal'}</button>
          </div>
          {error && <div className={styles.error} style={{ marginTop: 14 }}>{error}</div>}
        </section>

        {proposal && <section className={styles.panel}>
          <div className={styles.sectionHead}>
            <div><div className={styles.kicker}>AI proposal</div><h2 className={styles.h2}>{proposal.campaign_title}</h2><p className={styles.muted}>{proposal.summary}</p></div>
            <button className={styles.button} onClick={saveDrafts} disabled={saving}>{saving ? 'Saving…' : 'Save as editable drafts'}</button>
          </div>

          <div className={styles.platformGrid}>
            {(proposal.posts || []).map((post, i) => (
              <article className={styles.proposal} key={`${post.platform}-${i}`}>
                <div className={styles.proposalHead}>
                  <div><span className={`${styles.badge} ${styles.badgeDark}`}>{post.platform}</span> <span className={styles.badge}>{post.format}</span> <span className={styles.badge}>{post.aspect_ratio}</span></div>
                  <span className={styles.muted}>{post.language}</span>
                </div>
                <div className={styles.formGrid}>
                  <div className={styles.field}><label className={styles.label}>Title</label><input className={styles.input} value={post.title || ''} onChange={e => updatePost(i, 'title', e.target.value)} /></div>
                  <div className={styles.field}><label className={styles.label}>Hook</label><input className={styles.input} value={post.hook || ''} onChange={e => updatePost(i, 'hook', e.target.value)} /></div>
                  <div className={styles.fieldFull}><label className={styles.label}>Caption</label><textarea className={styles.textarea} value={post.caption || ''} onChange={e => updatePost(i, 'caption', e.target.value)} /></div>
                  <div className={styles.fieldFull}><label className={styles.label}>Hashtags</label><input className={styles.input} value={(post.hashtags || []).join(' ')} onChange={e => updatePost(i, 'hashtags', e.target.value.split(/\s+/).filter(Boolean))} /></div>
                </div>
                <div className={styles.sceneList}>
                  {(post.scenes || []).map((scene, si) => <div className={styles.scene} key={si}><strong>Scene {si + 1}</strong> · {scene.overlay || 'No overlay'} <div className={styles.muted}>{scene.duration_seconds}s · {scene.notes}</div></div>)}
                </div>
              </article>
            ))}
          </div>
        </section>}
      </div>
    </main>
  );
}
