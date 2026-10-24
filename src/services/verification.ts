import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import * as m from '../models';
import { studentAccess, identityKeys, audit } from './student';
import { revealIdentity } from './identity-crypto';
import { providers } from '../providers/apaar';
import { AppError } from '../utils/app-error';
export async function verifyStudentIdentity(user: any, id: string, institution: string) {
 await studentAccess(user, id, institution, true);
 if (process.env.NODE_ENV === 'production') throw new AppError(503, 'MOCK_PROVIDER_DISABLED', 'Mock identity verification is disabled in production');
 const provider = providers[process.env.APAAR_PROVIDER ?? 'MOCK_APAAR'];
 if (!provider) throw new AppError(503, 'PROVIDER_UNAVAILABLE', 'No authorized verification provider is configured');
 const vault = await m.ApaarIdentityVault.findOne({ student: id }).select('+ciphertext +nonce +tag');
 if (!vault) throw new AppError(409, 'IDENTITY_NOT_LINKED', 'Student has no linked identity');
 const keys = identityKeys(); if (vault.keyVersion !== keys.version) throw new AppError(503, 'IDENTITY_KEY_VERSION_UNAVAILABLE', 'Required identity key version is unavailable');
 let identifier: string;
 try { identifier = revealIdentity({ ciphertext: Buffer.from(vault.ciphertext as any), nonce: Buffer.from(vault.nonce as any), tag: Buffer.from(vault.tag as any) }, id, keys.encryption); }
 catch { throw new AppError(503, 'IDENTITY_DECRYPTION_FAILED', 'Protected identity could not be accessed'); }
 const result = await provider.verify({ identifier });
 const status = result.outcome === 'MATCH' ? 'MOCK_VERIFIED' : ['MISMATCH', 'NOT_FOUND'].includes(result.outcome) ? 'VERIFICATION_FAILED' : 'UNVERIFIED';
 return mongoose.connection.transaction(async session => {
  if (!await m.ApaarIdentityVault.exists({ _id: vault._id, student: id, keyVersion: vault.keyVersion, nonce: vault.nonce }).session(session)) throw new AppError(409, 'IDENTITY_CHANGED', 'Identity changed during verification');
  const update: any = { $inc: { lockVersion: 1 } }; if (status !== 'UNVERIFIED') update.$set = { identityStatus: status };
  const student = await m.Student.findOneAndUpdate({ _id: id }, update, { session, returnDocument: 'after' });
  if (!student) throw new AppError(404, 'NOT_FOUND', 'Student not found');
  const traceId = randomUUID();
  await m.IdentityVerificationEvent.create([{ student: id, actor: user._id, status, provider: result.provider, providerVersion: result.providerVersion, reasonCode: result.outcome, traceId, keyVersion: vault.keyVersion }], { session });
  await audit(user, 'MOCK_IDENTITY_VERIFICATION', 'Student', id, session, institution);
  return { verificationStatus: student.identityStatus, outcome: result.outcome, provider: result.provider, providerVersion: result.providerVersion, official: false, traceId };
 });
}
