import { pool } from '@infrastructure/database/pool';
import { withTransaction } from '@infrastructure/database/pool';
import { findTicketById, transferTicket } from '@domain/tickets/ticket.repository';
import { MarketplaceListing, AuthContext, ListingStatus } from '@domain/types';
import { ForbiddenError, NotFoundError, BusinessError } from '@domain/errors';

function rowToListing(row: Record<string, unknown>): MarketplaceListing {
  return {
    id: row.id as string,
    ticketId: row.ticket_id as string,
    sellerId: row.seller_id as string,
    buyerId: row.buyer_id as string | null,
    price: Number(row.price),
    isExternal: row.is_external as boolean,
    status: row.status as ListingStatus,
    expiresAt: row.expires_at as Date | null,
    soldAt: row.sold_at as Date | null,
    createdAt: row.created_at as Date,
    updatedAt: row.updated_at as Date,
  };
}

export interface CreateListingDto {
  ticketId: string;
  price: number;
  isExternal?: boolean;
  expiresAt?: string;
}

export async function listTicket(dto: CreateListingDto, auth: AuthContext): Promise<MarketplaceListing> {
  const ticket = await findTicketById(dto.ticketId);
  if (!ticket) throw new NotFoundError('Ticket');
  if (ticket.ownerId !== auth.userId) throw new ForbiddenError('Not your ticket');
  if (ticket.status !== 'sold') {
    throw new BusinessError('TICKET_NOT_LISTABLE', 'Only purchased tickets can be listed');
  }

  const { rows: existing } = await pool.query(
    `SELECT id FROM marketplace_listings WHERE ticket_id = $1 AND status = 'active'`,
    [dto.ticketId],
  );
  if (existing.length > 0) {
    throw new BusinessError('ALREADY_LISTED', 'Ticket is already listed');
  }

  const { rows } = await pool.query(
    `INSERT INTO marketplace_listings (ticket_id, seller_id, price, is_external, expires_at)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [
      dto.ticketId,
      auth.userId,
      dto.price,
      dto.isExternal ?? false,
      dto.expiresAt ? new Date(dto.expiresAt) : null,
    ],
  );
  return rowToListing(rows[0]);
}

export async function getActiveListings(eventId?: string): Promise<MarketplaceListing[]> {
  if (eventId) {
    const { rows } = await pool.query(
      `SELECT ml.* FROM marketplace_listings ml
       JOIN tickets t ON t.id = ml.ticket_id
       WHERE ml.status = 'active' AND t.event_id = $1
       ORDER BY ml.created_at DESC`,
      [eventId],
    );
    return rows.map(rowToListing);
  }
  const { rows } = await pool.query(
    `SELECT * FROM marketplace_listings WHERE status = 'active' ORDER BY created_at DESC LIMIT 100`,
  );
  return rows.map(rowToListing);
}

export async function buyListing(listingId: string, auth: AuthContext): Promise<MarketplaceListing> {
  return withTransaction(async (client: import('pg').PoolClient) => {
    const { rows } = await client.query(
      `SELECT * FROM marketplace_listings WHERE id = $1 AND status = 'active' FOR UPDATE`,
      [listingId],
    );
    if (!rows[0]) throw new NotFoundError('Listing');
    const listing = rowToListing(rows[0]);

    if (listing.sellerId === auth.userId) {
      throw new BusinessError('CANNOT_BUY_OWN', 'Cannot buy your own listing');
    }

    if (listing.isExternal) {
      throw new BusinessError('EXTERNAL_LISTING', 'External tickets require manual validation');
    }

    await transferTicket(listing.ticketId, auth.userId, client);

    const { rows: updated } = await client.query(
      `UPDATE marketplace_listings SET status = 'sold', buyer_id = $1, sold_at = NOW()
       WHERE id = $2 RETURNING *`,
      [auth.userId, listingId],
    );
    return rowToListing(updated[0]);
  });
}

export async function cancelListing(listingId: string, auth: AuthContext): Promise<void> {
  const { rows } = await pool.query(
    `SELECT * FROM marketplace_listings WHERE id = $1 AND status = 'active'`,
    [listingId],
  );
  if (!rows[0]) throw new NotFoundError('Listing');
  const listing = rowToListing(rows[0]);
  if (listing.sellerId !== auth.userId && auth.role !== 'admin') throw new ForbiddenError();

  await pool.query(
    `UPDATE marketplace_listings SET status = 'cancelled' WHERE id = $1`,
    [listingId],
  );
}
