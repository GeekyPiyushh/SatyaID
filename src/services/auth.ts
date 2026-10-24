import mongoose, { ClientSession } from 'mongoose';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { User, RefreshSession } from '../models';
import { AppError } from '../utils/app-error';
import { parseEnvironment } from '../config/env';
const digest = (token: string) => createHash('sha256').update(token).digest('hex');
function settings() { const c = parseEnvironment(process.env); if (!c.JWT_SECRET) throw new AppError(503, 'AUTH_UNAVAILABLE', 'Authentication is not configured'); return c as typeof c & { JWT_SECRET: string }; }
async function tokens(user: any, family: string = randomUUID(), dbSession?: ClientSession) {
 const c = settings(); const refreshToken = randomBytes(48).toString('base64url');
 await RefreshSession.create([{ user: user._id, digest: digest(refreshToken), family, expiresAt: new Date(Date.now() + 7 * 86400000) }], { session: dbSession });
 const accessToken = jwt.sign({}, c.JWT_SECRET, { algorithm: 'HS256', issuer: c.JWT_ISSUER, audience: c.JWT_AUDIENCE, subject: String(user._id), expiresIn: '10m' });
 return { accessToken, refreshToken, expiresIn: 600, tokenType: 'Bearer' };
}
export async function login(email: string, password: string) {
 settings(); const user = await User.findOne({ email, active: true }).select('+passwordHash');
 // Always perform a password comparison to reduce account enumeration differences.
 const valid = await bcrypt.compare(password, user?.passwordHash ?? '$2b$12$C6UzMDM.H6dfI/f/IKcEe.3l1ZKpKZ4bY3EygFQj7rzlVaS5QkO0K');
 if (!user || !valid) throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid credentials');
 return tokens(user);
}
export async function refresh(token: string) {
 settings();
 const result = await mongoose.connection.transaction(async dbSession => {
  const session = await RefreshSession.findOneAndUpdate({ digest: digest(token), revokedAt: null, expiresAt: { $gt: new Date() } }, { $set: { revokedAt: new Date() } }, { returnDocument: 'after', session: dbSession });
  if (!session) return null;
  const user = await User.findOne({ _id: session.user, active: true }).session(dbSession);
  if (!user) return null;
  return tokens(user, String(session.family), dbSession);
 });
 if (result) return result;
 const replay = await RefreshSession.findOne({ digest: digest(token) });
 if (replay) await RefreshSession.updateMany({ family: replay.family, revokedAt: null }, { $set: { revokedAt: new Date() } });
 throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Refresh token is invalid or expired');
}

export async function logout(token: string) {
 const session = await RefreshSession.findOne({ digest: digest(token) });
 if (session) await RefreshSession.updateMany({ family: session.family }, { $set: { revokedAt: new Date() } });
}
export function verifyAccess(token: string) {
 const c = settings();
 try { const payload = jwt.verify(token, c.JWT_SECRET, { algorithms: ['HS256'], issuer: c.JWT_ISSUER, audience: c.JWT_AUDIENCE }); if (typeof payload === 'string' || !payload.sub) throw new Error(); return payload.sub; }
 catch { throw new AppError(401, 'INVALID_TOKEN', 'Access token is invalid or expired'); }
}
