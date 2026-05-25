import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '@infrastructure/logger';

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const requestId = uuidv4();
  const start = Date.now();
  res.setHeader('X-Request-Id', requestId);

  res.on('finish', () => {
    logger.info({
      requestId,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs: Date.now() - start,
      userId: req.auth?.userId,
    });
  });

  next();
}
