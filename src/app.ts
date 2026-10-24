import { correlateRequest } from './utils/request-context';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import type { Environment } from './config/env';
import { AppError } from './utils/app-error';
import { intelligenceRouter } from './routes/regulatory/intelligence';
import { reportRouter } from './routes/regulatory/reports';
import { auditRouter } from './routes/regulatory/audit';
import { verificationRouter, consentRouter, credentialRouter } from './routes/regulatory/consent';
import { analyticsRouter } from './routes/regulatory/analytics';
import { transferRouter } from './routes/transfers';
import { conflictRouter } from './routes/conflicts';
import { uploadRouter } from './routes/uploads';
import { enrolmentRouter } from './routes/enrolments';
import { studentRouter } from './routes/students';
import { managementRouter } from './routes/management';
import { authRouter } from './routes/auth';
import { apiRouter } from './routes';
import { errorHandler, notFound } from './middlewares/error-handler';

export function createApp(config: Pick<Environment, 'CORS_ORIGINS'>) {
  const app = express();
  app.disable('x-powered-by');
  app.use(correlateRequest);
  app.use(helmet());
  app.use(cors({
    origin: (requestOrigin, callback) => {
      if (!requestOrigin || config.CORS_ORIGINS.includes(requestOrigin)) callback(null, true);
      else callback(new AppError(403, 'CORS_ORIGIN_DENIED', 'Origin is not allowed'));
    },
    credentials: false,
    exposedHeaders: ['X-Request-ID'],
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  }));
  app.use(express.json({ limit: '100kb' }));
  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/analytics', analyticsRouter);
  app.use('/api/v1/verification', verificationRouter);
  app.use('/api/v1/consents', consentRouter);
  app.use('/api/v1/credentials', credentialRouter);
  app.use('/api/v1/reports', reportRouter);
  app.use('/api/v1/audit', auditRouter);
  app.use('/api/v1/intelligence', intelligenceRouter);
  app.use('/api/v1/students', studentRouter);
  app.use('/api/v1/enrolments', enrolmentRouter);
  app.use('/api/v1/uploads', uploadRouter);
  app.use('/api/v1/conflicts', conflictRouter);
  app.use('/api/v1/transfers', transferRouter);
  app.use('/api/v1', managementRouter);
  app.use('/api', apiRouter);
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
