import { mkdir, writeFile } from 'node:fs/promises';
import ExcelJS from 'exceljs';
import { connectDatabase, disconnectDatabase } from '../src/config/database';
import { parseEnvironment } from '../src/config/env';
import { extendedColumns } from '../src/services/upload-parser';
import * as m from '../src/models';
async function main() {
 const c = parseEnvironment(process.env);
 if (c.NODE_ENV === 'production' || process.env.ALLOW_DEMO_SEED !== 'true' || !c.MONGODB_URI || !new URL(c.MONGODB_URI).pathname.endsWith('_demo')) throw new Error('Dedicated demo database required');
 await connectDatabase(c.MONGODB_URI);
 const institution = await m.Institution.findOne({ pid: 'DEMO-SATYAID-001' }); const year = await m.AcademicYear.findOne({ code: 'DEMO-2026-27' });
 const offering = await m.InstitutionProgram.findOne({ institution: institution?._id });
 const pool = await m.IntakeAllocation.findOne({ offering: offering?._id, academicYear: year?._id, kind: 'BASE' });
 if (!institution || !year || !pool) throw new Error('Run synthetic seed first');
 const rows = [extendedColumns, ['DEMO-UPLOAD-001', 'Synthetic Upload One', '', '000000000003', String(pool._id), String(year._id), '2026-08-01', '2026-08-01', '', 'REGULAR', 'YES', 'NO', 'NO'], ['DEMO-UPLOAD-002', 'Synthetic Missing Identity', '', '', String(pool._id), String(year._id), '2026-08-01', '2026-08-01', '', 'REGULAR', '', '', '']];
 await mkdir('samples/generated', { recursive: true }); await writeFile('samples/generated/students-demo.csv', rows.map(r => r.join(',')).join('\n'));
 const workbook = new ExcelJS.Workbook(); const sheet = workbook.addWorksheet('Synthetic Students'); rows.forEach(row => sheet.addRow(row)); await workbook.xlsx.writeFile('samples/generated/students-demo.xlsx');
 console.log('Synthetic CSV/XLSX samples generated under samples/generated; do not use with real student data.');
}
main().catch(() => { console.error('Sample generation failed; verify dedicated demo database and seed.'); process.exitCode = 1; }).finally(disconnectDatabase);
