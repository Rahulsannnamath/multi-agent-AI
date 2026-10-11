import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';
import { z } from 'zod';

export function passwordHash(password: string, salt = randomBytes(16).toString('hex')) { return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`; }
export function verifyPassword(password: string, hash: string) {
  const [salt, value] = hash.split(':');
  if (!salt || !value || !/^[a-f0-9]{128}$/.test(value)) return false;
  return timingSafeEqual(Buffer.from(value, 'hex'), Buffer.from(passwordHash(password, salt).split(':')[1], 'hex'));
}
const usersSchema = z.record(z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/), z.string());
export function studioUsers() { return usersSchema.parse(JSON.parse(process.env['AI_DESIGN_STUDIO_USERS'] ?? '{}')); }
const developmentSecret = randomBytes(48).toString('hex');
function secret() {
  const configured = process.env['AI_DESIGN_STUDIO_SESSION_SECRET'];
  if (process.env['NODE_ENV'] === 'production' && (!configured || configured.length < 32)) throw new Error('AI_DESIGN_STUDIO_SESSION_SECRET must contain at least 32 characters');
  return configured ?? developmentSecret;
}
export function signSession(user: string, now = Date.now()) {
  const data = Buffer.from(JSON.stringify({ user, expires: now + 8 * 60 * 60 * 1000 })).toString('base64url');
  return `${data}.${createHmac('sha256', secret()).update(data).digest('base64url')}`;
}
export function readSession(token: string, now = Date.now()) {
  const [data, signature, extra] = token.split('.');
  if (!data || !signature || extra) throw new Error('Invalid session');
  const expected = createHmac('sha256', secret()).update(data).digest();
  const received = Buffer.from(signature, 'base64url');
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) throw new Error('Invalid session');
  const session = z.object({ user: z.string(), expires: z.number() }).strict().parse(JSON.parse(Buffer.from(data, 'base64url').toString()));
  if (session.expires <= now || !(session.user in studioUsers())) throw new Error('Session expired');
  return session.user;
}
export const authenticate: RequestHandler = (req, res, next) => {
  try { res.locals['studioOwner'] = readSession((req.headers.authorization ?? '').replace(/^Bearer /, '')); next(); }
  catch { res.status(401).json({ error: 'Sign in to AI Design Studio' }); }
};
const buckets = new Map<string, { count: number; expires: number }>();
export function rateLimit(prefix: string, maximum: number, windowMs = 60000): RequestHandler {
  return (req, res, next) => {
    const now = Date.now();
    if (buckets.size > 10000) for (const [key, value] of buckets) if (value.expires < now) buckets.delete(key);
    const key = `${prefix}:${res.locals['studioOwner'] ?? req.ip}`;
    let bucket = buckets.get(key);
    if (!bucket || bucket.expires <= now) { bucket = { count: 0, expires: now + windowMs }; buckets.set(key, bucket); }
    if (++bucket.count > maximum) { res.setHeader('Retry-After', Math.ceil((bucket.expires - now) / 1000)); res.status(429).json({ error: 'Too many requests. Please retry shortly.' }); return; }
    next();
  };
}
