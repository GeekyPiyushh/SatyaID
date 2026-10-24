import bcrypt from 'bcryptjs';
import { connectDatabase, disconnectDatabase } from '../src/config/database';
import { parseEnvironment } from '../src/config/env';
import { audit } from '../src/services/student';
import * as m from '../src/models';
async function main() {
 const c = parseEnvironment(process.env);
 if (c.NODE_ENV === 'production' || process.env.ALLOW_DEMO_SEED !== 'true' || !c.MONGODB_URI || !new URL(c.MONGODB_URI).pathname.endsWith('_demo')) throw new Error('Dedicated demo scope required');
 const studentPassword = process.env.DEMO_STUDENT_PASSWORD, employerPassword = process.env.DEMO_EMPLOYER_PASSWORD;
 for (const password of [studentPassword, employerPassword]) if (!password || Buffer.byteLength(password) < 16 || Buffer.byteLength(password) > 72) throw new Error('Private demo passwords required');
 await connectDatabase(c.MONGODB_URI);
 const actor = await m.User.findOne({ email: process.env.DEMO_ADMIN_EMAIL, role: 'AICTE_ADMIN', active: true });
 const institution = await m.Institution.findOne({ pid: 'DEMO-SATYAID-001' });
 const profile = institution ? await m.StudentInstitution.findOne({ institution: institution._id, institutionStudentId: 'DEMO-STUDENT-001', displayName: /^Synthetic / }) : null;
 if (!actor || !String(actor.email).endsWith('@example.invalid') || !profile) throw new Error('Run guarded synthetic seed first');
 async function user(email: string, role: string, password: string) {
  const existing = await m.User.findOne({ email }); if (existing && existing.role !== role) throw new Error('Existing account conflict');
  return m.User.findOneAndUpdate({ email }, { $setOnInsert: { email, role, passwordHash: await bcrypt.hash(password, 12), active: true } }, { upsert: true, returnDocument: 'after', runValidators: true });
 }
 const studentUser = await user('student@example.invalid', 'STUDENT', studentPassword!);
 const employerUser = await user('employer@example.invalid', 'EMPLOYER', employerPassword!);
 const student = await m.Student.findOne({ _id: profile.student, $or: [{ user: null }, { user: studentUser!._id }] }); if (!student) throw new Error('Existing student account conflict');
 const existingProfile = await m.EmployerProfile.findOne({ user: employerUser!._id });
 if (existingProfile && existingProfile.status !== 'APPROVED') throw new Error('Existing employer decision preserved; manual review required');
 await m.EmployerProfile.updateOne({ user: employerUser!._id }, { $setOnInsert: { user: employerUser!._id, organization: 'Fictional Satya Hiring Company', status: 'APPROVED', approvalReference: 'DEMO_ONLY_NOT_REAL_AUTHORIZATION' } }, { upsert: true });
 await m.Student.updateOne({ _id: student._id }, { $set: { user: studentUser!._id } });
 await audit(actor, 'SYNTHETIC_GOVERNANCE_PROVISIONED', 'Institution', institution!._id, undefined, institution!._id);
 console.log('Synthetic student/employer accounts provisioned; existing passwords and decisions preserved. No consent or government authorization granted.');
}
main().catch(() => { console.error('Governance seed failed; verify private demo inputs, existing decisions and dedicated database.'); process.exitCode = 1; }).finally(disconnectDatabase);
