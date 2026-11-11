import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');
test('artifact commits compare the original project revision', () => {
  assert.match(source, /updated_at IS NOT DISTINCT FROM \$4/);
  assert.match(source, /result\.rowCount !== 1/);
});
test('artifact commits invalidate approval state and attribute the editor', () => {
  assert.match(source, /status='draft', scheduled_for=NULL/);
  assert.match(source, /last_edited_by_staff_id=\$2/);
});
test('all three artifact types use revision-checked commits', () => {
  for (const field of ['cover_path', 'render_path', 'export_path'])
    assert.ok(source.includes(`commitGeneratedArtifact(project, actorId, '${field}', outputName)`));
});
test('artifact endpoints supply authenticated staff identity', () => {
  for (const name of ['renderStill', 'renderVideo', 'exportProject'])
    assert.ok(source.includes(`${name}(row, req.staff.id)`));
});
