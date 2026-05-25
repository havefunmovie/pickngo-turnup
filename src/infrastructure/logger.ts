import winston from 'winston';
import { env } from '@config/env';

export const logger = winston.createLogger({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  format:
    env.NODE_ENV === 'production'
      ? winston.format.json()
      : winston.format.combine(winston.format.colorize(), winston.format.simple()),
  defaultMeta: { service: 'turnup' },
  transports: [new winston.transports.Console()],
});
