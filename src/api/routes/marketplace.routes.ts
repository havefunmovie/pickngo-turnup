import { Router } from 'express';
import { z } from 'zod';
import {
  buyListing,
  cancelListing,
  getActiveListings,
  listTicket,
} from '@domain/marketplace/marketplace.service';
import { authenticate } from '@api/middleware/auth';

const router = Router();

const listingSchema = z.object({
  ticketId: z.string().uuid(),
  price: z.number().positive(),
  isExternal: z.boolean().optional(),
  expiresAt: z.string().datetime().optional(),
});

// Public: browse listings (optionally filtered by event)
router.get('/', async (req, res, next) => {
  try {
    const listings = await getActiveListings(req.query.eventId as string);
    res.json({ data: listings });
  } catch (err) {
    next(err);
  }
});

// Customer: list a ticket for sale
router.post('/', authenticate, async (req, res, next) => {
  try {
    const dto = listingSchema.parse(req.body);
    const listing = await listTicket(dto, req.auth!);
    res.status(201).json({ data: listing });
  } catch (err) {
    next(err);
  }
});

// Customer: buy a listed ticket
router.post('/:id/buy', authenticate, async (req, res, next) => {
  try {
    const listing = await buyListing(req.params.id, req.auth!);
    res.json({ data: listing });
  } catch (err) {
    next(err);
  }
});

// Customer: cancel a listing
router.delete('/:id', authenticate, async (req, res, next) => {
  try {
    await cancelListing(req.params.id, req.auth!);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
