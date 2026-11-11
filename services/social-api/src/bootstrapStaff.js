// One-time, transactionally guarded Super Admin bootstrap. No default credentials.
import { randomUUID } from 'node:crypto';
import { hashPassword, validUsername } from './staffAuth.js';

export async function bootstrapSuperAdmin(pool, username, password) {
  if (!validUsername(username)) throw new Error('Invalid username');
  // Validate password before acquiring the DB lock.
  const passwordHash = await hashPassword(password);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Serialize concurrent bootstrap attempts, even across multiple processes.
    await client.query('SELECT pg_advisory_xact_lock(713922018)');
    const existing = await client.query('SELECT id FROM oak_social_staff LIMIT 1');
    if (existing.rows.length) throw new Error('Bootstrap unavailable: staff accounts already exist');
    const id = randomUUID();
    await client.query(`INSERT INTO oak_social_staff(id,username,password_hash,role)
      VALUES($1,$2,$3,'super_admin')`, [id, username, passwordHash]);
    await client.query(`INSERT INTO oak_social_staff_audit(actor_id,action,target_id)
      VALUES($1,'staff.bootstrap',$2)`, [id,id]);
    await client.query('COMMIT');
    return { id, username, role: 'super_admin' };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}
