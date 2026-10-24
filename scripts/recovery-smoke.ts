import mongoose from 'mongoose';
import { randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { connectDatabase, disconnectDatabase } from '../src/config/database';
import { protectIdentity, revealIdentity } from '../src/services/identity-crypto';
import * as m from '../src/models';
const exec = promisify(execFile);
async function main() {
 const uri = new URL(process.env.TEST_MONGODB_URI ?? '');
 if (!uri.pathname.endsWith('_test') || !['127.0.0.1','localhost'].includes(uri.hostname) || process.env.NODE_ENV === 'production') throw new Error('Local synthetic replica set required');
 const container = process.env.RECOVERY_MONGO_CONTAINER ?? 'satyaid-batch4-mongo'; if (!/^satyaid-[a-z0-9-]+$/.test(container)) throw new Error('Dedicated container required');
 const suffix = randomBytes(10).toString('hex'), source = `satyaid_${suffix}_recovery_test`, target = `satyaid_${suffix}_restored_test`, archive = `/tmp/satyaid-${suffix}.archive`;
 const encryption = randomBytes(32).toString('base64'), lookup = randomBytes(32).toString('base64'); let owned = false;
 await connectDatabase(uri.toString());
 const names = (await mongoose.connection.db!.admin().listDatabases()).databases.map(d=>d.name);
 if (names.includes(source) || names.includes(target)) throw new Error('Database collision'); owned = true;
 try {
  await disconnectDatabase(); uri.pathname = '/' + source; await connectDatabase(uri.toString());
  for (const model of [m.Student,m.ApaarIdentityVault]) await model.createIndexes();
  const student = await m.Student.create({displayName:'Synthetic Recovery Fixture'});
  await m.ApaarIdentityVault.create({student:student._id,keyVersion:'ephemeral-recovery',...protectIdentity('000000000001',String(student._id),encryption,lookup)});
  await exec('docker',['exec',container,'mongodump','--quiet','--db',source,'--archive='+archive]);
  await exec('docker',['exec',container,'mongorestore','--quiet','--archive='+archive,'--nsFrom='+source+'.*','--nsTo='+target+'.*']);
  await disconnectDatabase(); uri.pathname = '/' + target; await connectDatabase(uri.toString());
  const restored = await m.ApaarIdentityVault.findOne({student:student._id}).select('+ciphertext +nonce +tag');
  if (!restored || revealIdentity({ciphertext:Buffer.from(restored.ciphertext as any),nonce:Buffer.from(restored.nonce as any),tag:Buffer.from(restored.tag as any)},String(student._id),encryption) !== '000000000001') throw new Error('Protected restoration failed');
  const indexes = await m.ApaarIdentityVault.collection.indexes(); if (!indexes.some(i=>i.unique && i.key.keyVersion === 1 && i.key.lookupDigest === 1)) throw new Error('Restored unique index absent');
  console.log('PASS: isolated synthetic dump/restore, protected ciphertext decryption, identity unique index; no existing database changed');
 } finally {
  if (owned && mongoose.connection.readyState === 1) for (const name of [source,target]) await mongoose.connection.useDb(name).dropDatabase();
  await exec('docker',['exec',container,'rm','-f',archive]); await disconnectDatabase();
 }
}
main().catch(()=>{console.error('Synthetic recovery smoke failed; inspect dedicated replica/container availability securely');process.exitCode=1;});
