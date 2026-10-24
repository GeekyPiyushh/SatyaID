import mongoose from 'mongoose';
import { createHmac, timingSafeEqual } from 'node:crypto';
import * as m from '../../models';
import { identityKeyring } from '../../security/keys';
import { revealIdentity } from '../identity-crypto';
// Operator-only diagnostic; no plaintext, ciphertext, digest or key is returned or logged.
export async function reconcileIdentityLinks(limit = 500) {
 if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new Error('Limit1–500 required');
 const keys = identityKeyring(), active = process.env.APAAR_KEY_VERSION ? keys[process.env.APAAR_KEY_VERSION] : undefined;
 return mongoose.connection.transaction(async session => {
  const findings: { code: string; objectId: string }[] = [], seen = new Map<string,string>();
  const vaults = await m.ApaarIdentityVault.find().sort({_id:1}).limit(limit+1).maxTimeMS(10000).select('+ciphertext +nonce +tag +lookupDigest').session(session);
  const add = (code: string, id: unknown) => findings.push({code,objectId:String(id)});
  for (const vault of vaults.slice(0,limit)) {
   if (!await m.Student.exists({_id:vault.student}).session(session)) add('ORPHANED_IDENTITY_VAULT',vault._id);
   const key = keys[String(vault.keyVersion)]; if (!key) { add('IDENTITY_KEY_VERSION_UNAVAILABLE',vault._id); continue; }
   try {
    const identifier = revealIdentity({ciphertext:Buffer.from(vault.ciphertext as any),nonce:Buffer.from(vault.nonce as any),tag:Buffer.from(vault.tag as any)},String(vault.student),key.encryption);
    if (!/^\d{12}$/.test(identifier)) {add('INVALID_STORED_IDENTITY_FORMAT',vault._id);continue;}
    const actual = Buffer.from(vault.lookupDigest as any), expected = createHmac('sha256',Buffer.from(key.lookup,'base64')).update(identifier).digest();
    if (actual.length !== expected.length || !timingSafeEqual(actual,expected)) add('IDENTITY_LOOKUP_INCONSISTENT',vault._id);
    if (active) {
     const fingerprint = createHmac('sha256',Buffer.from(active.lookup,'base64')).update(identifier).digest('hex');
     if (seen.has(fingerprint)) add('DUPLICATE_PROTECTED_IDENTITY',vault._id); else seen.set(fingerprint,String(vault._id));
    }
   } catch { add('IDENTITY_CIPHERTEXT_INVALID',vault._id); }
  }
  const stale = await m.Student.aggregate([{ $match:{identityStatus:{$ne:'UNVERIFIED'}} },{$lookup:{from:m.ApaarIdentityVault.collection.name,localField:'_id',foreignField:'student',pipeline:[{$project:{_id:1}}],as:'_vault'}},{$match:{'_vault.0':{$exists:false}}},{$sort:{_id:1}},{$limit:limit+1},{$project:{_id:1}}]).option({maxTimeMS:10000}).session(session);
  for (const student of stale.slice(0,limit)) add('IDENTITY_ASSURANCE_WITHOUT_LINK',student._id);
  return { readOnly:true,repairPerformed:false,consistency:'MongoDB snapshot',scannedVaults:Math.min(vaults.length,limit),scanLimit:limit,truncated:vaults.length>limit||stale.length>limit,crossVersionDuplicateCheckAvailable:Boolean(active),scope:'Only scanned vaults are compared; no full-repository completeness claim when truncated or historic keys/ciphertext are unavailable',findings };
 },{readConcern:{level:'snapshot'},writeConcern:{w:'majority'}});
}
