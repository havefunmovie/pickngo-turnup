import { Router } from 'express';
import { z } from 'zod';
import {
  addPointOfSale,
  getEventPointsOfSale,
  getStoreEvents,
  removePointOfSale,
} from '@domain/venues/venue.service';
import { authenticate, requireRole } from '@api/middleware/auth';

const router = Router();

const posSchema = z.object({
  eventId: z.string().uuid(),
  storeId: z.string().uuid(),
  quota: z.number().int().positive().optional(),
  commissionType: z.enum(['fixed', 'percentage']).optional(),
  commissionValue: z.number().nonnegative().optional(),
});

// Promoter: add point of sale to event
router.post('/', authenticate, requireRole('promoter', 'admin'), async (req, res, next) => {
  try {
    const dto = posSchema.parse(req.body);
    const pos = await addPointOfSale(dto, req.auth!);
    res.status(201).json({ data: pos });
  } catch (err) {
    next(err);
  }
});

// Promoter: list event POS
router.get('/event/:eventId', authenticate, requireRole('promoter', 'admin'), async (req, res, next) => {
  try {
    const pos = await getEventPointsOfSale(req.params.eventId, req.auth!);
    res.json({ data: pos });
  } catch (err) {
    next(err);
  }
});

// Store: list my events
router.get('/store/me', authenticate, requireRole('store', 'admin'), async (req, res, next) => {
  try {
    const events = await getStoreEvents(req.auth!);
    res.json({ data: events });
  } catch (err) {
    next(err);
  }
});

// Promoter: remove point of sale
router.delete('/:id', authenticate, requireRole('promoter', 'admin'), async (req, res, next) => {
  try {
    await removePointOfSale(req.params.id, req.auth!);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
