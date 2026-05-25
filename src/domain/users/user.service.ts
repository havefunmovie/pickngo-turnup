import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { pool } from '@infrastructure/database/pool';
import { env } from '@config/env';
import { User, UserRole, AuthContext } from '@domain/types';
import { ConflictError, NotFoundError, UnauthorizedError } from '@domain/errors';

const BCRYPT_ROUNDS = 12;

function rowToUser(row: Record<string, unknown>): User {
  return {
    id: row.id as string,
    email: row.email as string,
    phone: row.phone as string | null,
    name: row.name as string,
    role: row.role as UserRole,
    city: row.city as string | null,
    country: row.country as string | null,
    avatarUrl: row.avatar_url as string | null,
    isActive: row.is_active as boolean,
    createdAt: row.created_at as Date,
    updatedAt: row.updated_at as Date,
  };
}

export interface RegisterDto {
  email: string;
  password: string;
  name: string;
  phone?: string;
  city?: string;
  country?: string;
  role?: UserRole;
}

export interface LoginDto {
  email: string;
  password: string;
}

export async function register(dto: RegisterDto): Promise<{ user: User; accessToken: string }> {
  const { rows: existing } = await pool.query('SELECT id FROM users WHERE email = $1', [dto.email]);
  if (existing.length > 0) throw new ConflictError('Email already registered');

  const allowedRoles: UserRole[] = ['customer', 'promoter', 'store'];
  const role: UserRole = dto.role && allowedRoles.includes(dto.role) ? dto.role : 'customer';

  const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

  const { rows } = await pool.query(
    `INSERT INTO users (email, phone, name, role, city, country, is_active)
     VALUES ($1,$2,$3,$4,$5,$6,true) RETURNING *`,
    [dto.email, dto.phone ?? null, dto.name, role, dto.city ?? null, dto.country ?? null],
  );

  await pool.query(
    'INSERT INTO user_credentials (user_id, password_hash) VALUES ($1,$2)',
    [rows[0].id, passwordHash],
  ).catch(() => {
    pool.query(
      `CREATE TABLE IF NOT EXISTS user_credentials (
        user_id UUID PRIMARY KEY REFERENCES users(id),
        password_hash TEXT NOT NULL
      )`
    ).then(() =>
      pool.query('INSERT INTO user_credentials (user_id, password_hash) VALUES ($1,$2)', [rows[0].id, passwordHash])
    );
  });

  const user = rowToUser(rows[0]);
  const accessToken = signAccessToken(user);
  return { user, accessToken };
}

export async function login(dto: LoginDto): Promise<{ user: User; accessToken: string }> {
  const { rows } = await pool.query(
    `SELECT u.*, uc.password_hash FROM users u
     JOIN user_credentials uc ON uc.user_id = u.id
     WHERE u.email = $1`,
    [dto.email],
  );
  if (!rows[0]) throw new UnauthorizedError('Invalid credentials');

  const valid = await bcrypt.compare(dto.password, rows[0].password_hash as string);
  if (!valid) throw new UnauthorizedError('Invalid credentials');

  const user = rowToUser(rows[0]);
  if (!user.isActive) throw new UnauthorizedError('Account is deactivated');

  const accessToken = signAccessToken(user);
  return { user, accessToken };
}

export function signAccessToken(user: User): string {
  return jwt.sign(
    { sub: user.id, role: user.role },
    env.JWT_SECRET,
    { expiresIn: env.JWT_ACCESS_EXPIRES_IN as string },
  );
}

export function verifyAccessToken(token: string): AuthContext {
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as { sub: string; role: UserRole };
    return { userId: payload.sub, role: payload.role };
  } catch {
    throw new UnauthorizedError('Invalid or expired token');
  }
}

export async function getUser(id: string): Promise<User> {
  const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
  if (!rows[0]) throw new NotFoundError('User');
  return rowToUser(rows[0]);
}

export async function followPromoter(promoterId: string, auth: AuthContext): Promise<void> {
  await pool.query(
    `INSERT INTO event_followers (customer_id, promoter_id)
     VALUES ($1,$2) ON CONFLICT DO NOTHING`,
    [auth.userId, promoterId],
  );
}

export async function unfollowPromoter(promoterId: string, auth: AuthContext): Promise<void> {
  await pool.query(
    'DELETE FROM event_followers WHERE customer_id = $1 AND promoter_id = $2',
    [auth.userId, promoterId],
  );
}

export async function getFollowedPromoters(auth: AuthContext): Promise<string[]> {
  const { rows } = await pool.query(
    'SELECT promoter_id FROM event_followers WHERE customer_id = $1',
    [auth.userId],
  );
  return rows.map((r: Record<string, unknown>) => r.promoter_id as string);
}
