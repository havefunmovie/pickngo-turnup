export type UserRole = 'customer' | 'promoter' | 'store' | 'admin';
export type EventStatus = 'draft' | 'pending' | 'approved' | 'rejected' | 'suspended' | 'cancelled';
export type TicketSeatType = 'general' | 'seated' | 'table' | 'vip';
export type TicketStatus = 'available' | 'reserved' | 'sold' | 'used' | 'cancelled' | 'transferred';
export type OrderStatus = 'pending' | 'confirmed' | 'cancelled' | 'refunded';
export type PaymentMethod = 'card' | 'cash' | 'mobile_money' | 'wallet';
export type CommissionType = 'fixed' | 'percentage';
export type CampaignType = 'email' | 'sms' | 'both';
export type CampaignStatus = 'draft' | 'scheduled' | 'sending' | 'sent' | 'cancelled';
export type ReservationStatus = 'active' | 'confirmed' | 'expired' | 'cancelled';
export type ListingStatus = 'active' | 'sold' | 'cancelled' | 'expired';

export interface User {
  id: string;
  email: string;
  phone: string | null;
  name: string;
  role: UserRole;
  city: string | null;
  country: string | null;
  avatarUrl: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Event {
  id: string;
  promoterId: string;
  title: string;
  description: string;
  category: string;
  eventType: string;
  status: EventStatus;
  startsAt: Date;
  endsAt: Date;
  address: string;
  city: string;
  country: string;
  lat: number | null;
  lng: number | null;
  capacity: number;
  coverImageUrl: string | null;
  images: string[];
  keywords: string[];
  adminNote: string | null;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface TicketType {
  id: string;
  eventId: string;
  name: string;
  description: string | null;
  seatType: TicketSeatType;
  price: number;
  quantity: number;
  available: number;
  maxPerOrder: number;
  validFrom: Date | null;
  validUntil: Date | null;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface TicketPricePeriod {
  id: string;
  ticketTypeId: string;
  price: number;
  startsAt: Date;
  endsAt: Date;
  label: string | null;
  createdAt: Date;
}

export interface Ticket {
  id: string;
  ticketTypeId: string;
  eventId: string;
  ownerId: string | null;
  orderId: string | null;
  reference: string;
  qrCode: string;
  status: TicketStatus;
  seatNumber: string | null;
  tableNumber: string | null;
  pricePaid: number | null;
  soldAt: Date | null;
  usedAt: Date | null;
  scannedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PointOfSale {
  id: string;
  eventId: string;
  storeId: string;
  quota: number | null;
  quotaUsed: number;
  commissionType: CommissionType;
  commissionValue: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Reservation {
  id: string;
  customerId: string;
  ticketTypeId: string;
  eventId: string;
  quantity: number;
  unitPrice: number;
  expiresAt: Date;
  status: ReservationStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface Order {
  id: string;
  customerId: string;
  eventId: string;
  storeId: string | null;
  reservationId: string | null;
  total: number;
  commission: number;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  paymentRef: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrderItem {
  id: string;
  orderId: string;
  ticketId: string;
  ticketTypeId: string;
  quantity: number;
  unitPrice: number;
  createdAt: Date;
}

export interface Campaign {
  id: string;
  ownerId: string;
  eventId: string | null;
  type: CampaignType;
  subject: string | null;
  body: string;
  targetCities: string[];
  targetCategories: string[];
  usePickngoBase: boolean;
  useStoreBase: boolean;
  targetCount: number;
  price: number;
  status: CampaignStatus;
  scheduledAt: Date | null;
  sentAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MarketplaceListing {
  id: string;
  ticketId: string;
  sellerId: string;
  buyerId: string | null;
  price: number;
  isExternal: boolean;
  status: ListingStatus;
  expiresAt: Date | null;
  soldAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Pagination {
  cursor?: string;
  limit: number;
}

export interface PaginatedResult<T> {
  data: T[];
  meta: {
    cursor: string | null;
    hasMore: boolean;
    total?: number;
  };
}

export interface AuthContext {
  userId: string;
  role: UserRole;
}
