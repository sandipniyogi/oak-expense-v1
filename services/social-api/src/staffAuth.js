import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
export const ROLES = Object.freeze(['super_admin', 'manager', 'creator', 'viewer']);
const PERMISSIONS = Object.freeze({
  super_admin: ['staff.manage', 'brand.write', 'assets.write', 'campaigns.write', 'projects.write', 'agent.manage', 'approve', 'schedule', 'publish.mark', 'read'],
  manager: ['brand.write', 'assets.write', 'campaigns.write', 'projects.write', 'read'],
  creator: ['assets.write', 'campaigns.write', 'projects.write', 'read'],
  viewer: ['read']
});

export function can(role, permission) {
  return Object.hasOwn(PERMISSIONS, role) && PERMISSIONS[role].includes(permission);
}

export function validUsername(value) {
  return typeof value === 'string' && /^[a-z][a-z0-9._-]{2,39}$/.test(value);
}

export async function hashPassword(password) {
  if (typeof password !== 'string' || password.length < 14 || Buffer.byteLength(password, 'utf8') > 1024)
    throw new Error('Password must be at least 14 characters and at most 1024 bytes');
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt-v1:${salt.toString('hex')}:${key.toString('hex')}`;
}

export async function verifyPassword(password, encoded) {
  if (typeof password !== 'string' || Buffer.byteLength(password, 'utf8') > 1024 || typeof encoded !== 'string') return false;
  const parts = encoded.split(':');
  if (parts.length !== 3 || parts[0] !== 'scrypt-v1' || !/^[a-f0-9]{32}$/.test(parts[1]) || !/^[a-f0-9]{128}$/.test(parts[2])) return false;
  const candidate = await scrypt(password, Buffer.from(parts[1], 'hex'), 64, { N: 16384, r: 8, p: 1 });
  return timingSafeEqual(candidate, Buffer.from(parts[2], 'hex'));
}

export function newSessionToken() { return randomBytes(32).toString('base64url'); }
export function sessionTokenHash(token) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  return createHash('sha256').update(token).digest('hex');
}

export function parseSessionCookie(cookieHeader, name = 'oak_social_session') {
  if (typeof cookieHeader !== 'string') return null;
  for (const item of cookieHeader.split(';')) {
    const i = item.indexOf('=');
    if (i !== -1 && item.slice(0, i).trim() === name) return item.slice(i + 1).trim();
  }
  return null;
}
