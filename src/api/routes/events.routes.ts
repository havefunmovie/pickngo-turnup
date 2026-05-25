import { Router } from 'express';
import { z } from 'zod';
import {
  createNewEvent,
  editEvent,
  getEvent,
  listEvents,
  listPromoterEvents,
  reviewEvent,
  submitForReview,
} from '@domain/events/event.service';
import { EventStatus } from '@domain/types';
import { findTicketTypesByEvent } from '@domain/tickets/ticket-type.repository';
import { getEventStats } from '@domain/events/stats.service';
import { authenticate, requireRole } from '@api/middleware/auth';
import { followPromoter, unfollowPromoter } from '@domain/users/user.service';

const router = Router();

const createEventSchema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().min(10),
  category: z.string().min(1),
  eventType: z.string().min(1),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  address: z.string().min(5),
  city: z.string().min(1),
  country: z.string().min(1),
  lat: z.number().optional(),
  lng: z.number().optional(),
  capacity: z.number().int().positive(),
  coverImageUrl: z.string().url().optional(),
  images: z.array(z.string().url()).max(10).optional(),
  keywords: z.array(z.string()).max(20).optional(),
  ticketTypes: z
    .array(
      z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        seatType: z.enum(['general', 'seated', 'table', 'vip']).optional(),
        price: z.number().nonnegative(),
        quantity: z.number().int().positive(),
        maxPerOrder: z.number().int().positive().optional(),
        validFrom: z.string().datetime().optional(),
        validUntil: z.string().datetime().optional(),
        sortOrder: z.number().int().optional(),
      }),
    )
    .optional(),
});

const reviewSchema = z.object({
  decision: z.enum(['approved', 'rejected', 'suspended']),
  adminNote: z.string().optional(),
});

// Public: list approved events
router.get('/', async (req, res, next) => {
  try {
    const result = await listEvents({
      city: req.query.city as string,
      category: req.query.category as string,
      search: req.query.q as string,
      fromDate: req.query.from ? new Date(req.query.from as string) : undefined,
      toDate: req.query.to ? new Date(req.query.to as string) : undefined,
      cursor: req.query.cursor as string,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Public: get single event
router.get('/:id', async (req, res, next) => {
  try {
    const event = await getEvent(req.params.id);
    const ticketTypes = await findTicketTypesByEvent(req.params.id);
    res.json({ data: { ...event, ticketTypes } });
  } catch (err) {
    next(err);
  }
});

// Promoter: create event
router.post('/', authenticate, requireRole('promoter', 'admin'), async (req, res, next) => {
  try {
    const dto = createEventSchema.parse(req.body);
    const event = await createNewEvent(dto, req.auth!);
    res.status(201).json({ data: event });
  } catch (err) {
    next(err);
  }
});

// Promoter: edit event
router.patch('/:id', authenticate, requireRole('promoter', 'admin'), async (req, res, next) => {
  try {
    const dto = createEventSchema.partial().parse(req.body);
    const event = await editEvent(req.params.id, dto, req.auth!);
    res.json({ data: event });
  } catch (err) {
    next(err);
  }
});

// Promoter: submit for review
router.post('/:id/submit', authenticate, requireRole('promoter'), async (req, res, next) => {
  try {
    const event = await submitForReview(req.params.id, req.auth!);
    res.json({ data: event });
  } catch (err) {
    next(err);
  }
});

// Admin: review event
router.post('/:id/review', authenticate, requireRole('admin'), async (req, res, next) => {
  try {
    const { decision, adminNote } = reviewSchema.parse(req.body);
    const event = await reviewEvent(req.params.id, decision, req.auth!, adminNote);
    res.json({ data: event });
  } catch (err) {
    next(err);
  }
});

// Promoter: get event stats
router.get('/:id/stats', authenticate, requireRole('promoter', 'admin'), async (req, res, next) => {
  try {
    const stats = await getEventStats(req.params.id, req.auth!);
    res.json({ data: stats });
  } catch (err) {
    next(err);
  }
});

// Promoter: list my events
router.get('/me/events', authenticate, requireRole('promoter', 'admin'), async (req, res, next) => {
  try {
    const events = await listPromoterEvents(
      req.auth!.userId,
      req.query.status as EventStatus | undefined,
    );
    res.json({ data: events });
  } catch (err) {
    next(err);
  }
});

// Customer: follow promoter
router.post('/promoters/:promoterId/follow', authenticate, async (req, res, next) => {
  try {
    await followPromoter(req.params.promoterId, req.auth!);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// Customer: unfollow promoter
router.delete('/promoters/:promoterId/follow', authenticate, async (req, res, next) => {
  try {
    await unfollowPromoter(req.params.promoterId, req.auth!);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
