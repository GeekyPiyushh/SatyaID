import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';
export const requestContext = new AsyncLocalStorage<{ correlationId: string; actorRole?: string }>();
export const correlateRequest: RequestHandler = (_req, res, next) => {
 const correlationId = randomUUID(); res.setHeader('X-Request-ID', correlationId); requestContext.run({ correlationId }, next);
};
