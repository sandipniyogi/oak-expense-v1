import test from 'node:test';
import assert from 'node:assert/strict';
import { ROLES, can, validUsername, hashPassword, verifyPassword, newSessionToken, sessionTokenHash, parseSessionCookie } from '../src/staffAuth.js';

test('roles and permissions default deny', () => {
  assert.equal(ROLES.length, 4);
  assert.equal(can('viewer', 'approve'), false);
  assert.equal(can('creator', 'approve'), false);
  assert.equal(can('manager', 'approve'), false);
  assert.equal(can('super_admin', 'approve'), true);
  assert.equal(can('unknown', 'read'), false);
});
test('username validation', () => {
  assert.equal(validUsername('oak.admin'), true);
  assert.equal(validUsername('A'), false);
  assert.equal(validUsername('foo@example.com'), false);
});
test('password hashes are salted and verifiable', async () => {
  const password = 'correct-horse-staff-password';
  const a = await hashPassword(password);
  const b = await hashPassword(password);
  assert.notEqual(a, b);
  assert.equal(await verifyPassword(password, a), true);
  assert.equal(await verifyPassword('incorrect', a), false);
  assert.equal(await verifyPassword(password, 'bad'), false);
  await assert.rejects(hashPassword('short'));
});
test('session tokens are random, hashable and cookie parsable', () => {
  const a = newSessionToken(), b = newSessionToken();
  assert.notEqual(a, b);
  assert.match(sessionTokenHash(a), /^[a-f0-9]{64}$/);
  assert.equal(sessionTokenHash('bad'), null);
  assert.equal(parseSessionCookie(`other=1; oak_social_session=${a}; x=y`), a);
});
