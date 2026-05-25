import { v4 as uuidv4 } from 'uuid';
import QRCode from 'qrcode';
import { withTransaction } from '@infrastructure/database/pool';
import {
  claimTickets,
  createTickets,
  findAvailableTickets,
  findTicketById,
  findTicketByQrCode,
  findTicketsByOwner,
  scanTicket,
  transferTicket,
} from './ticket.repository';
import {
  decrementAvailable,
  findTicketTypeById,
  getActivePriceForTicketType,
} from './ticket-type.repository';
import { findEventById } from '@domain/events/event.repository';
import { createOrder, createOrderItems, confirmOrder } from '@domain/orders/order.repository';
import { findPosByStore } from '@domain/venues/venue.repository';
import { Ticket, AuthContext } from '@domain/types';
import {
  NotFoundError,
  ForbiddenError,
  BusinessError,
} from '@domain/errors';

const TICKET_REFERENCE_PREFIX = 'TU';

function generateReference(): string {
  return `${TICKET_REFERENCE_PREFIX}-${uuidv4().replace(/-/g, '').substring(0, 12).toUpperCase()}`;
}

async function generateQrCode(ticketId: string, reference: string): Promise<string> {
  const payload = JSON.stringify({ id: ticketId, ref: reference, ts: Date.now() });
  return QRCode.toDataURL(payload);
}

export interface BuyTicketsDto {
  ticketTypeId: string;
  quantity: number;
  paymentMethod: 'card' | 'cash' | 'mobile_money' | 'wallet';
  storeId?: string;
}

export async function buyTickets(
  dto: BuyTicketsDto,
  auth: AuthContext,
): Promise<{ tickets: Ticket[]; total: number }> {
  return withTransaction(async (client: import('pg').PoolClient) => {
    const ticketType = await findTicketTypeById(dto.ticketTypeId, client);
    if (!ticketType) throw new NotFoundError('Ticket type');

    if (dto.quantity > ticketType.maxPerOrder) {
      throw new BusinessError(
        'QUANTITY_EXCEEDED',
        `Maximum ${ticketType.maxPerOrder} tickets per order`,
      );
    }

    const event = await findEventById(ticketType.eventId, client);
    if (!event) throw new NotFoundError('Event');
    if (event.status !== 'approved') {
      throw new BusinessError('EVENT_NOT_AVAILABLE', 'Event is not available for purchase');
    }

    const activePeriod = await getActivePriceForTicketType(dto.ticketTypeId);
    const unitPrice = activePeriod ? activePeriod.price : ticketType.price;

    const updated = await decrementAvailable(dto.ticketTypeId, dto.quantity, client);
    if (!updated) {
      throw new BusinessError('NOT_ENOUGH_TICKETS', 'Not enough tickets available');
    }

    const total = unitPrice * dto.quantity;

    // Calcul commission store si applicable
    let commission = 0;
    if (dto.storeId) {
      const { rows } = await client.query(
        `SELECT commission_type, commission_value FROM points_of_sale
         WHERE store_id = $1 AND event_id = $2 AND is_active = true`,
        [dto.storeId, ticketType.eventId],
      );
      if (rows[0]) {
        commission = rows[0].commission_type === 'percentage'
          ? total * (Number(rows[0].commission_value) / 100)
          : Number(rows[0].commission_value) * dto.quantity;
      }
    }

    const order = await createOrder({
      customerId: auth.userId,
      eventId: ticketType.eventId,
      storeId: dto.storeId,
      total,
      commission,
      paymentMethod: dto.paymentMethod,
    }, client);

    await confirmOrder(order.id, client);

    // Génère les tickets à la volée au moment de l'achat
    const newTickets = await createTickets(
      Array.from({ length: dto.quantity }, () => ({
        ticketTypeId: dto.ticketTypeId,
        eventId: ticketType.eventId,
        reference: generateReference(),
        qrCode: uuidv4(),
      })),
      client,
    );

    const claimed = await claimTickets(
      newTickets.map((t) => t.id),
      auth.userId,
      order.id,
      unitPrice,
      client,
    );

    await createOrderItems(
      claimed.map((t) => ({
        orderId: order.id,
        ticketId: t.id,
        ticketTypeId: dto.ticketTypeId,
        quantity: 1,
        unitPrice,
      })),
      client,
    );

    return { tickets: claimed, total };
  });
}

export async function getMyTickets(auth: AuthContext, eventId?: string): Promise<Ticket[]> {
  return findTicketsByOwner(auth.userId, eventId);
}

export async function scanQrTicket(qrCode: string, auth: AuthContext): Promise<Ticket> {
  if (auth.role !== 'promoter' && auth.role !== 'store' && auth.role !== 'admin') {
    throw new ForbiddenError('Only event staff can scan tickets');
  }

  const ticket = await findTicketByQrCode(qrCode);
  if (!ticket) throw new NotFoundError('Ticket');

  if (ticket.status === 'used') {
    throw new BusinessError('TICKET_ALREADY_USED', 'This ticket has already been scanned');
  }
  if (ticket.status !== 'sold') {
    throw new BusinessError('TICKET_INVALID', 'Ticket is not valid for entry');
  }

  const scanned = await scanTicket(qrCode, auth.userId);
  if (!scanned) throw new BusinessError('SCAN_FAILED', 'Failed to scan ticket');
  return scanned;
}

export async function transferTicketToUser(
  ticketId: string,
  recipientEmail: string,
  auth: AuthContext,
): Promise<Ticket> {
  const ticket = await findTicketById(ticketId);
  if (!ticket) throw new NotFoundError('Ticket');
  if (ticket.ownerId !== auth.userId) throw new ForbiddenError('Not your ticket');
  if (ticket.status !== 'sold') {
    throw new BusinessError('TICKET_NOT_TRANSFERABLE', 'Ticket cannot be transferred');
  }

  const { pool } = await import('@infrastructure/database/pool');
  const { rows } = await pool.query('SELECT id FROM users WHERE email = $1', [recipientEmail]);
  if (!rows[0]) throw new NotFoundError('Recipient user');

  return withTransaction(async (client: import('pg').PoolClient) => {
    const transferred = await transferTicket(ticketId, rows[0].id as string, client);
    if (!transferred) throw new BusinessError('TRANSFER_FAILED', 'Transfer failed');
    return transferred;
  });
}

export async function getTicketWithQr(
  ticketId: string,
  auth: AuthContext,
): Promise<{ ticket: Ticket; qrDataUrl: string }> {
  const ticket = await findTicketById(ticketId);
  if (!ticket) throw new NotFoundError('Ticket');
  if (ticket.ownerId !== auth.userId && auth.role !== 'admin') {
    throw new ForbiddenError();
  }

  const qrDataUrl = await generateQrCode(ticket.id, ticket.reference);
  return { ticket, qrDataUrl };
}

export async function generateTicketsForType(
  ticketTypeId: string,
  auth: AuthContext,
): Promise<Ticket[]> {
  const ticketType = await findTicketTypeById(ticketTypeId);
  if (!ticketType) throw new NotFoundError('Ticket type');

  const event = await findEventById(ticketType.eventId);
  if (!event) throw new NotFoundError('Event');
  if (event.promoterId !== auth.userId && auth.role !== 'admin') throw new ForbiddenError();

  return withTransaction(async (client: import('pg').PoolClient) => {
    const toCreate = Array.from({ length: ticketType.quantity }, () => ({
      ticketTypeId,
      eventId: ticketType.eventId,
      reference: generateReference(),
      qrCode: uuidv4(),
    }));
    return createTickets(toCreate, client);
  });
}
