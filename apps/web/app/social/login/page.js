'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function SocialLoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/module-api/social/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        cache: 'no-store',
        body: JSON.stringify({ username, password })
      });
      if (!response.ok) throw new Error(response.status === 401 ? 'Invalid credentials or temporarily locked' : 'Login unavailable');
      setPassword('');
      router.replace('/social');
      router.refresh();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#f3f5f8', padding: 24 }}>
      <form onSubmit={submit} style={{ width: '100%', maxWidth: 400, background: 'white', padding: 32, borderRadius: 18, boxShadow: '0 10px 35px #0001' }}>
        <h1 style={{ marginTop: 0 }}>Oak Social AI</h1>
        <p>Staff sign in</p>
        <label htmlFor="oak-username">Username</label>
        <input id="oak-username" autoComplete="username" required value={username} onChange={e => setUsername(e.target.value)} style={{ display: 'block', width: '100%', padding: 12, margin: '8px 0 18px', boxSizing: 'border-box' }} />
        <label htmlFor="oak-password">Password</label>
        <input id="oak-password" type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} style={{ display: 'block', width: '100%', padding: 12, margin: '8px 0 18px', boxSizing: 'border-box' }} />
        {error && <p role="alert" style={{ color: '#b42318' }}>{error}</p>}
        <button type="submit" disabled={busy} style={{ width: '100%', padding: 13, border: 0, borderRadius: 9, background: '#173b66', color: 'white', cursor: 'pointer' }}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </main>
  );
}
