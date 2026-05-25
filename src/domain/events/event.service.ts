import { withTransaction } from '@infrastructure/database/pool';
import { cacheDelPattern, cacheGet, cacheSet } from '@infrastructure/cache/redis';
import {
  CreateEventInput,
  EventFilters,
  createEvent,
  findEventById,
  findEvents,
  findPromoterEvents,
  submitEventForReview,
  updateEvent,
  updateEventStatus,
} from './event.repository';
import { createTicketTypes } from '@domain/tickets/ticket-type.repository';
import { Event, EventStatus, PaginatedResult, AuthContext } from '@domain/types';
import {
  NotFoundError,
  ForbiddenError,
  BusinessError,
  ValidationError,
} from '@domain/errors';

const EVENT_CACHE_TTL = 300;

export interface CreateEventDto {
  title: string;
  description: string;
  category: string;
  eventType: string;
  startsAt: string;
  endsAt: string;
  address: string;
  city: string;
  country: string;
  lat?: number;
  lng?: number;
  capacity: number;
  coverImageUrl?: string;
  images?: string[];
  keywords?: string[];
  ticketTypes?: Array<{
    name: string;
    description?: string;
    seatType?: string;
    price: number;
    quantity: number;
    maxPerOrder?: number;
    validFrom?: string;
    validUntil?: string;
    sortOrder?: number;
  }>;
}

export async function getEvent(id: string): Promise<Event> {
  const cacheKey = `event:${id}`;
  const cached = await cacheGet<Event>(cacheKey);
  if (cached) return cached;

  const event = await findEventById(id);
  if (!event) throw new NotFoundError('Event');

  await cacheSet(cacheKey, event, EVENT_CACHE_TTL);
  return event;
}

export async function listEvents(filters: EventFilters): Promise<PaginatedResult<Event>> {
  return findEvents(filters);
}

export async function listPromoterEvents(
  promoterId: string,
  status?: EventStatus,
): Promise<Event[]> {
  return findPromoterEvents(promoterId, status);
}

export async function createNewEvent(dto: CreateEventDto, auth: AuthContext): Promise<Event> {
  if (auth.role !== 'promoter' && auth.role !== 'admin') {
    throw new ForbiddenError('Only promoters can create events');
  }

  const startsAt = new Date(dto.startsAt);
  const endsAt = new Date(dto.endsAt);

  if (isNaN(startsAt.getTime()) || isNaN(endsAt.getTime())) {
    throw new ValidationError('Invalid date format');
  }
  if (startsAt <= new Date()) {
    throw new BusinessError('INVALID_DATE', 'Event must start in the future');
  }
  if (endsAt <= startsAt) {
    throw new BusinessError('INVALID_DATE', 'End date must be after start date');
  }

  const input: CreateEventInput = {
    promoterId: auth.userId,
    title: dto.title,
    description: dto.description,
    category: dto.category,
    eventType: dto.eventType,
    startsAt,
    endsAt,
    address: dto.address,
    city: dto.city,
    country: dto.country,
    lat: dto.lat,
    lng: dto.lng,
    capacity: dto.capacity,
    coverImageUrl: dto.coverImageUrl,
    images: dto.images,
    keywords: dto.keywords,
  };

  return withTransaction(async (client: import('pg').PoolClient) => {
    const event = await createEvent(input, client);

    if (dto.ticketTypes && dto.ticketTypes.length > 0) {
      await createTicketTypes(
        dto.ticketTypes.map((tt) => ({
          eventId: event.id,
          name: tt.name,
          description: tt.description,
          seatType: (tt.seatType as 'general' | 'seated' | 'table' | 'vip') ?? 'general',
          price: tt.price,
          quantity: tt.quantity,
          maxPerOrder: tt.maxPerOrder ?? 10,
          validFrom: tt.validFrom ? new Date(tt.validFrom) : undefined,
          validUntil: tt.validUntil ? new Date(tt.validUntil) : undefined,
          sortOrder: tt.sortOrder ?? 0,
        })),
        client,
      );
    }

    return event;
  });
}

export async function editEvent(
  id: string,
  dto: Partial<CreateEventDto>,
  auth: AuthContext,
): Promise<Event> {
  const event = await findEventById(id);
  if (!event) throw new NotFoundError('Event');

  if (auth.role !== 'admin' && event.promoterId !== auth.userId) {
    throw new ForbiddenError();
  }
  if (!['draft', 'rejected'].includes(event.status)) {
    throw new BusinessError('EVENT_LOCKED', 'Only draft or rejected events can be edited');
  }

  const updated = await updateEvent(id, {
    ...dto,
    startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
    endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
  });

  await cacheDelPattern(`event:${id}`);
  return updated!;
}

export async function submitForReview(id: string, auth: AuthContext): Promise<Event> {
  const event = await findEventById(id);
  if (!event) throw new NotFoundError('Event');
  if (event.promoterId !== auth.userId) throw new ForbiddenError();
  if (event.status !== 'draft') {
    throw new BusinessError('INVALID_STATUS', 'Only draft events can be submitted for review');
  }

  const updated = await submitEventForReview(id);
  if (!updated) throw new BusinessError('SUBMIT_FAILED', 'Could not submit event for review');

  await cacheDelPattern(`event:${id}`);
  return updated;
}

export async function reviewEvent(
  id: string,
  decision: 'approved' | 'rejected' | 'suspended',
  auth: AuthContext,
  adminNote?: string,
): Promise<Event> {
  if (auth.role !== 'admin') throw new ForbiddenError('Admin access required');

  const event = await findEventById(id);
  if (!event) throw new NotFoundError('Event');

  const updated = await updateEventStatus(id, decision, auth.userId, adminNote);
  if (!updated) throw new NotFoundError('Event');

  await cacheDelPattern(`event:${id}`);
  return updated;
}
