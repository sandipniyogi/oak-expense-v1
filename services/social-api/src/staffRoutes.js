// Stage 3B preparation: mount only after the authenticated gateway and direct-port lockdown are in place.
import { Router } from 'express';
import { login, logout, findSession, createStaff, disableStaff, publicStaff } from './staffService.js';
import { parseSessionCookie } from './staffAuth.js';
import { sessionCookie, clearSessionCookie } from './staffCookies.js';
import { exactOrigin, staffSession, staffPermission } from './staffMiddleware.js';

export function createStaffRouter(pool, { publicOrigin, secureCookies = true } = {}) {
  if (!publicOrigin) throw new Error('publicOrigin required');
  const router = Router();
  const originCheck = exactOrigin(publicOrigin);
  const sessionCheck = staffSession(pool);
  router.post('/login', originCheck, asyncHandler(async (req, res) => {
    const { username, password } = req.body || {};
    if (typeof username !== 'string' || typeof password !== 'string') return res.status(400).json({ error: 'Invalid credentials' });
    const result = await login(pool, username, password, req.ip);
    if (!result) return res.status(401).json({ error: 'Invalid credentials or temporarily locked' });
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Set-Cookie', sessionCookie(result.token, { secure: secureCookies }));
    return res.json({ staff: result.staff });
  }));
  router.post('/logout', originCheck, asyncHandler(async (req, res) => {
    const token = parseSessionCookie(req.headers.cookie);
    if (token) await logout(pool, token);
    res.setHeader('Set-Cookie', clearSessionCookie({ secure: secureCookies }));
    res.setHeader('Cache-Control', 'no-store');
    res.json({ ok: true });
  }));
  router.get('/me', sessionCheck, (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ staff: publicStaff(req.staff) });
  });
  router.post('/staff', originCheck, sessionCheck, staffPermission('staff.manage'), asyncHandler(async (req, res) => {
    const staff = await createStaff(pool, req.staff, req.body || {});
    res.status(201).json({ staff });
  }));
  router.post('/staff/:id/disable', originCheck, sessionCheck, staffPermission('staff.manage'), asyncHandler(async (req, res) => {
    await disableStaff(pool, req.staff, req.params.id);
    res.json({ ok: true });
  }));
  return router;
}
function asyncHandler(fn) { return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next); }
