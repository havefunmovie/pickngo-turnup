import { Router } from 'express';
import { z } from 'zod';
import {
  createCampaign,
  estimateCampaign,
  getCampaign,
  launchCampaign,
  listMyCampaigns,
} from '@domain/campaigns/campaign.service';
import { authenticate, requireRole } from '@api/middleware/auth';

const router = Router();

const campaignSchema = z.object({
  eventId: z.string().uuid().optional(),
  type: z.enum(['email', 'sms', 'both']),
  subject: z.string().max(200).optional(),
  body: z.string().min(10),
  targetCities: z.array(z.string()).optional(),
  targetCategories: z.array(z.string()).optional(),
  usePickngoBase: z.boolean().optional(),
  useStoreBase: z.boolean().optional(),
  scheduledAt: z.string().datetime().optional(),
});

// Estimate cost before creating
router.post('/estimate', authenticate, requireRole('promoter', 'store', 'admin'), async (req, res, next) => {
  try {
    const dto = campaignSchema.parse(req.body);
    const estimate = await estimateCampaign(dto, req.auth!);
    res.json({ data: estimate });
  } catch (err) {
    next(err);
  }
});

router.post('/', authenticate, requireRole('promoter', 'store', 'admin'), async (req, res, next) => {
  try {
    const dto = campaignSchema.parse(req.body);
    const campaign = await createCampaign(dto, req.auth!);
    res.status(201).json({ data: campaign });
  } catch (err) {
    next(err);
  }
});

router.get('/me', authenticate, async (req, res, next) => {
  try {
    const campaigns = await listMyCampaigns(req.auth!);
    res.json({ data: campaigns });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const campaign = await getCampaign(req.params.id, req.auth!);
    res.json({ data: campaign });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/launch', authenticate, async (req, res, next) => {
  try {
    const campaign = await launchCampaign(req.params.id, req.auth!);
    res.json({ data: campaign });
  } catch (err) {
    next(err);
  }
});

export default router;
