// Run only after migration 003, from a private terminal attached to the staging DB.
// Usage: printf '%s' "$PASSWORD" | node src/bootstrapStaffCli.js <username>
// Never pass the password on the command line or store it in a shell history entry.
import pg from 'pg';
import { bootstrapSuperAdmin } from './bootstrapStaff.js';

const username = process.argv[2];
if (!username || process.argv.length !== 3) {
  console.error('Usage: node src/bootstrapStaffCli.js <username> (password via stdin)');
  process.exit(2);
}
let password = '';
for await (const chunk of process.stdin) {
  password += chunk.toString('utf8');
  if (Buffer.byteLength(password) > 1026) throw new Error('Password input too long');
}
password = password.replace(/\r?\n$/, '');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  const staff = await bootstrapSuperAdmin(pool, username, password);
  console.log(`Created initial ${staff.role}: ${staff.username}`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally { password = ''; await pool.end(); }
