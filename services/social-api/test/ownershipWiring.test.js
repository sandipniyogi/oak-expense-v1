import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');
test('campaign creation receives authenticated actor', () => {
  assert.match(source, /actorId: req\.staff\.id/);
  assert.match(source, /created_by_staff_id,last_edited_by_staff_id/);
  assert.match(source, /actorId\s*\n\s*\]\)/);
});
test('project editing records authenticated editor', () => {
  assert.match(source, /last_edited_by_staff_id=\$19/);
  assert.match(source, /req\.params\.id, req\.staff\.id/);
});
