import fs from 'fs';
import path from 'path';
import { Pool, PoolClient } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function ensureMigrationsTable(client: PoolClient) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function getApplied(client: PoolClient): Promise<Set<string>> {
  const { rows } = await client.query('SELECT version FROM schema_migrations ORDER BY version');
  return new Set(rows.map((r: Record<string, unknown>) => r.version as string));
}

async function migrate() {
  const client: PoolClient = await pool.connect();
  try {
    await client.query('BEGIN');
    await ensureMigrationsTable(client);
    const applied = await getApplied(client);

    const migrationsDir = path.resolve(__dirname);
    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql') && !f.startsWith('_'))
      .sort();

    for (const file of files) {
      const version = file.replace('.sql', '');
      if (applied.has(version)) {
        console.log(`  skip  ${version}`);
        continue;
      }
      console.log(`  apply ${version}`);
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [version]);
    }

    await client.query('COMMIT');
    console.log('Migrations complete.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
