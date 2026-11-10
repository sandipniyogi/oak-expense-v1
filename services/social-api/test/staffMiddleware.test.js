import test from 'node:test';
import assert from 'node:assert/strict';
import { staffSession, staffPermission, exactOrigin } from '../src/staffMiddleware.js';
import { newSessionToken, sessionTokenHash } from '../src/staffAuth.js';

function invoke(middleware, req) {
  return new Promise((resolve, reject) => {
    const res = { statusCode: 200, status(n) { this.statusCode = n; return this; }, json(body) { resolve({ status: this.statusCode, body }); } };
    try { Promise.resolve(middleware(req, res, err => err ? reject(err) : resolve({ status: 200, req }))).catch(reject); }
    catch (err) { reject(err); }
  });
}
test('missing session is denied without querying DB', async () => {
  const middleware = staffSession({ query() { throw Error('unexpected query'); } });
  assert.equal((await invoke(middleware, { headers: {} })).status, 401);
});
test('valid session resolves staff', async () => {
  const token = newSessionToken();
  const pool = { async query(sql, params) { assert.equal(params[0], sessionTokenHash(token)); return { rows: [{ id: '1', role: 'viewer', is_active: true }] }; } };
  const result = await invoke(staffSession(pool), { headers: { cookie: `oak_social_session=${token}` } });
  assert.equal(result.status, 200);
  assert.equal(result.req.staff.role, 'viewer');
});
test('roles deny missing permission', async () => {
  assert.equal((await invoke(staffPermission('approve'), { staff: { role: 'creator', is_active: true } })).status, 403);
  assert.equal((await invoke(staffPermission('approve'), { staff: { role: 'super_admin', is_active: true } })).status, 200);
});
test('exact origin rejects absent and lookalike origins', async () => {
  const middleware = exactOrigin('https://social.example.com');
  assert.equal((await invoke(middleware, { headers: {} })).status, 403);
  assert.equal((await invoke(middleware, { headers: { origin: 'https://social.example.com.evil.test' } })).status, 403);
  assert.equal((await invoke(middleware, { headers: { origin: 'https://social.example.com' } })).status, 200);
});
