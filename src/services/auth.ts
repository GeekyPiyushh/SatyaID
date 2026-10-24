import mongoose, { ClientSession } from 'mongoose';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { User, RefreshSession } from '../models';
import { AppError } from '../utils/app-error';
import { parseEnvironment } from '../config/env';
export const digestToken = (token: string) => createHash('sha256').update(token).digest('hex');
export type SessionContext = { transport: 'json' | 'browser'; origin?: string; csrfDigest?: string; nextCsrfDigest?: string };
const jsonContext: SessionContext = { transport: 'json' };
function settings() { const c = parseEnvironment(process.env); if (!c.JWT_SECRET) throw new AppError(503, 'AUTH_UNAVAILABLE', 'Authentication is not configured'); return c as typeof c & { JWT_SECRET: string }; }
async function mint(user: any, context: SessionContext, family: string = randomUUID(), dbSession?: ClientSession, familyExpiresAt = new Date(Date.now() + 7 * 86400000)) {
 const c = settings(); const refreshToken = randomBytes(48).toString('base64url');
 await RefreshSession.create([{ user: user._id, digest: digestToken(refreshToken), family, expiresAt: familyExpiresAt, familyExpiresAt, transport: context.transport, browserOrigin: context.origin, csrfDigest: context.nextCsrfDigest ?? context.csrfDigest }], { session: dbSession });
 const accessToken = jwt.sign({}, c.JWT_SECRET, { algorithm: 'HS256', issuer: c.JWT_ISSUER, audience: c.JWT_AUDIENCE, subject: String(user._id), expiresIn: '10m' });
 return { tokens: { accessToken, refreshToken, expiresIn: 600, tokenType: 'Bearer' }, expiresAt: familyExpiresAt };
}
export async function loginSession(email: string, password: string, context: SessionContext = jsonContext) {
 settings(); const user = await User.findOne({ email, active: true }).select('+passwordHash');
 const valid = await bcrypt.compare(password, user?.passwordHash ?? '$2b$12$C6UzMDM.H6dfI/f/IKcEe.3l1ZKpKZ4bY3EygFQj7rzlVaS5QkO0K');
 if (!user || !valid) throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid credentials'); return mint(user, context);
}
export async function login(email: string, password: string) { return (await loginSession(email, password)).tokens; }
function transportFilter(context: SessionContext) {
 return context.transport === 'browser' ? { transport: 'browser', browserOrigin: context.origin } : { $or: [{ transport: 'json' }, { transport: { $exists: false } }] };
}
export async function refreshSession(token: string, context: SessionContext = jsonContext) {
 settings();
 const result = await mongoose.connection.transaction(async dbSession => {
  const previous = await RefreshSession.findOne({ digest: digestToken(token), ...transportFilter(context) }).select('+csrfDigest').session(dbSession);
  if (!previous || previous.revokedAt || previous.expiresAt! <= new Date()) return null;
  if (context.transport === 'browser' && previous.csrfDigest !== context.csrfDigest) throw new AppError(403, 'CSRF_INVALID', 'CSRF state is stale or invalid');
  previous.revokedAt = new Date(); await previous.save({ session: dbSession });
  const user = await User.findOne({ _id: previous.user, active: true }).session(dbSession); if (!user) return null;
  return mint(user, context, String(previous.family), dbSession, (previous.familyExpiresAt ?? previous.expiresAt) as Date);
 });
 if (result) return result;
 const replay = await RefreshSession.findOne({ digest: digestToken(token), ...transportFilter(context) });
 if (replay) await RefreshSession.updateMany({ family: replay.family }, { $set: { revokedAt: new Date() } });
 throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Refresh token is invalid or expired');
}
export async function refresh(token: string) { return (await refreshSession(token)).tokens; }
export async function logout(token: string, context: SessionContext = jsonContext) {
 const session = await RefreshSession.findOne({ digest: digestToken(token), ...transportFilter(context) });
 if (session) await RefreshSession.updateMany({ family: session.family }, { $set: { revokedAt: new Date() } });
}
export async function bindBrowserCsrf(token: string, origin: string, csrfDigest: string) {
 await RefreshSession.updateOne({ digest: digestToken(token), transport: 'browser', browserOrigin: origin, revokedAt: null, expiresAt: { $gt: new Date() } }, { $set: { csrfDigest } });
}
export function verifyAccess(token: string) {
 const c = settings();
 try { const payload = jwt.verify(token, c.JWT_SECRET, { algorithms: ['HS256'], issuer: c.JWT_ISSUER, audience: c.JWT_AUDIENCE }); if (typeof payload === 'string' || !payload.sub) throw new Error(); return payload.sub; }
 catch { throw new AppError(401, 'INVALID_TOKEN', 'Access token is invalid or expired'); }
}
