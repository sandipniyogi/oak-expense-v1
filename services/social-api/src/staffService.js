// Stage 2 service layer. Not wired to HTTP routes until the protected gateway is ready.
import { randomUUID, createHash } from 'node:crypto';
import { can, validUsername, hashPassword, verifyPassword, newSessionToken, sessionTokenHash } from './staffAuth.js';

export const SESSION_HOURS = 12;
export const MAX_ATTEMPTS = 5;
const hashSource = source => createHash('sha256').update(String(source || '')).digest('hex');

export function publicStaff(row) {
  return { id: row.id, username: row.username, role: row.role, is_active: row.is_active };
}
export function requirePermission(staff, permission) {
  return Boolean(staff?.is_active && can(staff.role, permission));
}
export async function findSession(pool, token) {
  const tokenHash = sessionTokenHash(token);
  if (!tokenHash) return null;
  const result = await pool.query(`SELECT s.id,s.username,s.role,s.is_active FROM oak_social_staff_sessions t
    JOIN oak_social_staff s ON s.id=t.staff_id
    WHERE t.token_hash=$1 AND t.revoked_at IS NULL AND t.expires_at > now() AND s.is_active=true`, [tokenHash]);
  return result.rows[0] || null;
}
export async function login(pool, username, password, source) {
  if (!validUsername(username) || typeof password !== 'string') return null;
  const sourceHash = hashSource(source);
  const recent = await pool.query(`SELECT count(*)::int AS n FROM oak_social_login_attempts
    WHERE username=$1 AND attempted_at > now()-interval '15 minutes' AND success=false`, [username]);
  if (Number(recent.rows[0]?.n || 0) >= MAX_ATTEMPTS) return null;
  const found = await pool.query('SELECT * FROM oak_social_staff WHERE username=$1 AND is_active=true', [username]);
  const staff = found.rows[0];
  const valid = staff ? await verifyPassword(password, staff.password_hash) : false;
  await pool.query(`INSERT INTO oak_social_login_attempts(username,source_hash,success) VALUES($1,$2,$3)`, [username,sourceHash,valid]);
  if (!valid) return null;
  const token = newSessionToken();
  await pool.query(`INSERT INTO oak_social_staff_sessions(token_hash,staff_id,expires_at)
    VALUES($1,$2,now()+interval '12 hours')`, [sessionTokenHash(token),staff.id]);
  await pool.query(`INSERT INTO oak_social_staff_audit(actor_id,action,target_id) VALUES($1,'login',$2)`, [staff.id,staff.id]);
  return { token, staff: publicStaff(staff) };
}
export async function logout(pool, token) {
  const digest = sessionTokenHash(token);
  if (!digest) return;
  await pool.query('UPDATE oak_social_staff_sessions SET revoked_at=now() WHERE token_hash=$1 AND revoked_at IS NULL', [digest]);
}
export async function createStaff(pool, actor, { username, password, role }) {
  if (!requirePermission(actor,'staff.manage')) throw new Error('Forbidden');
  if (!validUsername(username) || !['manager','creator','viewer'].includes(role)) throw new Error('Invalid staff account');
  const passwordHash = await hashPassword(password);
  const id = randomUUID();
  const result = await pool.query(`INSERT INTO oak_social_staff(id,username,password_hash,role)
    VALUES($1,$2,$3,$4) RETURNING id,username,role,is_active`, [id,username,passwordHash,role]);
  await pool.query(`INSERT INTO oak_social_staff_audit(actor_id,action,target_id) VALUES($1,'staff.created',$2)`, [actor.id,id]);
  return publicStaff(result.rows[0]);
}
export async function disableStaff(pool, actor, staffId) {
  if (!requirePermission(actor,'staff.manage') || actor.id === staffId) throw new Error('Forbidden');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(`UPDATE oak_social_staff SET is_active=false,updated_at=now()
      WHERE id=$1 AND role <> 'super_admin' RETURNING id`, [staffId]);
    if (!result.rowCount) throw new Error('Staff not found or protected');
    await client.query('UPDATE oak_social_staff_sessions SET revoked_at=now() WHERE staff_id=$1 AND revoked_at IS NULL', [staffId]);
    await client.query(`INSERT INTO oak_social_staff_audit(actor_id,action,target_id) VALUES($1,'staff.disabled',$2)`, [actor.id,staffId]);
    await client.query('COMMIT');
  } catch (err) { await client.query('ROLLBACK'); throw err; }
  finally { client.release(); }
}
