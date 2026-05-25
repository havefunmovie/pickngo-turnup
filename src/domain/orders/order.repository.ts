import { PoolClient } from 'pg';
import { pool } from '@infrastructure/database/pool';
import { Order, OrderItem, OrderStatus, PaymentMethod } from '@domain/types';

function rowToOrder(row: Record<string, unknown>): Order {
  return {
    id: row.id as string,
    customerId: row.customer_id as string,
    eventId: row.event_id as string,
    storeId: row.store_id as string | null,
    reservationId: row.reservation_id as string | null,
    total: Number(row.total),
    commission: Number(row.commission),
    status: row.status as OrderStatus,
    paymentMethod: row.payment_method as PaymentMethod,
    paymentRef: row.payment_ref as string | null,
    createdAt: row.created_at as Date,
    updatedAt: row.updated_at as Date,
  };
}

export interface CreateOrderInput {
  customerId: string;
  eventId: string;
  storeId?: string;
  reservationId?: string;
  total: number;
  commission?: number;
  paymentMethod: PaymentMethod;
  paymentRef?: string;
}

export async function createOrder(input: CreateOrderInput, client?: PoolClient): Promise<Order> {
  const db = client ?? pool;
  const { rows } = await db.query(
    `INSERT INTO orders (customer_id, event_id, store_id, reservation_id, total, commission, payment_method, payment_ref, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending') RETURNING *`,
    [
      input.customerId,
      input.eventId,
      input.storeId ?? null,
      input.reservationId ?? null,
      input.total,
      input.commission ?? 0,
      input.paymentMethod,
      input.paymentRef ?? null,
    ],
  );
  return rowToOrder(rows[0]);
}

export async function createOrderItems(
  items: Array<{
    orderId: string;
    ticketId: string;
    ticketTypeId: string;
    quantity: number;
    unitPrice: number;
  }>,
  client?: PoolClient,
): Promise<OrderItem[]> {
  const db = client ?? pool;
  const result: OrderItem[] = [];
  for (const item of items) {
    const { rows } = await db.query(
      `INSERT INTO order_items (order_id, ticket_id, ticket_type_id, quantity, unit_price)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [item.orderId, item.ticketId, item.ticketTypeId, item.quantity, item.unitPrice],
    );
    result.push({
      id: rows[0].id as string,
      orderId: rows[0].order_id as string,
      ticketId: rows[0].ticket_id as string,
      ticketTypeId: rows[0].ticket_type_id as string,
      quantity: rows[0].quantity as number,
      unitPrice: Number(rows[0].unit_price),
      createdAt: rows[0].created_at as Date,
    });
  }
  return result;
}

export async function confirmOrder(id: string, client?: PoolClient): Promise<Order | null> {
  const db = client ?? pool;
  const { rows } = await db.query(
    `UPDATE orders SET status = 'confirmed' WHERE id = $1 AND status = 'pending' RETURNING *`,
    [id],
  );
  return rows[0] ? rowToOrder(rows[0]) : null;
}

export async function findOrderById(id: string): Promise<Order | null> {
  const { rows } = await pool.query('SELECT * FROM orders WHERE id = $1', [id]);
  return rows[0] ? rowToOrder(rows[0]) : null;
}

export async function findCustomerOrders(customerId: string): Promise<Order[]> {
  const { rows } = await pool.query(
    'SELECT * FROM orders WHERE customer_id = $1 ORDER BY created_at DESC',
    [customerId],
  );
  return rows.map(rowToOrder);
}

export async function findStoreOrders(storeId: string, eventId?: string): Promise<Order[]> {
  const conditions = ['store_id = $1', "status = 'confirmed'"];
  const params: unknown[] = [storeId];
  if (eventId) {
    conditions.push('event_id = $2');
    params.push(eventId);
  }
  const { rows } = await pool.query(
    `SELECT * FROM orders WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC`,
    params,
  );
  return rows.map(rowToOrder);
}
