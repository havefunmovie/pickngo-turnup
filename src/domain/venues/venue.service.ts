import { findEventById } from '@domain/events/event.repository';
import {
  CreatePosInput,
  createPointOfSale,
  deactivatePos,
  findPosByEvent,
  findPosByStore,
  findPosById,
} from './venue.repository';
import { PointOfSale, AuthContext } from '@domain/types';
import { ForbiddenError, NotFoundError, BusinessError } from '@domain/errors';

export async function addPointOfSale(
  dto: CreatePosInput,
  auth: AuthContext,
): Promise<PointOfSale> {
  const event = await findEventById(dto.eventId);
  if (!event) throw new NotFoundError('Event');
  if (event.promoterId !== auth.userId && auth.role !== 'admin') throw new ForbiddenError();
  if (!['draft', 'approved'].includes(event.status)) {
    throw new BusinessError('EVENT_LOCKED', 'Cannot modify points of sale for this event');
  }

  return createPointOfSale(dto);
}

export async function getEventPointsOfSale(
  eventId: string,
  auth: AuthContext,
): Promise<PointOfSale[]> {
  const event = await findEventById(eventId);
  if (!event) throw new NotFoundError('Event');
  if (event.promoterId !== auth.userId && auth.role !== 'admin') throw new ForbiddenError();
  return findPosByEvent(eventId);
}

export async function getStoreEvents(auth: AuthContext): Promise<PointOfSale[]> {
  if (auth.role !== 'store' && auth.role !== 'admin') throw new ForbiddenError();
  return findPosByStore(auth.userId);
}

export async function removePointOfSale(posId: string, auth: AuthContext): Promise<void> {
  const pos = await findPosById(posId);
  if (!pos) throw new NotFoundError('Point of sale');
  const event = await findEventById(pos.eventId);
  if (!event) throw new NotFoundError('Event');
  if (event.promoterId !== auth.userId && auth.role !== 'admin') throw new ForbiddenError();
  await deactivatePos(posId);
}
