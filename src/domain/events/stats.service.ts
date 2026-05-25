import { pool } from '@infrastructure/database/pool';
import { findEventById } from './event.repository';
import { AuthContext } from '@domain/types';
import { ForbiddenError, NotFoundError } from '@domain/errors';

export interface EventStats {
  eventId: string;
  totalTickets: number;
  soldTickets: number;
  usedTickets: number;
  availableTickets: number;
  revenue: number;
  commission: number;
  profit: number;
  byTicketType: Array<{
    ticketTypeId: string;
    name: string;
    total: number;
    sold: number;
    available: number;
    revenue: number;
  }>;
  byPointOfSale: Array<{
    storeId: string;
    storeName: string;
    sold: number;
    revenue: number;
    commission: number;
  }>;
}

export async function getEventStats(eventId: string, auth: AuthContext): Promise<EventStats> {
  const event = await findEventById(eventId);
  if (!event) throw new NotFoundError('Event');
  if (event.promoterId !== auth.userId && auth.role !== 'admin') throw new ForbiddenError();

  const [summary, byType, byStore] = await Promise.all([
    pool.query(
      `SELECT
        COUNT(*) FILTER (WHERE status = 'sold' OR status = 'used') AS sold,
        COUNT(*) FILTER (WHERE status = 'used') AS used_count,
        COUNT(*) FILTER (WHERE status = 'available') AS available,
        COALESCE(SUM(price_paid) FILTER (WHERE status = 'sold' OR status = 'used'), 0) AS revenue
       FROM tickets WHERE event_id = $1`,
      [eventId],
    ),
    pool.query(
      `SELECT
        tt.id AS ticket_type_id,
        tt.name,
        tt.quantity AS total,
        COUNT(t.id) FILTER (WHERE t.status = 'sold' OR t.status = 'used') AS sold,
        tt.available,
        COALESCE(SUM(t.price_paid) FILTER (WHERE t.status = 'sold' OR t.status = 'used'), 0) AS revenue
       FROM ticket_types tt
       LEFT JOIN tickets t ON t.ticket_type_id = tt.id
       WHERE tt.event_id = $1
       GROUP BY tt.id`,
      [eventId],
    ),
    pool.query(
      `SELECT
        o.store_id,
        u.name AS store_name,
        COUNT(DISTINCT oi.ticket_id) AS sold,
        COALESCE(SUM(o.total), 0) AS revenue,
        COALESCE(SUM(o.commission), 0) AS commission
       FROM orders o
       JOIN users u ON u.id = o.store_id
       JOIN order_items oi ON oi.order_id = o.id
       WHERE o.event_id = $1 AND o.store_id IS NOT NULL AND o.status = 'confirmed'
       GROUP BY o.store_id, u.name`,
      [eventId],
    ),
  ]);

  const s = summary.rows[0];
  const revenue = Number(s.revenue);
  const commission = byStore.rows.reduce((acc, r) => acc + Number(r.commission), 0);

  return {
    eventId,
    totalTickets: byType.rows.reduce((acc, r) => acc + Number(r.total), 0),
    soldTickets: Number(s.sold),
    usedTickets: Number(s.used_count),
    availableTickets: Number(s.available),
    revenue,
    commission,
    profit: revenue - commission,
    byTicketType: byType.rows.map((r: Record<string, unknown>) => ({
      ticketTypeId: r.ticket_type_id as string,
      name: r.name as string,
      total: Number(r.total),
      sold: Number(r.sold),
      available: Number(r.available),
      revenue: Number(r.revenue),
    })),
    byPointOfSale: byStore.rows.map((r: Record<string, unknown>) => ({
      storeId: r.store_id as string,
      storeName: r.store_name as string,
      sold: Number(r.sold),
      revenue: Number(r.revenue),
      commission: Number(r.commission),
    })),
  };
}

export interface StoreStats {
  storeId: string;
  totalOrders: number;
  totalRevenue: number;
  totalCommission: number;
  byEvent: Array<{
    eventId: string;
    eventTitle: string;
    orders: number;
    revenue: number;
    commission: number;
  }>;
}

export async function getStoreStats(auth: AuthContext): Promise<StoreStats> {
  if (auth.role !== 'store' && auth.role !== 'admin') throw new ForbiddenError();

  const { rows } = await pool.query(
    `SELECT
      o.event_id,
      e.title AS event_title,
      COUNT(DISTINCT o.id) AS orders,
      COALESCE(SUM(o.total), 0) AS revenue,
      COALESCE(SUM(o.commission), 0) AS commission
     FROM orders o
     JOIN events e ON e.id = o.event_id
     WHERE o.store_id = $1 AND o.status = 'confirmed'
     GROUP BY o.event_id, e.title
     ORDER BY revenue DESC`,
    [auth.userId],
  );

  type StoreRow = Record<string, unknown>;
  const totalRevenue = rows.reduce((acc: number, r: StoreRow) => acc + Number(r.revenue), 0);
  const totalCommission = rows.reduce((acc: number, r: StoreRow) => acc + Number(r.commission), 0);

  return {
    storeId: auth.userId,
    totalOrders: rows.reduce((acc: number, r: StoreRow) => acc + Number(r.orders), 0),
    totalRevenue,
    totalCommission,
    byEvent: rows.map((r: StoreRow) => ({
      eventId: r.event_id as string,
      eventTitle: r.event_title as string,
      orders: Number(r.orders),
      revenue: Number(r.revenue),
      commission: Number(r.commission),
    })),
  };
}
