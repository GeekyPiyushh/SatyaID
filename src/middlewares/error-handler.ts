import type { ErrorRequestHandler, RequestHandler } from 'express';
import { AppError } from '../utils/app-error';
import type { ApiFailure } from '../types/api';

export const notFound: RequestHandler = (_req, _res, next) => {
  next(new AppError(404, 'NOT_FOUND', 'The requested route was not found'));
};

export const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, next) => {
  if (res.headersSent) { next(error); return; }
  let status = 500;
  let code = 'INTERNAL_SERVER_ERROR';
  let message = 'An unexpected error occurred';
  if (error instanceof AppError) {
    ({ status, code, message } = error);
  } else if (typeof error === 'object' && error !== null && 'type' in error) {
    if (error.type === 'entity.parse.failed') {
      status = 400; code = 'INVALID_JSON'; message = 'Request body must be valid JSON';
    } else if (error.type === 'entity.too.large') {
      status = 413; code = 'PAYLOAD_TOO_LARGE'; message = 'Request body exceeds the allowed size';
    } else if (error.type === 'encoding.unsupported' || error.type === 'charset.unsupported') {
      status = 415; code = 'UNSUPPORTED_MEDIA_TYPE'; message = 'Unsupported request encoding';
    }
  }
  if (typeof error === 'object' && error !== null && 'code' in error && error.code === 11000) { status = 409; code = 'DUPLICATE_RECORD'; message = 'A record with this key already exists'; }
  if (typeof error === 'object' && error !== null && 'name' in error && error.name === 'MulterError') { status = 413; code = 'UPLOAD_LIMIT_EXCEEDED'; message = 'Upload exceeds permitted file or multipart limits'; }
  const body: ApiFailure = { success: false, error: { code, message } };
  res.status(status).json(body);
};
