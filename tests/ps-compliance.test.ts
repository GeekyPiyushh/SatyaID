import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import ExcelJS from 'exceljs';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import YAML from 'yaml';
import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import { createApp } from '../src/app';
import { connectDatabase, disconnectDatabase } from '../src/config/database';
import * as m from '../src/models';
import { columns, extendedColumns } from '../src/services/upload-parser';
import { processNextUpload } from '../src/services/uploads';
import { reconcileIdentityLinks } from '../src/services/operations/identity-reconcile';
import { protectIdentity } from '../src/services/identity-crypto';
import { processNextReport } from '../src/services/regulatory/reports';
const suite = process.env.TEST_MONGODB_URI ? describe : describe.skip;
const app = createApp({CORS_ORIGINS:[]}), suffix=randomBytes(8).toString('hex'), secret=randomBytes(40).toString('hex');
const spec=YAML.parse(readFileSync('docs/openapi.yaml','utf8')), ajv=new Ajv2020({strict:false});addFormats(ajv);ajv.addSchema({$id:'https://satyaid.invalid/ps',...spec});
suite('problem statement compliance with real replica transactions',()=>{
 let admin:any, owner:any, outsider:any, staff:any, studentUser:any, otherStudent:any, employer:any, institution:any, otherInstitution:any, pool:any, year:any, student:any, missing:any, enrolment:any, missingEnrolment:any, consent:any;
 const token=(u:any)=>jwt.sign({},secret,{subject:String(u._id),issuer:'satyaid',audience:'satyaid-api',expiresIn:'10m'});
 const path=(studentId=student.studentId)=>`/students/${studentId}/certificate-print-data`;
 const printBody=(full=false,extra={})=>({institution:String(institution._id),enrolment:String(enrolment._id),purposeCode:'CERTIFICATE_PRINT_PREPARATION',...(full?{disclosure:'FULL',consentId:String(consent?.consentId??new mongoose.Types.ObjectId())}:{}),...extra});
 async function call(method:string,url:string,user:any,body?:any,status=200) {
  const r=await (request(app) as any)[method]('/api/v1'+url).auth(token(user),{type:'bearer'}).send(body);expect(r.status,JSON.stringify(r.body)).toBe(status);
  if(status<300){const p=('/api/v1'+url.split('?')[0]).replace(/[a-f\d]{24}/g,'{id}');const pointer=p.replace(/~/g,'~0').replace(/\//g,'~1');const check=ajv.compile({$ref:`https://satyaid.invalid/ps#/paths/${pointer}/${method}/responses/${status}/content/application~1json/schema`});expect(check(r.body),JSON.stringify(check.errors)).toBe(true);}
  return r;
 }
 const create=(roll:string,extra={})=>call('post','/students',owner,{institution:String(institution._id),institutionStudentId:roll,displayName:'Synthetic Compliance Student',...extra},201);
 async function admit(s:any,roll:string) {const draft=await call('post','/enrolments',owner,{student:s.studentId,allocation:String(pool._id),institutionStudentId:roll,admissionDate:'2026-08-01',startsOn:'2026-08-01',idempotencyKey:roll},201);return (await call('post',`/enrolments/${draft.body.data._id}/activate`,owner,{})).body.data;}
 async function grant() {const r=await call('post',`/enrolments/${enrolment._id}/certificate-print-consent`,studentUser,{},201);return r.body.data;}
 beforeAll(async()=>{
  const uri=new URL(process.env.TEST_MONGODB_URI!);if(!uri.pathname.endsWith('_test'))throw new Error('Dedicated test database required');uri.pathname+='_ps_'+suffix+'_test';await connectDatabase(uri.toString());for(const model of Object.values(mongoose.models))await model.createIndexes();
  process.env.JWT_SECRET=secret;process.env.APAAR_ENCRYPTION_KEY=randomBytes(32).toString('base64');process.env.APAAR_LOOKUP_KEY=randomBytes(32).toString('base64');process.env.APAAR_KEY_VERSION=suffix;process.env.UPLOAD_ENCRYPTION_KEY=randomBytes(32).toString('base64');
  const user=(name:string,role:string)=>m.User.create({email:`${name}-${suffix}@example.invalid`,role,passwordHash:'unusable-synthetic-test-only'});
  admin=await user('admin','AICTE_ADMIN');owner=await user('owner','INSTITUTION_ADMIN');outsider=await user('outsider','INSTITUTION_ADMIN');staff=await user('staff','INSTITUTION_STAFF');studentUser=await user('student','STUDENT');otherStudent=await user('other','STUDENT');employer=await user('employer','EMPLOYER');
  institution=await m.Institution.create({pid:suffix,name:'Synthetic Compliance Institute',state:'Demo'});otherInstitution=await m.Institution.create({pid:'other-'+suffix,name:'Synthetic Other Institute',state:'Demo'});
  for(const [u,i,role]of [[owner,institution,'INSTITUTION_ADMIN'],[staff,institution,'INSTITUTION_STAFF'],[outsider,otherInstitution,'INSTITUTION_ADMIN']])await m.InstitutionMembership.create({user:u._id,institution:i._id,role});
  const program=await m.Program.create({code:suffix,name:'Synthetic Program'}), offering=await m.InstitutionProgram.create({institution:institution._id,program:program._id});year=await m.AcademicYear.create({code:suffix,startsOn:new Date('2026-01-01'),endsOn:new Date('2027-12-31')});const category=await m.SeatCategory.create({code:suffix,name:'Synthetic base'});pool=await m.IntakeAllocation.create({offering:offering._id,academicYear:year._id,category:category._id,kind:'BASE',approvedSeats:20,sourceReference:'Synthetic approved pool'});
 });
 afterAll(disconnectDatabase);
 it('creates independent institution statuses without changing capacity or national identity',async()=>{
  student=(await create('PS-1',{nriStatus:'YES',ociStatus:'YES',foreignNationalStatus:'YES',apaarId:'000000000001'})).body.data;
  expect(student.profile).toMatchObject({nriStatus:'YES',ociStatus:'YES',foreignNationalStatus:'YES'});expect(student.identityAssessment).toMatchObject({identifierPresence:'LINKED',formatStatus:'VALID_AT_LINK',verificationStatus:'UNVERIFIED',officialVerificationAvailable:false});expect((await m.IntakeAllocation.findById(pool._id))!.occupiedSeats).toBe(0);
  const canonical=await m.Student.findById(student.studentId);expect(canonical!.get('nriStatus')).toBeUndefined();
 });
 it('updates scoped declarations with version checks and rejects invalid status/injection',async()=>{
  await call('patch',`/students/${student.studentId}`,owner,{institution:String(institution._id),version:1,nriStatus:'NO'});
  await call('patch',`/students/${student.studentId}`,owner,{institution:String(institution._id),version:1,nriStatus:'UNKNOWN'},409);
  await call('patch',`/students/${student.studentId}`,owner,{institution:String(institution._id),version:2,ociStatus:{$ne:null}},422);
  await call('patch',`/students/${student.studentId}`,outsider,{institution:String(institution._id),version:2,ociStatus:'NO'},403);
  await call('get',`/students/${student.studentId}?institution=${institution._id}`,employer,undefined,403);
  await call('get',`/students/${student.studentId}?institution=${institution._id}`,outsider,undefined,403);
 });
 it('reads legacy missing declarations as UNKNOWN without rewriting stored records',async()=>{
  const s=await m.Student.create({displayName:'Synthetic Legacy'});await m.StudentInstitution.collection.insertOne({student:s._id,institution:institution._id,institutionStudentId:'PS-LEGACY',displayName:'Synthetic Legacy',status:'ACTIVE',version:1,__v:0});
  const r=await call('get',`/students/${s._id}?institution=${institution._id}`,owner);expect(r.body.data.profiles[0]).toMatchObject({nriStatus:'UNKNOWN',ociStatus:'UNKNOWN',foreignNationalStatus:'UNKNOWN'});
  const list=await call('get',`/students?institution=${institution._id}`,owner);expect(list.body.data.items.find((p:any)=>p.student===String(s._id)).nriStatus).toBe('UNKNOWN');
  expect((await m.StudentInstitution.collection.findOne({student:s._id}))!.nriStatus).toBeUndefined();
 });
 it('identifies missing APAAR on draft/active records while preserving the explicit review policy',async()=>{
  missing=(await create('PS-MISSING')).body.data;expect(missing.identityAssessment).toMatchObject({identifierPresence:'MISSING',formatStatus:'NOT_PROVIDED',verificationStatus:'UNVERIFIED',reviewRequired:true});
  enrolment=await admit(student,'PS-1');missingEnrolment=await admit(missing,'PS-MISSING');
  expect(await m.AuditEvent.exists({resourceId:missingEnrolment._id,action:'ADMISSION_IDENTITY_MISSING_REVIEW'})).toBeTruthy();
  const r=await call('get',`/reports/prevalidation?institution=${institution._id}&academicYear=${year._id}`,owner);expect(r.body.data.findings.some((f:any)=>f.ruleId==='MISSING_APAAR_V1')).toBe(true);
 });
 it('rejects invalid/duplicate APAAR with no plaintext leakage and preserves regulator-reviewed association',async()=>{
  await call('post','/students',owner,{institution:String(institution._id),institutionStudentId:'PS-INVALID',displayName:'Synthetic',apaarId:'bad'},422);
  const bad=await request(app).post('/api/v1/students').auth(token(owner),{type:'bearer'}).send({institution:String(institution._id),institutionStudentId:'BAD',displayName:'Synthetic',apaarId:'00000000001'});expect(bad.status).toBe(422);expect(JSON.stringify(bad.body)).not.toContain('00000000001');
  const duplicate=await call('post','/students',owner,{institution:String(institution._id),institutionStudentId:'PS-DUP',displayName:'Synthetic Duplicate',apaarId:'000000000001'},409);expect(duplicate.body.error.code).toBe('IDENTITY_REVIEW_REQUIRED');expect(JSON.stringify(duplicate.body)).not.toContain('000000000001');
  await call('post','/students',outsider,{institution:String(otherInstitution._id),existingStudent:student.studentId,institutionStudentId:'OTHER',displayName:'Synthetic'},403);
  await call('post','/students',admin,{institution:String(otherInstitution._id),existingStudent:student.studentId,institutionStudentId:'OTHER',displayName:'Synthetic'},201);
  const view=await call('get',`/students/${student.studentId}?institution=${institution._id}`,owner);expect(JSON.stringify(view.body)).not.toContain('000000000001');expect(view.body.data.profiles).toHaveLength(1);
 });
 it('keeps mock MATCH, MISMATCH and TIMEOUT distinct from identifier format and official assurance',async()=>{
  const good=await call('post',`/students/${student.studentId}/verify-apaar`,owner,{institution:String(institution._id)});expect(good.body.data).toMatchObject({verificationStatus:'MOCK_VERIFIED',official:false,outcome:'MATCH'});
  for(const [roll,id,status,outcome]of [['PS-MISMATCH','000000000002','VERIFICATION_FAILED','MISMATCH'],['PS-TIMEOUT','000000000004','UNVERIFIED','TIMEOUT']]){const s=(await create(roll!,{apaarId:id})).body.data;const r=await call('post',`/students/${s.studentId}/verify-apaar`,owner,{institution:String(institution._id)});expect(r.body.data).toMatchObject({verificationStatus:status,outcome,official:false});}
  const state=await call('get',`/students/${student.studentId}/identity-status?institution=${institution._id}`,owner);expect(state.body.data.identityAssessment).toMatchObject({identifierPresence:'LINKED',verificationStatus:'MOCK_VERIFIED',reviewRequired:true});
 });
 it('returns redacted print preparation by default and denies non-admin/cross-institution actors',async()=>{
  const r=await call('post',path(),owner,printBody());expect(r.body.data).toMatchObject({apaarId:null,apaarDisplay:'************',institutionStudentId:'PS-1',officialCertificate:false,qualificationCertified:false,degreeAwardingStatus:'NOT_INDEPENDENTLY_VERIFIED'});expect(r.headers['cache-control']).toBe('no-store, private');expect(r.headers.pragma).toBe('no-cache');expect(r.headers.expires).toBe('0');expect(JSON.stringify(r.body)).not.toContain('000000000001');
  for(const actor of [admin,staff,employer,studentUser,outsider])await call('post',path(),actor,printBody(),403);
  await call('post',path(),owner,printBody(false,{institution:String(otherInstitution._id)}),403);
 });
 it('rejects inconsistent academic mappings and inactive profile eligibility without exposing identity',async()=>{
  const current=await m.Enrolment.findById(enrolment._id);const category=current!.category;
  await m.Enrolment.updateOne({_id:enrolment._id},{$set:{category:new mongoose.Types.ObjectId()}});
  try{await call('post',path(),owner,printBody(),404);}finally{await m.Enrolment.updateOne({_id:enrolment._id},{$set:{category}});}
  await m.StudentInstitution.updateOne({student:student.studentId,institution:institution._id},{$set:{status:'INACTIVE'}});
  try{await call('post',path(),owner,printBody(),404);}finally{await m.StudentInstitution.updateOne({student:student.studentId,institution:institution._id},{$set:{status:'ACTIVE'}});}
 });
 it('requires explicit regulator authorization and prevents institutional self-authorization',async()=>{
  const p=`/institutions/${institution._id}/certificate-print-authorization`, body={status:'APPROVED',authorityReference:'SYNTHETIC_REVIEW_ONLY',expiresAt:new Date(Date.now()+86400000).toISOString()};
  await call('post',path(),owner,printBody(true),403);await call('post',p,owner,body,403);await call('post',p,admin,{...body,expiresAt:new Date(0).toISOString()},422);
  const r=await call('post',p,admin,body);expect(r.body.data.degreeAwardingStatus).toBe('NOT_INDEPENDENTLY_VERIFIED');
 });
 it('requires current linked student consent; admins/employers cannot grant it',async()=>{
  await call('post',`/students/${student.studentId}/account-link`,admin,{user:String(studentUser._id)});
  const p=`/enrolments/${enrolment._id}/certificate-print-consent`;
  await call('post',p,owner,{},403);await call('post',p,employer,{},403);await call('post',p,otherStudent,{},404);await call('post',path(),owner,printBody(true),403);
  consent=await grant();expect(consent.purpose).toBe('CERTIFICATE_PRINT_PREPARATION');
 });
 it('discloses full APAAR only through the guarded body and audits metadata without identity values',async()=>{
  const r=await call('post',path(),owner,printBody(true));expect(r.body.data.apaarId).toBe('000000000001');expect(r.body.data.institutionStudentId).toBe('PS-1');expect(r.body.data.identityAssessment.verificationStatus).toBe('MOCK_VERIFIED');expect(r.body.data.officialCertificate).toBe(false);expect(r.headers['cache-control']).toContain('no-store');
  const events=await m.AuditEvent.find({action:'CERTIFICATE_PRINT_FULL_DISCLOSURE',resourceId:enrolment._id});expect(events).toHaveLength(1);expect(JSON.stringify(events)).not.toContain('000000000001');
  expect(await m.DigitalCredential.countDocuments({})).toBe(0); // Print consent never creates an employer credential or widens claims.
 });
 it('revokes all print grants idempotently, keeps consent history and prevents future disclosure',async()=>{
  const p=`/enrolments/${enrolment._id}/certificate-print-consent/revoke`;await call('post',p,otherStudent,{},404);await call('post',p,studentUser,{});await call('post',p,studentUser,{});await call('post',path(),owner,printBody(true),403);
  expect((await m.CertificatePrintConsent.findById(consent.consentId))!.revokedAt).toBeTruthy();const old=consent.consentId;consent=await grant();expect(consent.consentId).not.toBe(old);expect(await m.CertificatePrintConsent.countDocuments({enrolment:enrolment._id})).toBe(2);
 });
 it('enforces consent expiry, account linkage and disabled student accounts at disclosure',async()=>{
  await m.CertificatePrintConsent.updateOne({_id:consent.consentId},{$set:{expiresAt:new Date(0)}});await call('post',path(),owner,printBody(true),403);consent=await grant();
  await m.User.updateOne({_id:studentUser._id},{$set:{active:false}});await call('post',path(),owner,printBody(true),403);await m.User.updateOne({_id:studentUser._id},{$set:{active:true}});
  await m.Student.updateOne({_id:student.studentId},{$unset:{user:1}});await call('post',path(),owner,printBody(true),403);await m.Student.updateOne({_id:student.studentId},{$set:{user:studentUser._id}});
 });
 it('rejects suspended/expired institution permission, inactive membership and unavailable historic keys',async()=>{
  await m.CertificatePrintAuthorization.updateOne({institution:institution._id},{$set:{status:'SUSPENDED'}});await call('post',path(),owner,printBody(true),403);
  await m.CertificatePrintAuthorization.updateOne({institution:institution._id},{$set:{status:'APPROVED',expiresAt:new Date(0)}});await call('post',path(),owner,printBody(true),403);
  await m.CertificatePrintAuthorization.updateOne({institution:institution._id},{$set:{expiresAt:new Date(Date.now()+86400000)}});
  await m.InstitutionMembership.updateOne({institution:institution._id,user:owner._id},{$set:{active:false}});await call('post',path(),owner,printBody(true),403);await m.InstitutionMembership.updateOne({institution:institution._id,user:owner._id},{$set:{active:true}});
  const before=process.env.APAAR_KEY_VERSION;process.env.APAAR_KEY_VERSION='unknown-version';try{await call('post',path(),owner,printBody(true),503);}finally{process.env.APAAR_KEY_VERSION=before;}
 });
 it('handles missing/ineligible print records without inventing identity or completion data',async()=>{
  const redacted=await call('post',path(missing.studentId),owner,printBody(false,{enrolment:missingEnrolment._id}));expect(redacted.body.data).toMatchObject({apaarId:null,apaarDisplay:'NOT_LINKED',qualificationCertified:false});
  await call('post',`/students/${missing.studentId}/account-link`,admin,{user:String(otherStudent._id)});const c=(await call('post',`/enrolments/${missingEnrolment._id}/certificate-print-consent`,otherStudent,{},201)).body.data;
  const missingFull=await call('post',path(missing.studentId),owner,printBody(true,{enrolment:missingEnrolment._id,consentId:c.consentId}),409);expect(missingFull.body.error.code).toBe('IDENTITY_NOT_LINKED');
  await call('post',`/enrolments/${missingEnrolment._id}/withdraw`,owner,{});await call('post',path(missing.studentId),owner,printBody(false,{enrolment:missingEnrolment._id}),404);
 });
 it.each(['csv','xlsx'])('validates/commits extended %s statuses and exposes safe row errors',async format=>{
  const base=(roll:string)=>[roll,'Synthetic Import','','',String(pool._id),String(year._id),'2026-08-01','2026-08-01','','REGULAR'];const data=[extendedColumns,[...base('PS-UP-'+format),'YES','YES','NO'],[...base('PS-BAD-'+format),'invalid','NO','NO']];let bytes:Buffer;
  if(format==='csv')bytes=Buffer.from(data.map(r=>r.join(',')).join('\n'));else{const w=new ExcelJS.Workbook();const s=w.addWorksheet('Synthetic');data.forEach(row=>s.addRow(row));bytes=Buffer.from(await w.xlsx.writeBuffer());}
  const r=await request(app).post('/api/v1/uploads/students').auth(token(owner),{type:'bearer'}).field('institution',String(institution._id)).field('idempotencyKey','PS-'+format).attach('file',bytes,{filename:'synthetic.'+format,contentType:format==='csv'?'text/csv':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});expect(r.status).toBe(202);const id=r.body.data._id;
  await processNextUpload();const review=await call('get',`/uploads/${id}/results`,owner);expect(review.body.data.items[0].status).toBe('VALID');expect(review.body.data.items[1].errorCodes).toContain('INVALID_STUDENT_STATUS');expect(review.body.data.items[0].warnings).toContain('MISSING_APAAR');
  await call('post',`/uploads/${id}/commit`,owner,{},202);await processNextUpload();const p=await m.StudentInstitution.findOne({institution:institution._id,institutionStudentId:'PS-UP-'+format});expect(p).toMatchObject({nriStatus:'YES',ociStatus:'YES',foreignNationalStatus:'NO'});
 });
 it('keeps legacy imports compatible and rejects a conflicting declaration without overwriting an existing profile',async()=>{
  const base=['PS-UP-LEGACY','Synthetic Import','','',String(pool._id),String(year._id),'2026-08-01','2026-08-01','','REGULAR'];
  const upload=async(bytes:Buffer,key:string)=>request(app).post('/api/v1/uploads/students').auth(token(owner),{type:'bearer'}).field('institution',String(institution._id)).field('idempotencyKey',key).attach('file',bytes,{filename:'synthetic.csv',contentType:'text/csv'});
  const old=await upload(Buffer.from([columns,base].map(r=>r.join(',')).join('\n')),'LEGACY');await processNextUpload();await call('post',`/uploads/${old.body.data._id}/commit`,owner,{},202);await processNextUpload();expect((await m.StudentInstitution.findOne({institutionStudentId:'PS-UP-LEGACY'}))!.nriStatus).toBe('UNKNOWN');
  const conflicting=[...base];conflicting[0]='PS-UP-csv';const next=await upload(Buffer.from([extendedColumns,[...conflicting,'NO','YES','NO']].map(r=>r.join(',')).join('\n')),'CONFLICT');await processNextUpload();const result=await call('get',`/uploads/${next.body.data._id}/results`,owner);expect(result.body.data.items[0].errorCodes).toContain('CONFLICTING_STUDENT_STATUS');expect((await m.StudentInstitution.findOne({institutionStudentId:'PS-UP-csv'}))!.nriStatus).toBe('YES');
 });
 it('rechecks explicit imported status values when a profile changes after validation',async()=>{
  const s=(await create('PS-RACE',{nriStatus:'YES'})).body.data;
  const data=[extendedColumns,['PS-RACE','Synthetic Compliance Student','','',String(pool._id),String(year._id),'2026-08-01','2026-08-01','','REGULAR','YES','','']];
  const upload=await request(app).post('/api/v1/uploads/students').auth(token(owner),{type:'bearer'}).field('institution',String(institution._id)).field('idempotencyKey','STATUS-RACE').attach('file',Buffer.from(data.map(r=>r.join(',')).join('\n')),{filename:'synthetic.csv',contentType:'text/csv'});expect(upload.status).toBe(202);const id=upload.body.data._id;
  await processNextUpload();const preview=await call('get',`/uploads/${id}/results`,owner);expect(preview.body.data.items[0].status).toBe('VALID');
  await call('patch',`/students/${s.studentId}`,owner,{institution:String(institution._id),version:1,nriStatus:'NO'});
  await call('post',`/uploads/${id}/commit`,owner,{},202);await processNextUpload();const result=await call('get',`/uploads/${id}/results`,owner);expect(result.body.data.items[0].errorCodes).toContain('STUDENT_STATUS_CHANGED');expect(await m.Enrolment.countDocuments({student:s.studentId})).toBe(0);
 });
 it('generates category declaration and missing-identifier regulatory reports without exposing APAAR or changing seat counts',async()=>{
  const before=(await m.IntakeAllocation.findById(pool._id))!.toObject();
  for(const reportType of ['STUDENT_STATUS_DISTRIBUTION','IDENTITY_STATUS']){
   const queued=await call('post','/reports',owner,{reportType,format:'JSON',filters:{institution:String(institution._id),academicYear:String(year._id)}},202);await processNextReport();const r=await request(app).get(`/api/v1/reports/${queued.body.data.reportId}/download`).auth(token(owner),{type:'bearer'});expect(r.status).toBe(200);expect(JSON.stringify(r.body)).not.toContain('000000000001');
   if(reportType==='STUDENT_STATUS_DISTRIBUTION'){expect(r.body.rows.some((row:any)=>row.ociStatus==='YES'&&row.foreignNationalStatus==='YES'&&row.enrolmentCount===1)).toBe(true);expect(r.body.rows.some((row:any)=>row.nriStatus==='UNKNOWN')).toBe(true);}
   else expect(r.body.summary.identifierPresence.some((g:any)=>g._id==='MISSING')).toBe(true);
   await call('get',`/reports/${queued.body.data.reportId}`,outsider,undefined,404);
  }
  expect((await m.IntakeAllocation.findById(pool._id))!.toObject()).toEqual(before);
 });
 it('exports declaration and missing-identifier CSV reports with safe provenance and scoped columns',async()=>{
  for(const reportType of ['STUDENT_STATUS_DISTRIBUTION','IDENTITY_STATUS']){
   const queued=await call('post','/reports',owner,{reportType,format:'CSV',filters:{institution:String(institution._id),academicYear:String(year._id)}},202);await processNextReport();
   const r=await request(app).get(`/api/v1/reports/${queued.body.data.reportId}/download`).auth(token(owner),{type:'bearer'});expect(r.status).toBe(200);expect(r.headers['content-type']).toContain('text/csv');expect(r.text).toContain('generatorVersion');expect(r.text).not.toContain('000000000001');
   if(reportType==='STUDENT_STATUS_DISTRIBUTION')for(const field of ['nriStatus','ociStatus','foreignNationalStatus','enrolmentCount'])expect(r.text).toContain(field);
   else{expect(r.text).toContain('identifierPresence');expect(r.text).toContain('MISSING');}
  }
 });
 it('reconciles protected identity inconsistencies read-only without emitting identifiers or digests',async()=>{
  const before=(await m.ApaarIdentityVault.findOne({student:student.studentId}).select('+ciphertext'))!.ciphertext;
  const other=await m.Student.create({displayName:'Synthetic Reconciliation'}), version='historical-'+suffix;
  const encryption=randomBytes(32).toString('base64'),lookup=randomBytes(32).toString('base64');process.env.APAAR_KEYRING_JSON=JSON.stringify({[version]:{encryptionKey:encryption,lookupKey:lookup}});
  await m.ApaarIdentityVault.create({student:other._id,keyVersion:version,...protectIdentity('000000000001',String(other._id),encryption,lookup)});
  await m.ApaarIdentityVault.create({student:new mongoose.Types.ObjectId(),keyVersion:'missing-historic-key',ciphertext:randomBytes(12),nonce:randomBytes(12),tag:randomBytes(16),lookupDigest:randomBytes(32)});
  const corrupt=await m.Student.create({displayName:'Synthetic Corrupt Vault'});await m.ApaarIdentityVault.create({student:corrupt._id,keyVersion:suffix,ciphertext:randomBytes(12),nonce:randomBytes(12),tag:randomBytes(16),lookupDigest:randomBytes(32)});
  await m.Student.create({displayName:'Synthetic Stale Assurance',identityStatus:'MOCK_VERIFIED'});
  try{
   const report=await reconcileIdentityLinks();const codes=report.findings.map(f=>f.code);for(const c of ['DUPLICATE_PROTECTED_IDENTITY','ORPHANED_IDENTITY_VAULT','IDENTITY_KEY_VERSION_UNAVAILABLE','IDENTITY_CIPHERTEXT_INVALID','IDENTITY_ASSURANCE_WITHOUT_LINK'])expect(codes).toContain(c);
   expect(report.readOnly).toBe(true);expect(report.repairPerformed).toBe(false);expect(JSON.stringify(report)).not.toContain('000000000001');expect(JSON.stringify(report)).not.toContain('lookupDigest');
   expect((await m.ApaarIdentityVault.findOne({student:student.studentId}).select('+ciphertext'))!.ciphertext).toEqual(before);
  }finally{delete process.env.APAAR_KEYRING_JSON;}
 });

});
