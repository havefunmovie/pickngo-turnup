import { Router } from 'express';
import { z } from 'zod';
import {
  buyTickets,
  getMyTickets,
  getTicketWithQr,
  scanQrTicket,
  transferTicketToUser,
} from '@domain/tickets/ticket.service';
import { authenticate } from '@api/middleware/auth';

const router = Router();

const buySchema = z.object({
  ticketTypeId: z.string().uuid(),
  quantity: z.number().int().positive().max(20),
  paymentMethod: z.enum(['card', 'cash', 'mobile_money', 'wallet']),
  storeId: z.string().uuid().optional(),
});

const transferSchema = z.object({
  recipientEmail: z.string().email(),
});

const scanSchema = z.object({
  qrCode: z.string().min(1),
});

// Customer: buy tickets
router.post('/buy', authenticate, async (req, res, next) => {
  try {
    const dto = buySchema.parse(req.body);
    const result = await buyTickets(dto, req.auth!);
    res.status(201).json({ data: result });
  } catch (err) {
    next(err);
  }
});

// Customer: my tickets
router.get('/me', authenticate, async (req, res, next) => {
  try {
    const tickets = await getMyTickets(req.auth!, req.query.eventId as string);
    res.json({ data: tickets });
  } catch (err) {
    next(err);
  }
});

// Customer: get ticket with QR code
router.get('/:id/qr', authenticate, async (req, res, next) => {
  try {
    const result = await getTicketWithQr(req.params.id, req.auth!);
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
});

// Customer: transfer ticket
router.post('/:id/transfer', authenticate, async (req, res, next) => {
  try {
    const { recipientEmail } = transferSchema.parse(req.body);
    const ticket = await transferTicketToUser(req.params.id, recipientEmail, req.auth!);
    res.json({ data: ticket });
  } catch (err) {
    next(err);
  }
});

// Staff: scan QR code at entrance
router.post('/scan', authenticate, async (req, res, next) => {
  try {
    const { qrCode } = scanSchema.parse(req.body);
    const ticket = await scanQrTicket(qrCode, req.auth!);
    res.json({ data: ticket });
  } catch (err) {
    next(err);
  }
});

export default router;
