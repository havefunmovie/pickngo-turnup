import { Router } from 'express';
import { z } from 'zod';
import { register, login, getUser } from '@domain/users/user.service';
import { authenticate } from '@api/middleware/auth';

const router = Router();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(2).max(100),
  phone: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  role: z.enum(['customer', 'promoter', 'store']).optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post('/register', async (req, res, next) => {
  try {
    const dto = registerSchema.parse(req.body);
    const result = await register(dto);
    res.status(201).json({ data: result });
  } catch (err) {
    next(err);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const dto = loginSchema.parse(req.body);
    const result = await login(dto);
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
});

router.get('/me', authenticate, async (req, res, next) => {
  try {
    const user = await getUser(req.auth!.userId);
    res.json({ data: user });
  } catch (err) {
    next(err);
  }
});

export default router;
