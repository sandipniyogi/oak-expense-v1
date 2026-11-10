import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');
test('staff approval endpoint is mapped to approve permission before generic project writes', () => {
  const approval = source.indexOf("approval\\/(approve|reject|changes)");
  const generic = source.indexOf("if (/^\\/projects(?:\\/|$)/.test(url))");
  assert.ok(approval !== -1 && generic > approval);
});
test('project content updates force draft and record editing staff', () => {
  assert.match(source, /Content edits must return to draft/);
  assert.match(source, /last_edited_by_staff_id=\$19/);
  assert.match(source, /req\.staff\.id/);
});
test('approval decisions lock the project and reject finalized projects', () => {
  assert.match(source, /SELECT \* FROM oak_social_projects WHERE id=\$1 FOR UPDATE/);
  assert.match(source, /Cannot change approval after scheduling or publishing/);
});
