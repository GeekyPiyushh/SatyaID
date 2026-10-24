import { Router } from 'express';
import multer from 'multer';
import { createRateLimiter } from '../utils/rate-limit';
import { z } from 'zod';
import { authenticate } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import { objectId, code, pagination } from '../validators/batch2';
import { AppError } from '../utils/app-error';
import { jobAccess, queueUpload, confirmUpload, retryUpload } from '../services/uploads';
import { extendedColumns, MAX_BYTES } from '../services/upload-parser';
import { UploadRowResult } from '../models';
export const uploadRouter = Router();
uploadRouter.use(authenticate, createRateLimiter('uploads.1', { windowMs: 60000, limit: 60, standardHeaders: true, legacyHeaders: false, handler: (_req, res) => { res.status(429).json({ success: false, error: { code: 'RATE_LIMITED', message: 'Upload request limit reached' } }); } }));
const multipart = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_BYTES, files: 1, fields: 2, fieldSize: 256, parts: 3 } });
const reply = (res: any, data: unknown) => res.json({ success: true, message: 'Success', data });
uploadRouter.get('/template', (_req, res) => res.type('text/csv').attachment('satyaid-students-template.csv').send(extendedColumns.join(',') + '\n'));
uploadRouter.param('id', (_req, _res, next, id) => objectId.safeParse(id).success ? next() : next(new AppError(422, 'VALIDATION_ERROR', 'Invalid upload reference')));
uploadRouter.post('/students', multipart.single('file'), validate(z.object({ institution: objectId, idempotencyKey: code }).strict()), async (req, res) => {
 const file = req.file; if (!file) throw new AppError(422, 'FILE_REQUIRED', 'One CSV or XLSX file is required');
 const format = file.originalname.toLowerCase().endsWith('.csv') && ['text/csv', 'application/csv'].includes(file.mimetype) ? 'csv' : file.originalname.toLowerCase().endsWith('.xlsx') && file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ? 'xlsx' : null;
 if (!format) throw new AppError(422, 'UNSUPPORTED_UPLOAD_TYPE', 'Only CSV and XLSX uploads are supported');
 res.status(202); reply(res, await queueUpload(res.locals.user, res.locals.validated.institution, res.locals.validated.idempotencyKey, file.buffer, format));
});
uploadRouter.get('/:id', async (req, res) => reply(res, await jobAccess(res.locals.user, String(req.params.id))));
uploadRouter.get('/:id/results', validate(z.object(pagination).strict(), 'query'), async (req, res) => { await jobAccess(res.locals.user, String(req.params.id)); const { page, limit } = res.locals.validated; reply(res, { items: await UploadRowResult.find({ job: req.params.id }).select('rowNumber status errorCodes warnings student enrolment').sort({ rowNumber: 1 }).skip((page - 1) * limit).limit(limit), total: await UploadRowResult.countDocuments({ job: req.params.id }), page, limit }); });
uploadRouter.post('/:id/commit', validate(z.object({}).strict()), async (req, res) => { res.status(202); reply(res, await confirmUpload(res.locals.user, String(req.params.id))); });
uploadRouter.get('/:id/error-report', async (req, res) => {
 await jobAccess(res.locals.user, String(req.params.id)); const rows = await UploadRowResult.find({ job: req.params.id, status: { $in: ['INVALID', 'FAILED'] } }).select('rowNumber errorCodes').sort({ rowNumber: 1 }).limit(1000);
 const safe = (value: string) => '"' + (/^[=+\-@\t\r]/.test(value) ? "'" : '') + value.replace(/"/g, '""') + '"';
 res.type('text/csv').attachment('satyaid-upload-errors.csv').send('rowNumber,errorCodes\n' + rows.map(r => `${r.rowNumber},${safe((r.errorCodes as string[]).join('|'))}`).join('\n'));
});

uploadRouter.post('/:id/retry', validate(z.object({}).strict()), async (req, res) => { res.status(202); reply(res, await retryUpload(res.locals.user, String(req.params.id))); });
