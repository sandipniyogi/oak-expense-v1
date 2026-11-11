import test from 'node:test';
import assert from 'node:assert/strict';
import { sessionCookie, clearSessionCookie } from '../src/staffCookies.js';

test('session cookie is HttpOnly, SameSite Strict and Secure by default', () => {
  const cookie = sessionCookie('A'.repeat(43));
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  assert.match(cookie, /; Secure/);
  assert.match(cookie, /Max-Age=43200/);
});
test('invalid tokens cannot be set as cookies', () => {
  assert.throws(() => sessionCookie('bad; token'));
});
test('logout clears the session cookie', () => {
  assert.match(clearSessionCookie(), /Max-Age=0/);
});
