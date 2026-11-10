// Server-side same-origin gateway; the Social API independently enforces sessions and roles.
const UPSTREAM = 'http://social-api:4500';
const ALLOWED = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE']);
async function proxy(request, { params }) {
  const { path } = await params;
  if (!Array.isArray(path) || !path.length || path.some(x => !x || x === '.' || x === '..'))
    return Response.json({ error: 'Invalid path' }, { status: 400 });
  const method = request.method.toUpperCase();
  if (!ALLOWED.has(method)) return Response.json({ error: 'Method not allowed' }, { status: 405 });
  const target = new URL(`${UPSTREAM}/${path.map(encodeURIComponent).join('/')}`);
  target.search = new URL(request.url).search;
  const headers = new Headers();
  for (const name of ['cookie', 'content-type', 'accept', 'origin']) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  // Never forward browser-controlled authorization, host, forwarded-* or custom proxy headers.
  try {
    const upstream = await fetch(target, {
      method, headers, redirect: 'manual', cache: 'no-store',
      ...(method === 'GET' || method === 'HEAD' ? {} : { body: await request.arrayBuffer() })
    });
    const responseHeaders = new Headers();
    for (const name of ['content-type', 'content-disposition', 'set-cookie', 'cache-control']) {
      const value = upstream.headers.get(name);
      if (value) responseHeaders.set(name, value);
    }
    responseHeaders.set('Cache-Control', 'no-store');
    return new Response(method === 'HEAD' ? null : upstream.body, { status: upstream.status, headers: responseHeaders });
  } catch {
    return Response.json({ error: 'Social API unavailable' }, { status: 502 });
  }
}
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export { proxy as GET, proxy as HEAD, proxy as POST, proxy as PUT, proxy as PATCH, proxy as DELETE };
