import { PoolClient } from 'pg';
import { pool } from '@infrastructure/database/pool';
import { TicketType, TicketSeatType, TicketPricePeriod } from '@domain/types';

function rowToTicketType(row: Record<string, unknown>): TicketType {
  return {
    id: row.id as string,
    eventId: row.event_id as string,
    name: row.name as string,
    description: row.description as string | null,
    seatType: row.seat_type as TicketSeatType,
    price: Number(row.price),
    quantity: row.quantity as number,
    available: row.available as number,
    maxPerOrder: row.max_per_order as number,
    validFrom: row.valid_from as Date | null,
    validUntil: row.valid_until as Date | null,
    sortOrder: row.sort_order as number,
    createdAt: row.created_at as Date,
    updatedAt: row.updated_at as Date,
  };
}

export interface CreateTicketTypeInput {
  eventId: string;
  name: string;
  description?: string;
  seatType?: TicketSeatType;
  price: number;
  quantity: number;
  maxPerOrder?: number;
  validFrom?: Date;
  validUntil?: Date;
  sortOrder?: number;
}

export async function createTicketTypes(
  inputs: CreateTicketTypeInput[],
  client?: PoolClient,
): Promise<TicketType[]> {
  const db = client ?? pool;
  const result: TicketType[] = [];
  for (const input of inputs) {
    const { rows } = await db.query(
      `INSERT INTO ticket_types (event_id, name, description, seat_type, price, quantity, available, max_per_order, valid_from, valid_until, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$6,$7,$8,$9,$10) RETURNING *`,
      [
        input.eventId,
        input.name,
        input.description ?? null,
        input.seatType ?? 'general',
        input.price,
        input.quantity,
        input.maxPerOrder ?? 10,
        input.validFrom ?? null,
        input.validUntil ?? null,
        input.sortOrder ?? 0,
      ],
    );
    result.push(rowToTicketType(rows[0]));
  }
  return result;
}

export async function findTicketTypesByEvent(
  eventId: string,
  client?: PoolClient,
): Promise<TicketType[]> {
  const db = client ?? pool;
  const { rows } = await db.query(
    'SELECT * FROM ticket_types WHERE event_id = $1 ORDER BY sort_order ASC',
    [eventId],
  );
  return rows.map(rowToTicketType);
}

export async function findTicketTypeById(
  id: string,
  client?: PoolClient,
): Promise<TicketType | null> {
  const db = client ?? pool;
  const { rows } = await db.query('SELECT * FROM ticket_types WHERE id = $1', [id]);
  return rows[0] ? rowToTicketType(rows[0]) : null;
}

export async function decrementAvailable(
  id: string,
  quantity: number,
  client?: PoolClient,
): Promise<TicketType | null> {
  const db = client ?? pool;
  const { rows } = await db.query(
    `UPDATE ticket_types SET available = available - $1
     WHERE id = $2 AND available >= $1
     RETURNING *`,
    [quantity, id],
  );
  return rows[0] ? rowToTicketType(rows[0]) : null;
}

export async function incrementAvailable(
  id: string,
  quantity: number,
  client?: PoolClient,
): Promise<void> {
  const db = client ?? pool;
  await db.query(
    'UPDATE ticket_types SET available = available + $1 WHERE id = $2',
    [quantity, id],
  );
}

export async function getActivePriceForTicketType(
  ticketTypeId: string,
): Promise<TicketPricePeriod | null> {
  const { rows } = await pool.query(
    `SELECT * FROM ticket_price_periods
     WHERE ticket_type_id = $1 AND starts_at <= NOW() AND ends_at >= NOW()
     ORDER BY starts_at DESC LIMIT 1`,
    [ticketTypeId],
  );
  if (!rows[0]) return null;
  return {
    id: rows[0].id as string,
    ticketTypeId: rows[0].ticket_type_id as string,
    price: Number(rows[0].price),
    startsAt: rows[0].starts_at as Date,
    endsAt: rows[0].ends_at as Date,
    label: rows[0].label as string | null,
    createdAt: rows[0].created_at as Date,
  };
}
