import { scanQrTicket, transferTicketToUser } from '../ticket.service';
import * as ticketRepo from '../ticket.repository';
import * as eventRepo from '@domain/events/event.repository';
import { AuthContext } from '@domain/types';
import { BusinessError, ForbiddenError, NotFoundError } from '@domain/errors';

jest.mock('../ticket.repository');
jest.mock('../ticket-type.repository');
jest.mock('@domain/events/event.repository');
jest.mock('@infrastructure/database/pool', () => ({
  pool: { query: jest.fn() },
  withTransaction: jest.fn((fn: (client: unknown) => Promise<unknown>) => fn({})),
}));

const staffAuth: AuthContext = { userId: 'staff-1', role: 'promoter' };
const customerAuth: AuthContext = { userId: 'cust-1', role: 'customer' };

const mockTicket = {
  id: 'ticket-1',
  ticketTypeId: 'tt-1',
  eventId: 'event-1',
  ownerId: 'cust-1',
  orderId: 'order-1',
  reference: 'TU-ABC123',
  qrCode: 'qr-uuid-1',
  status: 'sold' as const,
  seatNumber: null,
  tableNumber: null,
  pricePaid: 25,
  soldAt: new Date(),
  usedAt: null,
  scannedBy: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('ticket.service', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('scanQrTicket', () => {
    it('scans a valid sold ticket', async () => {
      (ticketRepo.findTicketByQrCode as jest.Mock).mockResolvedValue(mockTicket);
      (ticketRepo.scanTicket as jest.Mock).mockResolvedValue({ ...mockTicket, status: 'used' });
      const result = await scanQrTicket('qr-uuid-1', staffAuth);
      expect(result.status).toBe('used');
    });

    it('rejects scanning by customer', async () => {
      await expect(scanQrTicket('qr-uuid-1', customerAuth)).rejects.toBeInstanceOf(ForbiddenError);
    });

    it('rejects already used ticket', async () => {
      (ticketRepo.findTicketByQrCode as jest.Mock).mockResolvedValue({
        ...mockTicket,
        status: 'used',
      });
      await expect(scanQrTicket('qr-uuid-1', staffAuth)).rejects.toBeInstanceOf(BusinessError);
    });

    it('throws NotFoundError for unknown QR code', async () => {
      (ticketRepo.findTicketByQrCode as jest.Mock).mockResolvedValue(null);
      await expect(scanQrTicket('bad-qr', staffAuth)).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe('transferTicketToUser', () => {
    it('rejects transfer of ticket owned by another user', async () => {
      (ticketRepo.findTicketById as jest.Mock).mockResolvedValue({
        ...mockTicket,
        ownerId: 'other-user',
      });
      await expect(
        transferTicketToUser('ticket-1', 'recipient@example.com', customerAuth),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });

    it('rejects transfer of already used ticket', async () => {
      (ticketRepo.findTicketById as jest.Mock).mockResolvedValue({
        ...mockTicket,
        status: 'used',
      });
      await expect(
        transferTicketToUser('ticket-1', 'recipient@example.com', customerAuth),
      ).rejects.toBeInstanceOf(BusinessError);
    });
  });
});
