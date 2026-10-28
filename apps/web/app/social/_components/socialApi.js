export function socialApiBase() {
  if (process.env.NEXT_PUBLIC_SOCIAL_API_URL) return process.env.NEXT_PUBLIC_SOCIAL_API_URL.replace(/\/$/, '');
  if (typeof window === 'undefined') return 'http://localhost:4500';
  const port = window.location.port === '3000' ? '4501' : '4500';
  return `${window.location.protocol}//${window.location.hostname}:${port}`;
}

export async function socialFetch(path, options = {}) {
  const res = await fetch(`${socialApiBase()}${path}`, {
    ...options,
    headers: options.body instanceof FormData ? (options.headers || {}) : { 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { error: text }; }
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data;
}

export function absoluteSocialUrl(relative) {
  if (!relative) return '';
  if (/^https?:\/\//.test(relative)) return relative;
  return `${socialApiBase()}${relative}`;
}
