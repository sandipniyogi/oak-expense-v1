import test from 'node:test';
import assert from 'node:assert/strict';
import { bootstrapSuperAdmin } from '../src/bootstrapStaff.js';

function mockPool(exists = false) {
  const statements = [];
  const client = {
    async query(sql, args) {
      statements.push({ sql, args });
      if (sql.startsWith('SELECT id FROM')) return { rows: exists ? [{ id: 'existing' }] : [] };
      return { rows: [] };
    },
    release() { statements.push({ sql: 'RELEASE' }); }
  };
  return { pool: { async connect() { return client; } }, statements };
}
test('bootstrap inserts only one super_admin in a transaction', async () => {
  const { pool, statements } = mockPool();
  const result = await bootstrapSuperAdmin(pool, 'oakadmin', 'a strong password with 20 chars');
  assert.equal(result.role, 'super_admin');
  assert.deepEqual(statements.map(x => x.sql.slice(0, 6)), ['BEGIN','SELECT','SELECT','INSERT','INSERT','COMMIT','RELEAS']);
  assert.equal(statements.find(x => x.sql.includes('VALUES($1,$2,$3'))?.args[1], 'oakadmin');
});
test('bootstrap rejects existing accounts and rolls back', async () => {
  const { pool, statements } = mockPool(true);
  await assert.rejects(bootstrapSuperAdmin(pool, 'oakadmin', 'a strong password with 20 chars'), /already exist/);
  assert.ok(statements.some(x => x.sql === 'ROLLBACK'));
  assert.ok(!statements.some(x => x.sql.startsWith('INSERT')));
});
test('bootstrap rejects invalid username before DB connection', async () => {
  const { pool, statements } = mockPool();
  await assert.rejects(bootstrapSuperAdmin(pool, 'ADMIN!', 'a strong password with 20 chars'), /Invalid username/);
  assert.equal(statements.length, 0);
});
