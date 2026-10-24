import mongoose, { Schema } from 'mongoose';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { requestContext } from './request-context';
import { activeBinaryKey, binaryKeyring } from '../security/keys';
import { AppError } from './app-error';
const signedFields = ['_id', 'actor', 'actorRole', 'institution', 'action', 'resourceType', 'resourceId', 'occurredAt', 'outcome', 'reasonCode', 'correlationId', 'integrityKeyVersion'];
export function auditCanonical(event: any) {
 return JSON.stringify(signedFields.map(field => {
  const value = event[field]; if (value === undefined || value === null) return null;
  return value instanceof Date ? value.toISOString() : String(value);
 }));
}
function signingKey() {
 if (!process.env.AUDIT_HMAC_KEY && !process.env.AUDIT_KEYRING_JSON) return null;
 return activeBinaryKey('AUDIT');
}
export function configureAudit(schema: Schema) {
 schema.add({ actorRole: String, occurredAt: { type: Date, default: Date.now }, outcome: { type: String, enum: ['SUCCESS', 'DENIED', 'FAILED'], default: 'SUCCESS' }, reasonCode: String, correlationId: String, integrityVersion: String, integrityKeyVersion: String, integrityTag: { type: String, select: false } });
 schema.index({ occurredAt: -1, _id: -1 });
 schema.pre('validate', async function () {
  if (!this.isNew) return;
  const context = requestContext.getStore();
  if (!this.actorRole) { const actor: any = await mongoose.model('User').findById(this.actor).select('role').session(this.$session() ?? null); this.actorRole = actor?.role ?? 'UNRESOLVED'; }
  this.correlationId = context?.correlationId ?? randomUUID();
  if (String(this.action).startsWith('ADMISSION_REJECTED_')) this.outcome = 'DENIED';
  const key = signingKey();
  if (key) { this.integrityVersion = 'HMAC_SHA256_EVENT_V1'; this.integrityKeyVersion = key.version; this.integrityTag = createHmac('sha256', key.key).update(auditCanonical(this)).digest('hex'); }
  else this.integrityVersion = 'UNSIGNED';
 });
}
export function verifyAuditSignature(event: any): 'VALID' | 'INVALID' | 'UNSIGNED' | 'KEY_UNAVAILABLE' {
 if (event.integrityVersion !== 'HMAC_SHA256_EVENT_V1') return 'UNSIGNED';
 if (!event.integrityTag) return 'INVALID';
 const key = binaryKeyring('AUDIT')[String(event.integrityKeyVersion)]; if (!key) return 'KEY_UNAVAILABLE';
 const expected = createHmac('sha256', key).update(auditCanonical(event)).digest(); const actual = Buffer.from(event.integrityTag, 'hex');
 return actual.length === expected.length && timingSafeEqual(actual, expected) ? 'VALID' : 'INVALID';
}
