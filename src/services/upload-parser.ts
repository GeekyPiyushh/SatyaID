import { studentStatusFields } from '../validators/student-status';
import { parse } from 'csv-parse/sync';
import ExcelJS from 'exceljs';
import yauzl from 'yauzl';
import { SaxesParser } from 'saxes';
import { AppError } from '../utils/app-error';
export const MAX_BYTES = 2 * 1024 * 1024;
export const MAX_ROWS = 1000;
export const columns = ['institutionStudentId', 'displayName', 'dateOfBirth', 'apaarId', 'allocation', 'academicYear', 'admissionDate', 'startsOn', 'endsOn', 'entryType'];
export const extendedColumns = [...columns, ...studentStatusFields];
function invalid(code = 'INVALID_UPLOAD'): never { throw new AppError(422, code, 'Upload format or configured limits are invalid'); }
async function inspectZip(buffer: Buffer) {
 await new Promise<void>((resolve, reject) => {
  yauzl.fromBuffer(buffer, { lazyEntries: true, validateEntrySizes: true }, (error, zip) => {
   if (error || !zip) return reject(new AppError(422, 'INVALID_XLSX', 'Invalid XLSX archive'));
   let count = 0, expanded = 0; const names = new Set<string>(); let ended = false;
   const fail = () => { if (!ended) { ended = true; zip.close(); reject(new AppError(422, 'XLSX_LIMIT_EXCEEDED', 'XLSX archive exceeds allowed limits')); } };
   zip.on('error', fail);
   zip.on('end', () => { if (ended) return; ended = true; if (!names.has('xl/workbook.xml') || !names.has('[Content_Types].xml')) reject(new AppError(422, 'INVALID_XLSX', 'Invalid XLSX workbook')); else resolve(); });
   zip.on('entry', entry => {
    count++; if (count > 100 || entry.uncompressedSize > 8 * 1024 * 1024 || entry.fileName.includes('..') || entry.fileName.startsWith('/') || entry.fileName.includes('vbaProject') || entry.generalPurposeBitFlag & 1) return fail();
    names.add(entry.fileName);
    if (entry.fileName.endsWith('/')) { zip.readEntry(); return; }
    const permitted = /^(\[Content_Types\]\.xml|_rels\/\.rels|docProps\/(app|core)\.xml|xl\/(workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|styles\.xml|theme\/theme1\.xml|worksheets\/sheet1\.xml))$/;
    if (!permitted.test(entry.fileName)) return fail();
    zip.openReadStream(entry, (e, stream) => {
     if (e || !stream) return fail();
     const chunks: Buffer[] = [];
     stream.on('error', fail);
     stream.on('data', chunk => { expanded += chunk.length; if (expanded > 8 * 1024 * 1024) { stream.destroy(); fail(); } else chunks.push(chunk); });
     stream.on('end', () => {
      if (ended) return;
      try {
       let elements = 0, rows = 0, cells = 0, strings = 0;
       const parser = new SaxesParser();
       parser.on('doctype', () => { throw new Error('DTD forbidden'); });
       parser.on('opentag', tag => {
        if (++elements > 100000) throw new Error('XML element limit');
        if (tag.name === 'row') { if (++rows > MAX_ROWS + 1 || Number(tag.attributes.r) > MAX_ROWS + 1) throw new Error('Row limit'); cells = 0; }
        if (tag.name === 'c') { const address = String(tag.attributes.r ?? ''); if (++cells > extendedColumns.length || !/^[A-M][1-9]\d{0,3}$/.test(address) || Number(address.slice(1)) > MAX_ROWS + 1) throw new Error('Cell limit'); }
        if (tag.name === 'si' && ++strings > (MAX_ROWS + 1) * extendedColumns.length) throw new Error('Shared string limit');
       });
       parser.write(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))).close(); zip.readEntry();
      } catch { fail(); }
     });
    });
   }); zip.readEntry();
  });
 });
}
export async function parseStudentFile(buffer: Buffer, format: string): Promise<Record<string, string>[]> {
 if (buffer.length > MAX_BYTES) invalid('UPLOAD_TOO_LARGE');
 let matrix: string[][] = [];
 try {
  if (format === 'csv') {
   if (buffer.includes(0) || buffer.subarray(0, 2).equals(Buffer.from('PK'))) invalid();
   const parser = parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer), { bom: true, skip_empty_lines: true, max_record_size: 8192, to: MAX_ROWS + 2 });
   matrix = parser;
  } else if (format === 'xlsx') {
   if (buffer.readUInt16LE(0) !== 0x4b50) invalid('INVALID_XLSX');
   await inspectZip(buffer);
   // Preflight bounds XML expansion, row addresses and shared strings before object allocation.
   // In-memory loading avoids plaintext temporary worksheet files from streaming readers.
   const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(buffer as any);
   if (workbook.worksheets.length !== 1) invalid('MULTIPLE_SHEETS_UNSUPPORTED');
   const sheet = workbook.worksheets[0]!;
   if (sheet.rowCount > MAX_ROWS + 1) invalid('ROW_LIMIT_EXCEEDED');
   const width = sheet.getRow(1).cellCount;
   if (![columns.length, extendedColumns.length].includes(width)) invalid('INVALID_COLUMNS');
   sheet.eachRow(row => {
    if (row.cellCount > width) invalid('INVALID_CELL');
    matrix.push(Array.from({ length: width }, (_, i) => {
     const cell = row.getCell(i + 1);
     if (cell.type === ExcelJS.ValueType.Formula || cell.type === ExcelJS.ValueType.Hyperlink || typeof cell.value === 'object' && cell.value !== null) invalid('UNSUPPORTED_XLSX_CELL');
     return cell.value === null ? '' : String(cell.value);
    }));
   });
  } else invalid();
 } catch (e) { if (e instanceof AppError) throw e; invalid(); }
 if (matrix.length < 2 || matrix.length > MAX_ROWS + 1) invalid('ROW_LIMIT_EXCEEDED');
 const header = matrix.shift()!;
 const selected = header.length === columns.length ? columns : extendedColumns;
 if (header.length !== selected.length || header.some((v, i) => v !== selected[i])) invalid('INVALID_COLUMNS');
 return matrix.map(values => {
  if (values.length !== selected.length || values.some(v => typeof v !== 'string' || v.length > 500)) invalid('INVALID_CELL');
  return Object.fromEntries(selected.map((key, i) => [key, values[i]!.trim()]));
 });
}
