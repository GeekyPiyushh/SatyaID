import type { RequestHandler } from 'express';
import type { ApiSuccess } from '../types/api';
export const health: RequestHandler = (_req, res) => {
  const body: ApiSuccess<{ service: string }> = {
    success: true,
    message: 'SatyaID AICTE APAAR Backend API is running',
    data: { service: 'satyaid-backend' },
  };
  res.status(200).json(body);
};
