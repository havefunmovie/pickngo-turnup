import { Router } from 'express';
import { getStoreStats } from '@domain/events/stats.service';
import { authenticate, requireRole } from '@api/middleware/auth';

const router = Router();

// Store: my sales dashboard
router.get('/store/me', authenticate, requireRole('store', 'admin'), async (req, res, next) => {
  try {
    const stats = await getStoreStats(req.auth!);
    res.json({ data: stats });
  } catch (err) {
    next(err);
  }
});

export default router;
