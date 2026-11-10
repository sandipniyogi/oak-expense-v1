import test from 'node:test';
import assert from 'node:assert/strict';
import { mayDecideApproval, APPROVAL_DECISIONS } from '../src/approvalPolicy.js';
const admin = { id: 'admin', role: 'super_admin', is_active: true };
const project = { created_by_staff_id: 'creator', last_edited_by_staff_id: 'editor' };
test('only active super admin may decide', () => {
  assert.equal(mayDecideApproval(admin, project, 'approved'), true);
  for (const role of ['manager', 'creator', 'viewer'])
    assert.equal(mayDecideApproval({ ...admin, role }, project, 'approved'), false);
  assert.equal(mayDecideApproval({ ...admin, is_active: false }, project, 'approved'), false);
});
test('cannot approve work authored or last edited by self', () => {
  assert.equal(mayDecideApproval(admin, { ...project, created_by_staff_id: 'admin' }, 'approved'), false);
  assert.equal(mayDecideApproval(admin, { ...project, last_edited_by_staff_id: 'admin' }, 'approved'), false);
});
test('legacy records with unknown ownership fail closed', () => {
  assert.equal(mayDecideApproval(admin, { ...project, created_by_staff_id: null }, 'approved'), false);
  assert.equal(mayDecideApproval(admin, { ...project, last_edited_by_staff_id: null }, 'approved'), false);
});
test('only supported decisions are accepted', () => {
  assert.deepEqual(Object.keys(APPROVAL_DECISIONS), ['approve','reject','changes']);
  assert.equal(mayDecideApproval(admin, project, 'published'), false);
});
