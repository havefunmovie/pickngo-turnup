import { PoolClient } from 'pg';
import { pool } from '@infrastructure/database/pool';
import { Event, EventStatus, PaginatedResult } from '@domain/types';

function rowToEvent(row: Record<string, unknown>): Event {
  return {
    id: row.id as string,
    promoterId: row.promoter_id as string,
    title: row.title as string,
    description: row.description as string,
    category: row.category as string,
    eventType: row.event_type as string,
    status: row.status as EventStatus,
    startsAt: row.starts_at as Date,
    endsAt: row.ends_at as Date,
    address: row.address as string,
    city: row.city as string,
    country: row.country as string,
    lat: row.lat as number | null,
    lng: row.lng as number | null,
    capacity: row.capacity as number,
    coverImageUrl: row.cover_image_url as string | null,
    images: row.images as string[],
    keywords: row.keywords as string[],
    adminNote: row.admin_note as string | null,
    reviewedBy: row.reviewed_by as string | null,
    reviewedAt: row.reviewed_at as Date | null,
    createdAt: row.created_at as Date,
    updatedAt: row.updated_at as Date,
  };
}

export interface EventFilters {
  city?: string;
  category?: string;
  search?: string;
  status?: EventStatus;
  promoterId?: string;
  fromDate?: Date;
  toDate?: Date;
  cursor?: string;
  limit?: number;
}

export async function findEventById(id: string, client?: PoolClient): Promise<Event | null> {
  const db = client ?? pool;
  const { rows } = await db.query('SELECT * FROM events WHERE id = $1', [id]);
  return rows[0] ? rowToEvent(rows[0]) : null;
}

export async function findEvents(filters: EventFilters): Promise<PaginatedResult<Event>> {
  const limit = Math.min(filters.limit ?? 20, 100);
  const conditions: string[] = [];
  const params: unknown[] = [];
  let p = 1;

  conditions.push(`e.status = 'approved'`);

  if (filters.city) {
    conditions.push(`e.city ILIKE $${p++}`);
    params.push(`%${filters.city}%`);
  }
  if (filters.category) {
    conditions.push(`e.category = $${p++}`);
    params.push(filters.category);
  }
  if (filters.search) {
    conditions.push(
      `(e.title ILIKE $${p} OR e.description ILIKE $${p} OR $${p} = ANY(e.keywords))`,
    );
    params.push(`%${filters.search}%`);
    p++;
  }
  if (filters.fromDate) {
    conditions.push(`e.starts_at >= $${p++}`);
    params.push(filters.fromDate);
  }
  if (filters.toDate) {
    conditions.push(`e.starts_at <= $${p++}`);
    params.push(filters.toDate);
  }
  if (filters.cursor) {
    conditions.push(`e.starts_at > $${p++}`);
    params.push(new Date(Buffer.from(filters.cursor, 'base64').toString()));
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const { rows } = await pool.query(
    `SELECT * FROM events e ${where} ORDER BY e.starts_at ASC LIMIT $${p}`,
    [...params, limit + 1],
  );

  const hasMore = rows.length > limit;
  const data = rows.slice(0, limit).map(rowToEvent);
  const lastCursor =
    hasMore ? Buffer.from(data[data.length - 1].startsAt.toISOString()).toString('base64') : null;

  return { data, meta: { cursor: lastCursor, hasMore } };
}

export async function findPromoterEvents(
  promoterId: string,
  status?: EventStatus,
): Promise<Event[]> {
  const conditions = ['promoter_id = $1'];
  const params: unknown[] = [promoterId];
  if (status) {
    conditions.push('status = $2');
    params.push(status);
  }
  const { rows } = await pool.query(
    `SELECT * FROM events WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC`,
    params,
  );
  return rows.map(rowToEvent);
}

export interface CreateEventInput {
  promoterId: string;
  title: string;
  description: string;
  category: string;
  eventType: string;
  startsAt: Date;
  endsAt: Date;
  address: string;
  city: string;
  country: string;
  lat?: number;
  lng?: number;
  capacity: number;
  coverImageUrl?: string;
  images?: string[];
  keywords?: string[];
}

export async function createEvent(input: CreateEventInput, client?: PoolClient): Promise<Event> {
  const db = client ?? pool;
  const { rows } = await db.query(
    `INSERT INTO events (
      promoter_id, title, description, category, event_type,
      starts_at, ends_at, address, city, country, lat, lng,
      capacity, cover_image_url, images, keywords, status
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'draft')
    RETURNING *`,
    [
      input.promoterId,
      input.title,
      input.description,
      input.category,
      input.eventType,
      input.startsAt,
      input.endsAt,
      input.address,
      input.city,
      input.country,
      input.lat ?? null,
      input.lng ?? null,
      input.capacity,
      input.coverImageUrl ?? null,
      input.images ?? [],
      input.keywords ?? [],
    ],
  );
  return rowToEvent(rows[0]);
}

export async function updateEvent(
  id: string,
  updates: Partial<CreateEventInput>,
  client?: PoolClient,
): Promise<Event | null> {
  const db = client ?? pool;
  const fields: string[] = [];
  const params: unknown[] = [];
  let p = 1;

  const mapping: Record<string, string> = {
    title: 'title',
    description: 'description',
    category: 'category',
    eventType: 'event_type',
    startsAt: 'starts_at',
    endsAt: 'ends_at',
    address: 'address',
    city: 'city',
    country: 'country',
    lat: 'lat',
    lng: 'lng',
    capacity: 'capacity',
    coverImageUrl: 'cover_image_url',
    images: 'images',
    keywords: 'keywords',
  };

  for (const [key, col] of Object.entries(mapping)) {
    if (key in updates) {
      fields.push(`${col} = $${p++}`);
      params.push((updates as Record<string, unknown>)[key]);
    }
  }

  if (fields.length === 0) return null;
  params.push(id);

  const { rows } = await db.query(
    `UPDATE events SET ${fields.join(', ')} WHERE id = $${p} RETURNING *`,
    params,
  );
  return rows[0] ? rowToEvent(rows[0]) : null;
}

export async function updateEventStatus(
  id: string,
  status: EventStatus,
  reviewedBy: string,
  adminNote?: string,
  client?: PoolClient,
): Promise<Event | null> {
  const db = client ?? pool;
  const { rows } = await db.query(
    `UPDATE events SET status = $1, reviewed_by = $2, reviewed_at = NOW(), admin_note = $3
     WHERE id = $4 RETURNING *`,
    [status, reviewedBy, adminNote ?? null, id],
  );
  return rows[0] ? rowToEvent(rows[0]) : null;
}

export async function submitEventForReview(id: string, client?: PoolClient): Promise<Event | null> {
  const db = client ?? pool;
  const { rows } = await db.query(
    `UPDATE events SET status = 'pending' WHERE id = $1 AND status = 'draft' RETURNING *`,
    [id],
  );
  return rows[0] ? rowToEvent(rows[0]) : null;
}
