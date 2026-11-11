export const COOKIE_NAME = 'oak_social_session';
export function sessionCookie(token, { secure = true, maxAge = 43200 } = {}) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new Error('Invalid session token');
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
}
export function clearSessionCookie({ secure = true } = {}) {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure ? '; Secure' : ''}`;
}
