import { Pool, PoolClient } from 'pg';
import { env } from '@config/env';

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 2 * 4 + 1,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  statement_timeout: 5000,
});

pool.on('error', (err) => {
  console.error('Unexpected database pool error', err);
});

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
