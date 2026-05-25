import { PoolClient } from 'pg';
import { pool } from '@infrastructure/database/pool';
import { Ticket, TicketStatus } from '@domain/types';

function rowToTicket(row: Record<string, unknown>): Ticket {
  return {
    id: row.id as string,
    ticketTypeId: row.ticket_type_id as string,
    eventId: row.event_id as string,
    ownerId: row.owner_id as string | null,
    orderId: row.order_id as string | null,
    reference: row.reference as string,
    qrCode: row.qr_code as string,
    status: row.status as TicketStatus,
    seatNumber: row.seat_number as string | null,
    tableNumber: row.table_number as string | null,
    pricePaid: row.price_paid ? Number(row.price_paid) : null,
    soldAt: row.sold_at as Date | null,
    usedAt: row.used_at as Date | null,
    scannedBy: row.scanned_by as string | null,
    createdAt: row.created_at as Date,
    updatedAt: row.updated_at as Date,
  };
}

export async function createTickets(
  tickets: Array<{
    ticketTypeId: string;
    eventId: string;
    reference: string;
    qrCode: string;
    seatNumber?: string;
    tableNumber?: string;
  }>,
  client?: PoolClient,
): Promise<Ticket[]> {
  const db = client ?? pool;
  const result: Ticket[] = [];
  for (const t of tickets) {
    const { rows } = await db.query(
      `INSERT INTO tickets (ticket_type_id, event_id, reference, qr_code, seat_number, table_number, status)
       VALUES ($1,$2,$3,$4,$5,$6,'available') RETURNING *`,
      [t.ticketTypeId, t.eventId, t.reference, t.qrCode, t.seatNumber ?? null, t.tableNumber ?? null],
    );
    result.push(rowToTicket(rows[0]));
  }
  return result;
}

export async function findTicketByReference(
  reference: string,
  client?: PoolClient,
): Promise<Ticket | null> {
  const db = client ?? pool;
  const { rows } = await db.query('SELECT * FROM tickets WHERE reference = $1', [reference]);
  return rows[0] ? rowToTicket(rows[0]) : null;
}

export async function findTicketByQrCode(qrCode: string): Promise<Ticket | null> {
  const { rows } = await pool.query('SELECT * FROM tickets WHERE qr_code = $1', [qrCode]);
  return rows[0] ? rowToTicket(rows[0]) : null;
}

export async function findTicketById(id: string, client?: PoolClient): Promise<Ticket | null> {
  const db = client ?? pool;
  const { rows } = await db.query('SELECT * FROM tickets WHERE id = $1', [id]);
  return rows[0] ? rowToTicket(rows[0]) : null;
}

export async function findTicketsByOwner(
  ownerId: string,
  eventId?: string,
): Promise<Ticket[]> {
  const conditions = ['owner_id = $1'];
  const params: unknown[] = [ownerId];
  if (eventId) {
    conditions.push('event_id = $2');
    params.push(eventId);
  }
  const { rows } = await pool.query(
    `SELECT * FROM tickets WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC`,
    params,
  );
  return rows.map(rowToTicket);
}

export async function findAvailableTickets(
  ticketTypeId: string,
  quantity: number,
  client?: PoolClient,
): Promise<Ticket[]> {
  const db = client ?? pool;
  const { rows } = await db.query(
    `SELECT * FROM tickets WHERE ticket_type_id = $1 AND status = 'available' LIMIT $2 FOR UPDATE SKIP LOCKED`,
    [ticketTypeId, quantity],
  );
  return rows.map(rowToTicket);
}

export async function claimTickets(
  ticketIds: string[],
  ownerId: string,
  orderId: string,
  pricePaid: number,
  client?: PoolClient,
): Promise<Ticket[]> {
  const db = client ?? pool;
  const { rows } = await db.query(
    `UPDATE tickets SET status = 'sold', owner_id = $1, order_id = $2, price_paid = $3, sold_at = NOW()
     WHERE id = ANY($4::uuid[]) AND status = 'available'
     RETURNING *`,
    [ownerId, orderId, pricePaid, ticketIds],
  );
  return rows.map(rowToTicket);
}

export async function scanTicket(
  qrCode: string,
  scannedBy: string,
  client?: PoolClient,
): Promise<Ticket | null> {
  const db = client ?? pool;
  const { rows } = await db.query(
    `UPDATE tickets SET status = 'used', used_at = NOW(), scanned_by = $1
     WHERE qr_code = $2 AND status = 'sold'
     RETURNING *`,
    [scannedBy, qrCode],
  );
  return rows[0] ? rowToTicket(rows[0]) : null;
}

export async function transferTicket(
  ticketId: string,
  newOwnerId: string,
  client?: PoolClient,
): Promise<Ticket | null> {
  const db = client ?? pool;
  const { rows } = await db.query(
    `UPDATE tickets SET owner_id = $1, status = 'sold'
     WHERE id = $2 AND status = 'sold'
     RETURNING *`,
    [newOwnerId, ticketId],
  );
  return rows[0] ? rowToTicket(rows[0]) : null;
}

export async function updateTicketStatus(
  id: string,
  status: TicketStatus,
  client?: PoolClient,
): Promise<Ticket | null> {
  const db = client ?? pool;
  const { rows } = await db.query(
    'UPDATE tickets SET status = $1 WHERE id = $2 RETURNING *',
    [status, id],
  );
  return rows[0] ? rowToTicket(rows[0]) : null;
}
