import { createNewEvent, getEvent, submitForReview } from '../event.service';
import * as eventRepo from '../event.repository';
import * as ticketTypeRepo from '@domain/tickets/ticket-type.repository';
import { AuthContext } from '@domain/types';
import { BusinessError, ForbiddenError, NotFoundError } from '@domain/errors';

jest.mock('../event.repository');
jest.mock('@domain/tickets/ticket-type.repository');
jest.mock('@infrastructure/database/pool', () => ({
  pool: { query: jest.fn() },
  withTransaction: jest.fn((fn: (client: unknown) => Promise<unknown>) => fn({})),
}));
jest.mock('@infrastructure/cache/redis', () => ({
  cacheGet: jest.fn().mockResolvedValue(null),
  cacheSet: jest.fn(),
  cacheDel: jest.fn(),
  cacheDelPattern: jest.fn(),
}));

const mockPromoterAuth: AuthContext = { userId: 'promoter-1', role: 'promoter' };
const mockAdminAuth: AuthContext = { userId: 'admin-1', role: 'admin' };

const baseDto = {
  title: 'Test Concert',
  description: 'An amazing test concert with great artists',
  category: 'music',
  eventType: 'concert',
  startsAt: new Date(Date.now() + 86400000).toISOString(),
  endsAt: new Date(Date.now() + 2 * 86400000).toISOString(),
  address: '10 Rue de la Paix',
  city: 'Paris',
  country: 'France',
  capacity: 500,
};

const mockEvent = {
  id: 'event-1',
  promoterId: 'promoter-1',
  status: 'draft' as const,
  ...baseDto,
  startsAt: new Date(baseDto.startsAt),
  endsAt: new Date(baseDto.endsAt),
  lat: null,
  lng: null,
  coverImageUrl: null,
  images: [],
  keywords: [],
  adminNote: null,
  reviewedBy: null,
  reviewedAt: null,
  eventType: 'concert',
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('event.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createNewEvent', () => {
    it('creates an event for a promoter', async () => {
      (eventRepo.createEvent as jest.Mock).mockResolvedValue(mockEvent);
      const result = await createNewEvent(baseDto, mockPromoterAuth);
      expect(result.title).toBe('Test Concert');
      expect(eventRepo.createEvent).toHaveBeenCalledWith(
        expect.objectContaining({ promoterId: 'promoter-1' }),
        expect.anything(),
      );
    });

    it('rejects a customer trying to create an event', async () => {
      await expect(
        createNewEvent(baseDto, { userId: 'cust-1', role: 'customer' }),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });

    it('rejects an event starting in the past', async () => {
      await expect(
        createNewEvent(
          { ...baseDto, startsAt: new Date(Date.now() - 1000).toISOString() },
          mockPromoterAuth,
        ),
      ).rejects.toBeInstanceOf(BusinessError);
    });

    it('rejects end date before start date', async () => {
      await expect(
        createNewEvent(
          {
            ...baseDto,
            endsAt: new Date(Date.now() + 3600000).toISOString(),
            startsAt: new Date(Date.now() + 86400000).toISOString(),
          },
          mockPromoterAuth,
        ),
      ).rejects.toBeInstanceOf(BusinessError);
    });
  });

  describe('getEvent', () => {
    it('returns event from DB when cache misses', async () => {
      (eventRepo.findEventById as jest.Mock).mockResolvedValue(mockEvent);
      const result = await getEvent('event-1');
      expect(result.id).toBe('event-1');
    });

    it('throws NotFoundError when event does not exist', async () => {
      (eventRepo.findEventById as jest.Mock).mockResolvedValue(null);
      await expect(getEvent('missing')).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe('submitForReview', () => {
    it('submits a draft event for review', async () => {
      (eventRepo.findEventById as jest.Mock).mockResolvedValue(mockEvent);
      (eventRepo.submitEventForReview as jest.Mock).mockResolvedValue({
        ...mockEvent,
        status: 'pending',
      });
      const result = await submitForReview('event-1', mockPromoterAuth);
      expect(result.status).toBe('pending');
    });

    it('rejects submit when promoter does not own event', async () => {
      (eventRepo.findEventById as jest.Mock).mockResolvedValue({
        ...mockEvent,
        promoterId: 'other-promoter',
      });
      await expect(submitForReview('event-1', mockPromoterAuth)).rejects.toBeInstanceOf(ForbiddenError);
    });
  });
});
