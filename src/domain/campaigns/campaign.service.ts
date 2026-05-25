import { pool } from '@infrastructure/database/pool';
import { Campaign, AuthContext, CampaignType } from '@domain/types';
import { ForbiddenError, NotFoundError, BusinessError } from '@domain/errors';

const CAMPAIGN_PRICE_PER_1000 = 5;

function rowToCampaign(row: Record<string, unknown>): Campaign {
  return {
    id: row.id as string,
    ownerId: row.owner_id as string,
    eventId: row.event_id as string | null,
    type: row.type as CampaignType,
    subject: row.subject as string | null,
    body: row.body as string,
    targetCities: row.target_cities as string[],
    targetCategories: row.target_categories as string[],
    usePickngoBase: row.use_pickngo_base as boolean,
    useStoreBase: row.use_store_base as boolean,
    targetCount: row.target_count as number,
    price: Number(row.price),
    status: row.status as Campaign['status'],
    scheduledAt: row.scheduled_at as Date | null,
    sentAt: row.sent_at as Date | null,
    createdAt: row.created_at as Date,
    updatedAt: row.updated_at as Date,
  };
}

export interface CreateCampaignDto {
  eventId?: string;
  type: CampaignType;
  subject?: string;
  body: string;
  targetCities?: string[];
  targetCategories?: string[];
  usePickngoBase?: boolean;
  useStoreBase?: boolean;
  scheduledAt?: string;
}

async function estimateTargetCount(dto: CreateCampaignDto, _ownerId: string): Promise<number> {
  const conditions: string[] = ['is_active = true'];
  const params: unknown[] = [];
  let p = 1;

  if (dto.targetCities && dto.targetCities.length > 0) {
    conditions.push(`city = ANY($${p++}::text[])`);
    params.push(dto.targetCities);
  }

  const { rows } = await pool.query(
    `SELECT COUNT(*) FROM users WHERE ${conditions.join(' AND ')}`,
    params,
  );
  return parseInt(rows[0].count as string, 10);
}

export async function estimateCampaign(
  dto: CreateCampaignDto,
  auth: AuthContext,
): Promise<{ targetCount: number; price: number }> {
  if (auth.role !== 'promoter' && auth.role !== 'store' && auth.role !== 'admin') {
    throw new ForbiddenError();
  }
  const targetCount = await estimateTargetCount(dto, auth.userId);
  const price = Math.ceil(targetCount / 1000) * CAMPAIGN_PRICE_PER_1000;
  return { targetCount, price };
}

export async function createCampaign(
  dto: CreateCampaignDto,
  auth: AuthContext,
): Promise<Campaign> {
  if (auth.role !== 'promoter' && auth.role !== 'store' && auth.role !== 'admin') {
    throw new ForbiddenError();
  }

  const { targetCount, price } = await estimateCampaign(dto, auth);

  const { rows } = await pool.query(
    `INSERT INTO campaigns (owner_id, event_id, type, subject, body, target_cities, target_categories, use_pickngo_base, use_store_base, target_count, price, scheduled_at, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'draft') RETURNING *`,
    [
      auth.userId,
      dto.eventId ?? null,
      dto.type,
      dto.subject ?? null,
      dto.body,
      dto.targetCities ?? [],
      dto.targetCategories ?? [],
      dto.usePickngoBase ?? false,
      dto.useStoreBase ?? false,
      targetCount,
      price,
      dto.scheduledAt ? new Date(dto.scheduledAt) : null,
    ],
  );
  return rowToCampaign(rows[0]);
}

export async function getCampaign(id: string, auth: AuthContext): Promise<Campaign> {
  const { rows } = await pool.query('SELECT * FROM campaigns WHERE id = $1', [id]);
  if (!rows[0]) throw new NotFoundError('Campaign');
  const campaign = rowToCampaign(rows[0]);
  if (campaign.ownerId !== auth.userId && auth.role !== 'admin') throw new ForbiddenError();
  return campaign;
}

export async function listMyCampaigns(auth: AuthContext): Promise<Campaign[]> {
  const { rows } = await pool.query(
    'SELECT * FROM campaigns WHERE owner_id = $1 ORDER BY created_at DESC',
    [auth.userId],
  );
  return rows.map(rowToCampaign);
}

export async function launchCampaign(id: string, auth: AuthContext): Promise<Campaign> {
  const { rows } = await pool.query('SELECT * FROM campaigns WHERE id = $1', [id]);
  if (!rows[0]) throw new NotFoundError('Campaign');
  const campaign = rowToCampaign(rows[0]);
  if (campaign.ownerId !== auth.userId && auth.role !== 'admin') throw new ForbiddenError();
  if (campaign.status !== 'draft') {
    throw new BusinessError('CAMPAIGN_ALREADY_LAUNCHED', 'Campaign is already launched');
  }

  const status = campaign.scheduledAt && campaign.scheduledAt > new Date() ? 'scheduled' : 'sending';
  const { rows: updated } = await pool.query(
    'UPDATE campaigns SET status = $1 WHERE id = $2 RETURNING *',
    [status, id],
  );
  return rowToCampaign(updated[0]);
}
