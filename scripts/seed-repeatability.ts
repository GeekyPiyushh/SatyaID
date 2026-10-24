import { randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../src/config/database';
import * as m from '../src/models';
const exec = promisify(execFile);
async function main() {
 const uri = new URL(process.env.TEST_MONGODB_URI ?? ''); if (!uri.pathname.endsWith('_test') || !['localhost','127.0.0.1'].includes(uri.hostname)) throw new Error('Local dedicated test URI required');
 const targetName = 'satyaid_seed_' + randomBytes(10).toString('hex') + '_demo';
 await connectDatabase(uri.toString());
 if ((await mongoose.connection.db!.admin().listDatabases()).databases.some(d=>d.name === targetName)) throw new Error('Database collision');
 await disconnectDatabase(); uri.pathname = '/' + targetName;
 const env = {...process.env,NODE_ENV:'development',MONGODB_URI:uri.toString(),ALLOW_DEMO_SEED:'true',DEMO_ADMIN_EMAIL:'admin@example.invalid',DEMO_ADMIN_PASSWORD:randomBytes(24).toString('hex'),DEMO_STUDENT_PASSWORD:randomBytes(24).toString('hex'),DEMO_EMPLOYER_PASSWORD:randomBytes(24).toString('hex'),JWT_SECRET:randomBytes(40).toString('hex'),APAAR_ENCRYPTION_KEY:randomBytes(32).toString('base64'),APAAR_LOOKUP_KEY:randomBytes(32).toString('base64'),APAAR_KEY_VERSION:'seed-repeatability'};

 const counts = async () => { await connectDatabase(uri.toString()); const values=await Promise.all([m.User,m.Institution,m.Student,m.Enrolment,m.SeatReservation,m.IntakeAllocation].map(model=>model.countDocuments({}))); await disconnectDatabase();return JSON.stringify(values); };
 try {
  let first: string | undefined;
  for (let i=0;i<2;i++) { await exec('npx',['tsx','scripts/seed.ts'],{env});await exec('npx',['tsx','scripts/seed-governance.ts'],{env});const current=await counts();if(first && first!==current)throw new Error('Seed duplicated source records');first=current; }
  console.log('PASS: both synthetic seeds run twice with stable user/institution/student/enrolment/reservation/allocation counts');
 } finally { await connectDatabase(uri.toString()); await mongoose.connection.dropDatabase(); await disconnectDatabase(); }
}
main().catch((error)=>{console.error('Synthetic seed repeatability failed; inspect dedicated fixture/database setup securely');process.exitCode=1;});
