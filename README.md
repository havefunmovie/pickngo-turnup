# Pick&Go TurnUp

Event management microservice for the Pick&Go ecosystem — promoters, customers, stores and admins in one unified API.

## Features

- **Event lifecycle** — create, submit for review, admin approve/reject/suspend
- **Ticket sales** — multiple types (General, VIP, Seated, Table), dynamic pricing periods
- **QR tickets** — unique QR codes generated at purchase, one-time scan enforcement
- **Ticket transfers** — transfer tickets between users by email
- **Resale marketplace** — list, browse and buy resale tickets
- **Points of sale** — stores sell tickets in-person with configurable commission
- **Marketing campaigns** — email/SMS targeting with dynamic pricing and scheduling
- **Statistics** — promoter revenue dashboard and store sales dashboard
- **Role-based access** — customer, promoter, store, admin

## Tech Stack

- **Runtime** — Node.js 20 + TypeScript
- **Framework** — Express
- **Database** — PostgreSQL 16
- **Cache** — Redis 7
- **Auth** — JWT (access token 15min)
- **Validation** — Zod
- **QR codes** — qrcode
- **Logging** — Winston (structured JSON in production)

## Getting Started

### Prerequisites

- Node.js 20+
- Docker & Docker Compose

### Installation

```bash
git clone https://github.com/havefunmovie/pickngo-turnup.git
cd pickngo-turnup

npm install

cp .env.example .env
# Edit .env with your settings
```

### Start dependencies

```bash
docker-compose up -d postgres redis
```

### Run migrations

```bash
npm run migrate
```

### Start dev server

```bash
npm run dev
```

Server runs on `http://localhost:3003`

### Build for production

```bash
npm run build
npm start
```

### Docker (full stack)

```bash
docker-compose up
```

---

## API Overview

### Auth

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v1/auth/register` | Register (customer / promoter / store) |
| `POST` | `/api/v1/auth/login` | Login → JWT |
| `GET` | `/api/v1/auth/me` | Get current user |

### Events

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/events` | Browse approved events (search, filter) |
| `GET` | `/api/v1/events/:id` | Event details + ticket types |
| `POST` | `/api/v1/events` | Create event (promoter) |
| `PATCH` | `/api/v1/events/:id` | Edit event (promoter) |
| `POST` | `/api/v1/events/:id/submit` | Submit for admin review |
| `POST` | `/api/v1/events/:id/review` | Approve / reject / suspend (admin) |
| `GET` | `/api/v1/events/:id/stats` | Sales stats (promoter) |
| `GET` | `/api/v1/events/me/events` | My events (promoter) |

### Tickets

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v1/tickets/buy` | Purchase tickets |
| `GET` | `/api/v1/tickets/me` | My tickets |
| `GET` | `/api/v1/tickets/:id/qr` | Get QR code |
| `POST` | `/api/v1/tickets/:id/transfer` | Transfer to another user |
| `POST` | `/api/v1/tickets/scan` | Scan QR at entrance (staff) |

### Points of Sale

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v1/venues` | Add point of sale (promoter) |
| `GET` | `/api/v1/venues/event/:eventId` | List event POS (promoter) |
| `GET` | `/api/v1/venues/store/me` | My assigned events (store) |
| `DELETE` | `/api/v1/venues/:id` | Remove POS (promoter) |

### Marketplace

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/marketplace` | Browse active listings |
| `POST` | `/api/v1/marketplace` | List a ticket for resale |
| `POST` | `/api/v1/marketplace/:id/buy` | Buy a listing |
| `DELETE` | `/api/v1/marketplace/:id` | Cancel a listing |

### Campaigns

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v1/campaigns/estimate` | Estimate reach and cost |
| `POST` | `/api/v1/campaigns` | Create campaign |
| `GET` | `/api/v1/campaigns/me` | My campaigns |
| `POST` | `/api/v1/campaigns/:id/launch` | Launch campaign |

### Stats

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/stats/store/me` | Store sales dashboard |

---

## Event Workflow

```
Promoter creates event (draft)
        ↓
Promoter submits for review (pending)
        ↓
Admin approves (approved) ←→ Admin rejects (rejected)
        ↓
Event visible publicly — tickets on sale
```

## Ticket Lifecycle

```
Purchase → sold (QR generated)
         → scan at entrance → used
         → transfer → new owner
         → list on marketplace → sold to buyer
```

---

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3003` |
| `DATABASE_URL` | PostgreSQL connection string | — |
| `REDIS_URL` | Redis connection string | — |
| `JWT_SECRET` | JWT signing secret (min 32 chars) | — |
| `JWT_ACCESS_EXPIRES_IN` | Access token TTL | `15m` |
| `RESERVATION_TTL` | Reservation expiry in seconds | `172800` |
| `EMAIL_FROM` | Sender email for campaigns | `noreply@pickngo.com` |

See `.env.example` for the full list.

---

## Health Checks

```bash
GET /health   # process alive
GET /ready    # database connectivity
```

---

## Project Structure

```
src/
├── api/
│   ├── middleware/     # auth, error handler, request logger
│   └── routes/         # auth, events, tickets, venues, campaigns, marketplace, stats
├── domain/
│   ├── events/         # event service, repository, stats
│   ├── tickets/        # ticket service, ticket-type repository
│   ├── users/          # auth, follow/unfollow
│   ├── venues/         # points of sale
│   ├── orders/         # order repository
│   ├── campaigns/      # campaign service
│   ├── marketplace/    # listing service
│   ├── types.ts        # shared domain types
│   └── errors.ts       # typed error hierarchy
├── infrastructure/
│   ├── database/       # PostgreSQL pool + transactions
│   ├── cache/          # Redis client
│   └── logger.ts       # Winston logger
└── config/
    └── env.ts          # Zod-validated environment
migrations/             # SQL migrations + runner
```

---

## License

MIT — Pick&Go © 2026
