import test from 'node:test';
import assert from 'node:assert/strict';
import { publicStaff, requirePermission, findSession, logout, createStaff } from '../src/staffService.js';

test('only active super admin can manage staff', () => {
  assert.equal(requirePermission({ role:'super_admin', is_active:true },'staff.manage'),true);
  assert.equal(requirePermission({ role:'manager', is_active:true },'staff.manage'),false);
  assert.equal(requirePermission({ role:'super_admin', is_active:false },'staff.manage'),false);
  assert.equal(requirePermission(null,'read'),false);
});
test('public staff never leaks password hash', () => {
  assert.deepEqual(publicStaff({id:'x',username:'abc',role:'viewer',is_active:true,password_hash:'secret'}),
    {id:'x',username:'abc',role:'viewer',is_active:true});
});
test('invalid session tokens do not query database', async () => {
  const pool = { query(){ throw Error('unexpected database query'); } };
  assert.equal(await findSession(pool,'invalid'),null);
  await logout(pool,'invalid');
});
test('manager cannot create staff', async () => {
  await assert.rejects(createStaff({}, {id:'1',role:'manager',is_active:true},
    {username:'staff1',password:'long secure password',role:'viewer'}), /Forbidden/);
});
