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

export function createApp(config: Pick<Environment, 'CORS_ORIGINS'> & Partial<Pick<Environment, 'TRUST_PROXY'>>) {
  const app = express();
  app.disable('x-powered-by');
  app.locals.allowedBrowserOrigins = config.CORS_ORIGINS;
  app.set('trust proxy', config.TRUST_PROXY?.length ? config.TRUST_PROXY : false);
  app.use(correlateRequest);
  app.use(helmet());
  app.use(cors((req, done) => done(null, {
    origin: (requestOrigin, callback) => {
      if (!requestOrigin || config.CORS_ORIGINS.includes(requestOrigin)) callback(null, true);
      else callback(new AppError(403, 'CORS_ORIGIN_DENIED', 'Origin is not allowed'));
    },
    credentials: req.url.startsWith('/api/v1/auth/browser'),
    exposedHeaders: ['X-Request-ID'],
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  })));
  app.use(express.json({ limit: '100kb' }));
  app.locals.apiMounts = [];
  const mount = (prefix: string, router: express.Router) => { app.locals.apiMounts.push({ prefix, router }); app.use(prefix, router); };
  mount('/api/v1/auth', authRouter);
  mount('/api/v1/analytics', analyticsRouter);
  mount('/api/v1/verification', verificationRouter);
  mount('/api/v1/consents', consentRouter);
  mount('/api/v1/credentials', credentialRouter);
  mount('/api/v1/reports', reportRouter);
  mount('/api/v1/audit', auditRouter);
  mount('/api/v1/intelligence', intelligenceRouter);
  mount('/api/v1/students', studentRouter);
  mount('/api/v1/enrolments', enrolmentRouter);
  mount('/api/v1/uploads', uploadRouter);
  mount('/api/v1/conflicts', conflictRouter);
  mount('/api/v1/transfers', transferRouter);
  mount('/api/v1', managementRouter);
  mount('/api', apiRouter);
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
