import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { createStudentSchema, updateStudentSchema, apaar } from '../src/validators/batch2';
import { studentStatusFields } from '../src/validators/student-status';
import { printDataSchema } from '../src/validators/certificate-print';
import { columns, extendedColumns, parseStudentFile } from '../src/services/upload-parser';
const id = '000000000000000000000001';
const registration = { institution: id, institutionStudentId: 'SYN-1', displayName: 'Synthetic Student' };
const row = ['SYN-IMPORT','Synthetic Import','','',id,id,'2026-08-01','2026-08-01','','REGULAR'];
describe('PS compliance strict input and compatible formats', () => {
 it('accepts independent overlapping statuses and optional legacy student fields', () => {
  expect(createStudentSchema.parse(registration).nriStatus).toBeUndefined();
  expect(createStudentSchema.parse({ ...registration, nriStatus:'YES',ociStatus:'YES',foreignNationalStatus:'YES' })).toMatchObject({nriStatus:'YES',ociStatus:'YES',foreignNationalStatus:'YES'});
  expect(apaar.safeParse('000000000001').success).toBe(true); expect(apaar.safeParse('0001').success).toBe(false); expect(apaar.safeParse(1).success).toBe(false);
 });
 it.each(studentStatusFields)('rejects invalid/coerced/injected %s status values in create and update', field => {
  for (const value of [true,false,'true','NRI','yes','',1,null,{$ne:null}]) {
   expect(createStudentSchema.safeParse({...registration,[field]:value}).success).toBe(false);
   expect(updateStudentSchema.safeParse({institution:id,version:1,[field]:value}).success).toBe(false);
  }
  for (const value of ['YES','NO','UNKNOWN']) expect(createStudentSchema.safeParse({...registration,[field]:value}).success).toBe(true);
 });
 it.each(['csv','xlsx'])('preserves both legacy and extended %s columns, leading-zero identity and blank unknown fields', async format => {
  for (const header of [columns,extendedColumns]) {
   const data = [...row]; data[3] = '000000000001'; if (header.length === 13) data.push('YES','','NO');
   let bytes: Buffer;
   if (format === 'csv') bytes = Buffer.from([header,data].map(r=>r.join(',')).join('\n'));
   else { const w = new ExcelJS.Workbook();const s = w.addWorksheet('Synthetic');s.addRow(header);s.addRow(data);bytes = Buffer.from(await w.xlsx.writeBuffer()); }
   const [parsed] = await parseStudentFile(bytes,format); expect(parsed!.apaarId).toBe('000000000001');
   if(header.length===13) expect(parsed).toMatchObject({nriStatus:'YES',ociStatus:'',foreignNationalStatus:'NO'});else expect(parsed!.nriStatus).toBeUndefined();
  }
 });
 it('rejects extra/reordered columns and formulas in the extended final column', async () => {
  await expect(parseStudentFile(Buffer.from([...extendedColumns,'extra'].join(',')+'\n'+[...row,'YES','NO','NO','bad'].join(',')),'csv')).rejects.toMatchObject({code:'INVALID_COLUMNS'});
  const w = new ExcelJS.Workbook();const s = w.addWorksheet('Synthetic');s.addRow(extendedColumns);s.addRow([...row,'YES','NO','NO']);s.getCell('M2').value={formula:'1+1',result:2};
  await expect(parseStudentFile(Buffer.from(await w.xlsx.writeBuffer()),'xlsx')).rejects.toMatchObject({code:'UNSUPPORTED_XLSX_CELL'});
 });
 it('requires explicit bounded print disclosure input, never a boolean/raw identifier shortcut', () => {
  const body={institution:id,enrolment:id,purposeCode:'CERTIFICATE_PRINT_PREPARATION'};
  expect(printDataSchema.parse(body).disclosure).toBe('REDACTED');
  expect(printDataSchema.safeParse({...body,disclosure:'FULL'}).success).toBe(false);
  expect(printDataSchema.safeParse({...body,disclosure:'FULL',consentId:id}).success).toBe(true);
  expect(printDataSchema.safeParse({...body,apaarId:'000000000001'}).success).toBe(false);
 });
});
