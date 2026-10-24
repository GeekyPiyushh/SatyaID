import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';
function key(value: string) { const bytes = Buffer.from(value, 'base64'); if (bytes.length !== 32) throw new Error('Identity key must be 32 bytes'); return bytes; }
export function protectIdentity(identifier: string, studentId: string, encryptionKey: string, lookupKey: string) {
 if (key(encryptionKey).equals(key(lookupKey))) throw new Error('Independent identity keys are required');
 const nonce = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', key(encryptionKey), nonce);
 cipher.setAAD(Buffer.from(studentId));
 return { ciphertext: Buffer.concat([cipher.update(identifier, 'utf8'), cipher.final()]), nonce, tag: cipher.getAuthTag(), lookupDigest: createHmac('sha256', key(lookupKey)).update(identifier).digest() };
}
export function revealIdentity(vault: { ciphertext: Buffer; nonce: Buffer; tag: Buffer }, studentId: string, encryptionKey: string) {
 const cipher = createDecipheriv('aes-256-gcm', key(encryptionKey), vault.nonce); cipher.setAAD(Buffer.from(studentId)); cipher.setAuthTag(vault.tag);
 return Buffer.concat([cipher.update(vault.ciphertext), cipher.final()]).toString('utf8');
}
