'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import SocialNav from './_components/SocialNav';
import { socialFetch } from './_components/socialApi';
import styles from './social.module.css';

export default function SocialDashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    socialFetch('/dashboard').then(setData).catch(e => setError(e.message));
  }, []);

  return (
    <main className={styles.page}>
      <SocialNav />
      <div className={styles.shell}>
        <section className={styles.hero}>
          <div className={styles.heroMain}>
            <div className={styles.kicker}>Oak Lounge Marketing</div>
            <h1 className={styles.h1}>Create once. Adapt for every platform.</h1>
            <p className={styles.lead}>Upload real Oak Lounge photos and videos, let your local Qwen3 agent create bilingual campaign drafts, edit every scene, render stills or short videos, and organize approved content on a publishing calendar.</p>
            <div className={styles.actions}>
              <Link href="/social/create" className={styles.button}>Create with AI</Link>
              <Link href="/social/media" className={styles.buttonGhost}>Upload media</Link>
              <Link href="/social/calendar" className={styles.buttonGhost}>Open calendar</Link>
            </div>
          </div>
          <div className={styles.heroSide}>
            <div className={styles.kicker}>Local-first workflow</div>
            <h2 className={styles.h2}>Qwen3 8B stays the planning brain.</h2>
            <p className={styles.lead}>Your social agent can create drafts automatically on a weekly schedule. Nothing is posted externally without review. Version 1 prepares editable projects and assisted-publishing packages; direct platform connectors come next.</p>
          </div>
        </section>

        {error && <div className={styles.error}>{error}</div>}

        <section className={styles.stats}>
          <div className={styles.stat}><div className={styles.statValue}>{data?.asset_count ?? '—'}</div><div className={styles.statLabel}>Media assets</div></div>
          <div className={styles.stat}><div className={styles.statValue}>{data?.campaign_count ?? '—'}</div><div className={styles.statLabel}>Campaigns</div></div>
          <div className={styles.stat}><div className={styles.statValue}>{data?.project_count ?? '—'}</div><div className={styles.statLabel}>Editable projects</div></div>
          <div className={styles.stat}><div className={styles.statValue}>{data?.scheduled_count ?? '—'}</div><div className={styles.statLabel}>Scheduled</div></div>
        </section>

        <section className={styles.grid3}>
          <div className={styles.card}>
            <h3 className={styles.h3}>1. Media Library</h3>
            <p className={styles.muted}>Keep Oak’s real photos and videos in one searchable library with tags such as Bar, Kitchen, Shisha, Food, Cocktails, Events and Atmosphere.</p>
            <div className={styles.actions}><Link href="/social/media" className={styles.smallButton}>Open Media</Link></div>
          </div>
          <div className={styles.card}>
            <h3 className={styles.h3}>2. AI Content Studio</h3>
            <p className={styles.muted}>Describe the campaign once. Qwen creates separate Instagram, Facebook, RED, WeChat Channels and TikTok drafts instead of literal copy-paste translations.</p>
            <div className={styles.actions}><Link href="/social/create" className={styles.smallButton}>Create Campaign</Link></div>
          </div>
          <div className={styles.card}>
            <h3 className={styles.h3}>3. Review & Schedule</h3>
            <p className={styles.muted}>Edit captions, scenes, text overlays and timing. Render a still or short MP4, then schedule the approved project or export a publishing package.</p>
            <div className={styles.actions}><Link href="/social/calendar" className={styles.smallButton}>Open Calendar</Link></div>
          </div>
        </section>

        <section className={styles.panel} style={{ marginTop: 18 }}>
          <div className={styles.sectionHead}>
            <div><div className={styles.kicker}>Recent work</div><h2 className={styles.h2}>Projects</h2></div>
            <Link href="/social/create" className={styles.buttonGhost}>New campaign</Link>
          </div>
          <div className={styles.projectList}>
            {(data?.recent_projects || []).length === 0 && <div className={styles.muted}>No projects yet. Upload media and create your first campaign.</div>}
            {(data?.recent_projects || []).map(p => (
              <div className={styles.projectCard} key={p.id}>
                <div>
                  <div className={styles.projectTitle}>{p.title || 'Untitled project'}</div>
                  <div className={styles.projectMeta}>
                    <span className={styles.badge}>{p.platform}</span>
                    <span>{p.format}</span><span>{p.language}</span><span>{p.status}</span>
                  </div>
                </div>
                <Link href={`/social/projects/${p.id}`} className={styles.smallButton}>Edit project</Link>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
