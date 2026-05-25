import { createClient } from 'redis';
import { env } from '@config/env';

export const redis = createClient({ url: env.REDIS_URL });

redis.on('error', (err) => console.error('Redis error', err));

export async function connectRedis() {
  await redis.connect();
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  const raw = await redis.get(key);
  return raw ? (JSON.parse(raw) as T) : null;
}

export async function cacheSet(key: string, value: unknown, ttlSeconds: number) {
  await redis.setEx(key, ttlSeconds, JSON.stringify(value));
}

export async function cacheDel(key: string) {
  await redis.del(key);
}

export async function cacheDelPattern(pattern: string) {
  const keys = await redis.keys(pattern);
  if (keys.length > 0) await redis.del(keys);
}
