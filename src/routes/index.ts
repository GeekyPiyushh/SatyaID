import { databaseReady } from '../config/database';
import { Router } from 'express';
import { health } from '../controllers/health.controller';
export const apiRouter = Router();
apiRouter.get('/health', health);

apiRouter.get('/ready', (_req, res) => { const ready = databaseReady(); res.status(ready ? 200 : 503).json(ready ? { success: true, message: 'Database ready', data: { database: 'ready' } } : { success: false, error: { code: 'DATABASE_UNAVAILABLE', message: 'Database is not ready' } }); });
