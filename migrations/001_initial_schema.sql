-- Migration: 001_initial_schema
-- Pick&Go TurnUp — initial database schema

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ─── ENUMS ────────────────────────────────────────────────────────────────────

CREATE TYPE user_role AS ENUM ('customer', 'promoter', 'store', 'admin');
CREATE TYPE event_status AS ENUM ('draft', 'pending', 'approved', 'rejected', 'suspended', 'cancelled');
CREATE TYPE ticket_seat_type AS ENUM ('general', 'seated', 'table', 'vip');
CREATE TYPE ticket_status AS ENUM ('available', 'reserved', 'sold', 'used', 'cancelled', 'transferred');
CREATE TYPE order_status AS ENUM ('pending', 'confirmed', 'cancelled', 'refunded');
CREATE TYPE payment_method AS ENUM ('card', 'cash', 'mobile_money', 'wallet');
CREATE TYPE commission_type AS ENUM ('fixed', 'percentage');
CREATE TYPE campaign_type AS ENUM ('email', 'sms', 'both');
CREATE TYPE campaign_status AS ENUM ('draft', 'scheduled', 'sending', 'sent', 'cancelled');
CREATE TYPE reservation_status AS ENUM ('active', 'confirmed', 'expired', 'cancelled');
CREATE TYPE listing_status AS ENUM ('active', 'sold', 'cancelled', 'expired');

-- ─── USERS ────────────────────────────────────────────────────────────────────

CREATE TABLE users (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email       TEXT NOT NULL UNIQUE,
  phone       TEXT,
  name        TEXT NOT NULL,
  role        user_role NOT NULL DEFAULT 'customer',
  city        TEXT,
  country     TEXT,
  avatar_url  TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users (email);
CREATE INDEX idx_users_role ON users (role);
CREATE INDEX idx_users_city ON users (city);

-- ─── EVENTS ───────────────────────────────────────────────────────────────────

CREATE TABLE events (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  promoter_id      UUID NOT NULL REFERENCES users (id),
  title            TEXT NOT NULL,
  description      TEXT NOT NULL,
  category         TEXT NOT NULL,
  event_type       TEXT NOT NULL,
  status           event_status NOT NULL DEFAULT 'draft',
  starts_at        TIMESTAMPTZ NOT NULL,
  ends_at          TIMESTAMPTZ NOT NULL,
  address          TEXT NOT NULL,
  city             TEXT NOT NULL,
  country          TEXT NOT NULL,
  lat              DOUBLE PRECISION,
  lng              DOUBLE PRECISION,
  capacity         INTEGER NOT NULL,
  cover_image_url  TEXT,
  images           TEXT[] NOT NULL DEFAULT '{}',
  keywords         TEXT[] NOT NULL DEFAULT '{}',
  admin_note       TEXT,
  reviewed_by      UUID REFERENCES users (id),
  reviewed_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_events_promoter ON events (promoter_id);
CREATE INDEX idx_events_status ON events (status);
CREATE INDEX idx_events_city ON events (city);
CREATE INDEX idx_events_starts_at ON events (starts_at);
CREATE INDEX idx_events_category ON events (category);
CREATE INDEX idx_events_title_trgm ON events USING GIN (title gin_trgm_ops);
CREATE INDEX idx_events_keywords ON events USING GIN (keywords);

-- ─── TICKET TYPES ─────────────────────────────────────────────────────────────

CREATE TABLE ticket_types (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id     UUID NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  description  TEXT,
  seat_type    ticket_seat_type NOT NULL DEFAULT 'general',
  price        NUMERIC(10, 2) NOT NULL,
  quantity     INTEGER NOT NULL,
  available    INTEGER NOT NULL,
  max_per_order INTEGER NOT NULL DEFAULT 10,
  valid_from   TIMESTAMPTZ,
  valid_until  TIMESTAMPTZ,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ticket_types_available_check CHECK (available >= 0),
  CONSTRAINT ticket_types_quantity_check CHECK (quantity > 0)
);

CREATE INDEX idx_ticket_types_event ON ticket_types (event_id);

-- Price periods: automatic price changes by date
CREATE TABLE ticket_price_periods (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_type_id UUID NOT NULL REFERENCES ticket_types (id) ON DELETE CASCADE,
  price          NUMERIC(10, 2) NOT NULL,
  starts_at      TIMESTAMPTZ NOT NULL,
  ends_at        TIMESTAMPTZ NOT NULL,
  label          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_price_periods_ticket ON ticket_price_periods (ticket_type_id);

-- ─── TICKETS ──────────────────────────────────────────────────────────────────

CREATE TABLE tickets (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_type_id UUID NOT NULL REFERENCES ticket_types (id),
  event_id       UUID NOT NULL REFERENCES events (id),
  owner_id       UUID REFERENCES users (id),
  order_id       UUID,
  reference      TEXT NOT NULL UNIQUE,
  qr_code        TEXT NOT NULL UNIQUE,
  status         ticket_status NOT NULL DEFAULT 'available',
  seat_number    TEXT,
  table_number   TEXT,
  price_paid     NUMERIC(10, 2),
  sold_at        TIMESTAMPTZ,
  used_at        TIMESTAMPTZ,
  scanned_by     UUID REFERENCES users (id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tickets_event ON tickets (event_id);
CREATE INDEX idx_tickets_owner ON tickets (owner_id);
CREATE INDEX idx_tickets_status ON tickets (status);
CREATE INDEX idx_tickets_reference ON tickets (reference);
CREATE INDEX idx_tickets_qr_code ON tickets (qr_code);

-- ─── POINTS OF SALE ───────────────────────────────────────────────────────────

CREATE TABLE points_of_sale (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id         UUID NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  store_id         UUID NOT NULL REFERENCES users (id),
  quota            INTEGER,
  quota_used       INTEGER NOT NULL DEFAULT 0,
  commission_type  commission_type NOT NULL DEFAULT 'percentage',
  commission_value NUMERIC(10, 2) NOT NULL DEFAULT 0,
  is_active        BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (event_id, store_id)
);

CREATE INDEX idx_pos_event ON points_of_sale (event_id);
CREATE INDEX idx_pos_store ON points_of_sale (store_id);

-- ─── RESERVATIONS ─────────────────────────────────────────────────────────────

CREATE TABLE reservations (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id    UUID NOT NULL REFERENCES users (id),
  ticket_type_id UUID NOT NULL REFERENCES ticket_types (id),
  event_id       UUID NOT NULL REFERENCES events (id),
  quantity       INTEGER NOT NULL,
  unit_price     NUMERIC(10, 2) NOT NULL,
  expires_at     TIMESTAMPTZ NOT NULL,
  status         reservation_status NOT NULL DEFAULT 'active',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_reservations_customer ON reservations (customer_id);
CREATE INDEX idx_reservations_ticket_type ON reservations (ticket_type_id);
CREATE INDEX idx_reservations_expires_at ON reservations (expires_at) WHERE status = 'active';

-- ─── ORDERS ───────────────────────────────────────────────────────────────────

CREATE TABLE orders (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id    UUID NOT NULL REFERENCES users (id),
  event_id       UUID NOT NULL REFERENCES events (id),
  store_id       UUID REFERENCES users (id),
  reservation_id UUID REFERENCES reservations (id),
  total          NUMERIC(10, 2) NOT NULL,
  commission     NUMERIC(10, 2) NOT NULL DEFAULT 0,
  status         order_status NOT NULL DEFAULT 'pending',
  payment_method payment_method NOT NULL DEFAULT 'card',
  payment_ref    TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_orders_customer ON orders (customer_id);
CREATE INDEX idx_orders_event ON orders (event_id);
CREATE INDEX idx_orders_store ON orders (store_id);
CREATE INDEX idx_orders_status ON orders (status);

CREATE TABLE order_items (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id       UUID NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  ticket_id      UUID NOT NULL REFERENCES tickets (id),
  ticket_type_id UUID NOT NULL REFERENCES ticket_types (id),
  quantity       INTEGER NOT NULL DEFAULT 1,
  unit_price     NUMERIC(10, 2) NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_order_items_order ON order_items (order_id);
CREATE INDEX idx_order_items_ticket ON order_items (ticket_id);

-- ─── CAMPAIGNS ────────────────────────────────────────────────────────────────

CREATE TABLE campaigns (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id        UUID NOT NULL REFERENCES users (id),
  event_id        UUID REFERENCES events (id),
  type            campaign_type NOT NULL,
  subject         TEXT,
  body            TEXT NOT NULL,
  target_cities   TEXT[] NOT NULL DEFAULT '{}',
  target_categories TEXT[] NOT NULL DEFAULT '{}',
  use_pickngo_base BOOLEAN NOT NULL DEFAULT false,
  use_store_base  BOOLEAN NOT NULL DEFAULT false,
  target_count    INTEGER NOT NULL DEFAULT 0,
  price           NUMERIC(10, 2) NOT NULL DEFAULT 0,
  status          campaign_status NOT NULL DEFAULT 'draft',
  scheduled_at    TIMESTAMPTZ,
  sent_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_campaigns_owner ON campaigns (owner_id);
CREATE INDEX idx_campaigns_event ON campaigns (event_id);
CREATE INDEX idx_campaigns_status ON campaigns (status);

-- ─── MARKETPLACE ──────────────────────────────────────────────────────────────

CREATE TABLE marketplace_listings (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_id   UUID NOT NULL REFERENCES tickets (id),
  seller_id   UUID NOT NULL REFERENCES users (id),
  buyer_id    UUID REFERENCES users (id),
  price       NUMERIC(10, 2) NOT NULL,
  is_external BOOLEAN NOT NULL DEFAULT false,
  status      listing_status NOT NULL DEFAULT 'active',
  expires_at  TIMESTAMPTZ,
  sold_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_marketplace_ticket ON marketplace_listings (ticket_id);
CREATE INDEX idx_marketplace_seller ON marketplace_listings (seller_id);
CREATE INDEX idx_marketplace_status ON marketplace_listings (status);

-- ─── FOLLOWERS ────────────────────────────────────────────────────────────────

CREATE TABLE event_followers (
  customer_id  UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  promoter_id  UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (customer_id, promoter_id)
);

CREATE INDEX idx_followers_promoter ON event_followers (promoter_id);

-- ─── UPDATED_AT TRIGGER ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_events_updated_at BEFORE UPDATE ON events FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_ticket_types_updated_at BEFORE UPDATE ON ticket_types FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_tickets_updated_at BEFORE UPDATE ON tickets FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_pos_updated_at BEFORE UPDATE ON points_of_sale FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_reservations_updated_at BEFORE UPDATE ON reservations FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_orders_updated_at BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_campaigns_updated_at BEFORE UPDATE ON campaigns FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_marketplace_updated_at BEFORE UPDATE ON marketplace_listings FOR EACH ROW EXECUTE FUNCTION set_updated_at();
