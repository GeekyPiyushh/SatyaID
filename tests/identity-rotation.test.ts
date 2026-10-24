import { describe, beforeAll, afterAll, it, expect } from 'vitest';
import { randomBytes } from 'node:crypto';
import mongoose from 'mongoose';
import * as m from '../src/models';
import { connectDatabase, disconnectDatabase } from '../src/config/database';
import { createStudent, linkIdentity } from '../src/services/student';
import { verifyStudentIdentity } from '../src/services/verification';
const suite = process.env.TEST_MONGODB_URI ? describe : describe.skip;
suite('protected identity dual-read rotation', () => {
 let actor: any, institution: any, student: any, oldVersion: string, newVersion: string;
 const identifier = '000000000001', key = () => randomBytes(32).toString('base64');
 beforeAll(async () => {
  const uri = new URL(process.env.TEST_MONGODB_URI!); if (!uri.pathname.endsWith('_test')) throw new Error('Synthetic DB required'); uri.pathname += '_keys_test'; await connectDatabase(uri.toString());
  for (const model of Object.values(mongoose.models)) await model.createIndexes();
  oldVersion = randomBytes(8).toString('hex'); newVersion = randomBytes(8).toString('hex');
  process.env.APAAR_KEY_VERSION = oldVersion; process.env.APAAR_ENCRYPTION_KEY = key(); process.env.APAAR_LOOKUP_KEY = key();
  // Previous synthetic runs have unrelated ephemeral keys. This suite owns only its own vault records.
  actor = await m.User.create({ email: `rotation-${oldVersion}@example.invalid`, role:'AICTE_ADMIN', passwordHash:'unusable' });
  institution = await m.Institution.create({ pid: oldVersion, name:'Synthetic key rotation', state:'Demo' });
  // Empty dedicated per-run database isolates deliberately incompatible version fixtures from previous runs.
  if (await m.ApaarIdentityVault.exists({})) throw new Error('Rotation tests require fresh isolated database');
  student = await createStudent(actor, { institution: String(institution._id), institutionStudentId: 'KEY-1', displayName:'Synthetic Rotation Student', apaarId:identifier });
 });
 afterAll(async () => { await m.ApaarIdentityVault.deleteMany({ keyVersion: { $in:[oldVersion,newVersion] } }); await disconnectDatabase(); });
 it('reads and verifies old vaults after active version changes, while blocking cross-version duplicate linkage', async () => {
  process.env.APAAR_KEYRING_JSON = JSON.stringify({ [oldVersion]: { encryptionKey:process.env.APAAR_ENCRYPTION_KEY,lookupKey:process.env.APAAR_LOOKUP_KEY } });
  process.env.APAAR_KEY_VERSION = newVersion; process.env.APAAR_ENCRYPTION_KEY = key(); process.env.APAAR_LOOKUP_KEY = key();
  expect((await verifyStudentIdentity(actor,String(student.studentId),String(institution._id))).official).toBe(false);
  await expect(linkIdentity(actor,String(student.studentId),String(institution._id),identifier)).resolves.toBeUndefined();
  const other = await createStudent(actor,{ institution:String(institution._id),institutionStudentId:'KEY-2',displayName:'Synthetic Other Rotation' });
  await expect(linkIdentity(actor,String(other.studentId),String(institution._id),identifier)).rejects.toMatchObject({code:'IDENTITY_REVIEW_REQUIRED'});
  await linkIdentity(actor,String(other.studentId),String(institution._id),'000000000002');
  expect((await m.ApaarIdentityVault.findOne({student:other.studentId}))!.keyVersion).toBe(newVersion);
 });
 it('fails closed if a historic key disappears without modifying existing ciphertext', async () => {
  const before: any = await m.ApaarIdentityVault.findOne({student:student.studentId}).select('+ciphertext').lean();
  delete process.env.APAAR_KEYRING_JSON;
  await expect(verifyStudentIdentity(actor,String(student.studentId),String(institution._id))).rejects.toMatchObject({code:'IDENTITY_KEY_VERSION_UNAVAILABLE'});
  const other = await createStudent(actor,{institution:String(institution._id),institutionStudentId:'KEY-3',displayName:'Synthetic Missing Key'});
  await expect(linkIdentity(actor,String(other.studentId),String(institution._id),'000000000003')).rejects.toMatchObject({code:'IDENTITY_KEY_VERSION_UNAVAILABLE'});
  const after: any = await m.ApaarIdentityVault.findOne({student:student.studentId}).select('+ciphertext').lean(); expect(after!.ciphertext).toEqual(before!.ciphertext);
 });
});
