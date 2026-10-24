import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';
import { AppError } from '../utils/app-error';
function key() { const k = Buffer.from(process.env.UPLOAD_ENCRYPTION_KEY ?? '', 'base64'); if (k.length !== 32) throw new AppError(503, 'UPLOAD_KEY_UNAVAILABLE', 'Upload protection is not configured'); return k; }
export function sealUpload(data: Buffer, aad: string) {
 const nonce = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key(), nonce); cipher.setAAD(Buffer.from(aad));
 const ciphertext = Buffer.concat([cipher.update(data), cipher.final()]); return Buffer.concat([Buffer.from([1]), nonce, cipher.getAuthTag(), ciphertext]);
}
export function openUpload(data: Buffer, aad: string) {
 if (data[0] !== 1 || data.length < 29) throw new AppError(409, 'UPLOAD_PAYLOAD_INVALID', 'Upload payload is unavailable');
 const cipher = createDecipheriv('aes-256-gcm', key(), data.subarray(1, 13)); cipher.setAAD(Buffer.from(aad)); cipher.setAuthTag(data.subarray(13, 29)); return Buffer.concat([cipher.update(data.subarray(29)), cipher.final()]);
}
export function uploadFingerprint(data: Buffer) { return createHmac('sha256', key()).update(data).digest('hex'); }
