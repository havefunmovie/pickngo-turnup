import { PoolClient } from 'pg';
import { pool } from '@infrastructure/database/pool';
import { PointOfSale, CommissionType } from '@domain/types';

function rowToPos(row: Record<string, unknown>): PointOfSale {
  return {
    id: row.id as string,
    eventId: row.event_id as string,
    storeId: row.store_id as string,
    quota: row.quota as number | null,
    quotaUsed: row.quota_used as number,
    commissionType: row.commission_type as CommissionType,
    commissionValue: Number(row.commission_value),
    isActive: row.is_active as boolean,
    createdAt: row.created_at as Date,
    updatedAt: row.updated_at as Date,
  };
}

export interface CreatePosInput {
  eventId: string;
  storeId: string;
  quota?: number;
  commissionType?: CommissionType;
  commissionValue?: number;
}

export async function createPointOfSale(
  input: CreatePosInput,
  client?: PoolClient,
): Promise<PointOfSale> {
  const db = client ?? pool;
  const { rows } = await db.query(
    `INSERT INTO points_of_sale (event_id, store_id, quota, commission_type, commission_value)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (event_id, store_id) DO UPDATE SET quota = $3, commission_type = $4, commission_value = $5, is_active = true
     RETURNING *`,
    [
      input.eventId,
      input.storeId,
      input.quota ?? null,
      input.commissionType ?? 'percentage',
      input.commissionValue ?? 0,
    ],
  );
  return rowToPos(rows[0]);
}

export async function findPosByEvent(eventId: string): Promise<PointOfSale[]> {
  const { rows } = await pool.query(
    'SELECT * FROM points_of_sale WHERE event_id = $1 AND is_active = true',
    [eventId],
  );
  return rows.map(rowToPos);
}

export async function findPosByStore(storeId: string): Promise<PointOfSale[]> {
  const { rows } = await pool.query(
    'SELECT * FROM points_of_sale WHERE store_id = $1 AND is_active = true ORDER BY created_at DESC',
    [storeId],
  );
  return rows.map(rowToPos);
}

export async function findPosById(id: string, client?: PoolClient): Promise<PointOfSale | null> {
  const db = client ?? pool;
  const { rows } = await db.query('SELECT * FROM points_of_sale WHERE id = $1', [id]);
  return rows[0] ? rowToPos(rows[0]) : null;
}

export async function incrementPosQuota(
  storeId: string,
  eventId: string,
  quantity: number,
  client?: PoolClient,
): Promise<void> {
  const db = client ?? pool;
  await db.query(
    'UPDATE points_of_sale SET quota_used = quota_used + $1 WHERE store_id = $2 AND event_id = $3',
    [quantity, storeId, eventId],
  );
}

export async function deactivatePos(id: string): Promise<void> {
  await pool.query('UPDATE points_of_sale SET is_active = false WHERE id = $1', [id]);
}
