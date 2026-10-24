import type { RequestHandler } from 'express';
import type { z } from 'zod';
import { AppError } from '../utils/app-error';

// Validated/transformed input lives in locals; do not overwrite Express 5 query getters.
export function validate(schema: z.ZodType, target: 'body' | 'query' | 'params' = 'body'): RequestHandler {
  const handler: RequestHandler = (req, res, next) => {
    const result = schema.safeParse(req[target]);
    if (!result.success) { next(new AppError(422, 'VALIDATION_ERROR', 'Request validation failed')); return; }
    res.locals.validated = result.data;
    next();
  };
  Object.assign(handler, { validation: { schema, target } });
  return handler;
}
