import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3003),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  STORAGE_BUCKET: z.string().default('turnup-media'),
  STORAGE_PUBLIC_URL: z.string().default(''),
  EMAIL_FROM: z.string().default('noreply@pickngo.com'),
  SMTP_HOST: z.string().default(''),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().default(''),
  SMTP_PASS: z.string().default(''),
  PICKNGO_API_URL: z.string().default('http://localhost:3000'),
  PICKNGO_API_KEY: z.string().default(''),
  RESERVATION_TTL: z.coerce.number().default(172800),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000),
  RATE_LIMIT_MAX_PUBLIC: z.coerce.number().default(60),
  RATE_LIMIT_MAX_AUTH: z.coerce.number().default(600),
  RATE_LIMIT_MAX_WRITE: z.coerce.number().default(30),
});

const result = envSchema.safeParse(process.env);
if (!result.success) {
  console.error('Invalid environment variables:', result.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = result.data;
