'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import SocialNav from '../_components/SocialNav';
import { socialFetch } from '../_components/socialApi';
import styles from '../social.module.css';

export default function SocialCalendarPage() {
  const [projects, setProjects] = useState([]);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');

  const load = () => socialFetch('/projects').then(setProjects).catch(e => setError(e.message));
  useEffect(() => { load(); }, []);

  const schedule = async (id, value) => {
    if (!value) return;
    setBusyId(id); setError('');
    try {
      await socialFetch(`/projects/${id}/schedule`, { method: 'POST', body: JSON.stringify({ scheduled_for: new Date(value).toISOString() }) });
      await load();
    } catch (e) { setError(e.message); }
    finally { setBusyId(''); }
  };

  const published = async id => {
    setBusyId(id); setError('');
    try { await socialFetch(`/projects/${id}/mark-published`, { method: 'POST', body: '{}' }); await load(); }
    catch (e) { setError(e.message); }
    finally { setBusyId(''); }
  };

  return (
    <main className={styles.page}>
      <SocialNav />
      <div className={styles.shell}>
        <div className={styles.sectionHead}>
          <div><div className={styles.kicker}>Approval & cadence</div><h1 className={styles.h2}>Content Calendar</h1></div>
          <Link href="/social/create" className={styles.button}>Create campaign</Link>
        </div>
        <div className={styles.notice} style={{ marginBottom: 18 }}>Version 1 schedules the Oak workflow and marks due items <strong>ready to publish</strong>. It does not log into Instagram, RED, WeChat or TikTok. Use the exported publish package until official platform connectors are configured.</div>
        {error && <div className={styles.error} style={{ marginBottom: 14 }}>{error}</div>}

        <section className={styles.panel}>
          <table className={styles.calendarTable}>
            <thead><tr><th>Project</th><th>Platform</th><th>Status</th><th>Scheduled</th><th>Set date/time</th><th>Actions</th></tr></thead>
            <tbody>
              {projects.map(p => (
                <tr key={p.id}>
                  <td><strong>{p.title || 'Untitled'}</strong><div className={styles.muted}>{p.format} · {p.language}</div></td>
                  <td><span className={styles.badge}>{p.platform}</span></td>
                  <td>{p.status}</td>
                  <td>{p.scheduled_for ? new Date(p.scheduled_for).toLocaleString() : '—'}</td>
                  <td><input className={styles.input} type="datetime-local" onChange={e => schedule(p.id, e.target.value)} disabled={busyId === p.id} /></td>
                  <td><div className={styles.actions} style={{ marginTop: 0 }}><Link href={`/social/projects/${p.id}`} className={styles.smallButton}>Edit</Link>{p.status !== 'published' && <button className={styles.smallButton} onClick={() => published(p.id)} disabled={busyId === p.id}>Mark published</button>}</div></td>
                </tr>
              ))}
              {!projects.length && <tr><td colSpan="6" className={styles.muted}>No projects yet.</td></tr>}
            </tbody>
          </table>
        </section>
      </div>
    </main>
  );
}
