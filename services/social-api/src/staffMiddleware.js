// Stage 3A: middleware primitives only. Do not expose routes until the gateway is secured.
import { findSession, requirePermission } from './staffService.js';
import { parseSessionCookie } from './staffAuth.js';

export function staffSession(pool, { cookieName = 'oak_social_session' } = {}) {
  return async (req, res, next) => {
    try {
      const token = parseSessionCookie(req.headers?.cookie, cookieName);
      const staff = token ? await findSession(pool, token) : null;
      if (!staff) return res.status(401).json({ error: 'Login required' });
      req.staff = staff;
      next();
    } catch (err) { next(err); }
  };
}

export function staffPermission(permission) {
  return (req, res, next) => {
    if (!req.staff) return res.status(401).json({ error: 'Login required' });
    if (!requirePermission(req.staff, permission)) return res.status(403).json({ error: 'Forbidden' });
    next();
  };
}

// A server-side gateway must enforce this for cookie-authenticated writes.
// Origin must match a configured HTTPS public origin; never trust Host alone.
export function exactOrigin(expectedOrigin) {
  let expected;
  try {
    expected = new URL(expectedOrigin);
    if (expected.protocol !== 'https:' && expected.hostname !== 'localhost' && expected.hostname !== '127.0.0.1') throw Error();
    if (expected.pathname !== '/' || expected.search || expected.hash || expected.username || expected.password) throw Error();
  } catch { throw new Error('Invalid configured public origin'); }
  return (req, res, next) => {
    const origin = req.headers?.origin;
    if (!origin) return res.status(403).json({ error: 'Origin required' });
    try {
      const actual = new URL(origin);
      if (actual.origin !== expected.origin || origin !== actual.origin) throw Error();
    } catch { return res.status(403).json({ error: 'Origin rejected' }); }
    next();
  };
}
