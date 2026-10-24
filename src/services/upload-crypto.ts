import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';
import { AppError } from '../utils/app-error';
import { activeBinaryKey, binaryKeyring, decodeKey } from '../security/keys';
export function sealUpload(data: Buffer, aad: string) {
 const { key, version } = activeBinaryKey('UPLOAD'), id = Buffer.from(version);
 const header = Buffer.concat([Buffer.from([2, id.length]), id]), nonce = randomBytes(12);
 const cipher = createCipheriv('aes-256-gcm', key, nonce); cipher.setAAD(Buffer.concat([header, Buffer.from(aad)]));
 const ciphertext = Buffer.concat([cipher.update(data), cipher.final()]);
 return Buffer.concat([header, nonce, cipher.getAuthTag(), ciphertext]);
}
export function openUpload(data: Buffer, aad: string) {
 if (data.length < 29) throw new AppError(409, 'UPLOAD_PAYLOAD_INVALID', 'Upload payload is unavailable');
 let key: Buffer, offset: number, header: Buffer = Buffer.alloc(0);
 if (data[0] === 1) {
  // Legacy unversioned payloads have exactly one explicit legacy key, never a guessed active key.
  if (!process.env.UPLOAD_ENCRYPTION_KEY) throw new AppError(503, 'UPLOAD_KEY_VERSION_UNAVAILABLE', 'Legacy upload key is unavailable');
  key = decodeKey(process.env.UPLOAD_ENCRYPTION_KEY); offset = 1;
 } else if (data[0] === 2 && data[1] && data[1] <= 63 && data.length >= 2 + data[1] + 28) {
  const version = data.subarray(2, 2 + data[1]).toString('utf8'); const configured = binaryKeyring('UPLOAD')[version];
  if (!configured) throw new AppError(503, 'UPLOAD_KEY_VERSION_UNAVAILABLE', 'Required upload key version is unavailable');
  key = configured; offset = 2 + data[1]; header = data.subarray(0, offset);
 } else throw new AppError(409, 'UPLOAD_PAYLOAD_INVALID', 'Upload envelope is invalid');
 try {
  const cipher = createDecipheriv('aes-256-gcm', key, data.subarray(offset, offset + 12));
  cipher.setAAD(Buffer.concat([header, Buffer.from(aad)])); cipher.setAuthTag(data.subarray(offset + 12, offset + 28));
  return Buffer.concat([cipher.update(data.subarray(offset + 28)), cipher.final()]);
 } catch { throw new AppError(503, 'UPLOAD_DECRYPTION_FAILED', 'Protected upload could not be authenticated'); }
}
export function uploadFingerprint(data: Buffer) { return createHmac('sha256', activeBinaryKey('UPLOAD').key).update(data).digest('hex'); }
export function uploadFingerprintCandidates(data: Buffer) { return Object.values(binaryKeyring('UPLOAD')).map(key => createHmac('sha256', key).update(data).digest('hex')); }
