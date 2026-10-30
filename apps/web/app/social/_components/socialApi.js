export function socialApiBase() {
  if (process.env.NEXT_PUBLIC_SOCIAL_API_URL) return process.env.NEXT_PUBLIC_SOCIAL_API_URL.replace(/\/$/, '');
  return '/module-api/social';
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
