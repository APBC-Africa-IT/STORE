# MySpares Backend — Engineering Build Guide

> **Audience:** the AI coding agent (and any human engineer) building the MySpares backend.
> **Source of truth for requirements:** *MySpares SRS v2.0 (July 2026)*. This guide turns that SRS into concrete engineering decisions. Where the SRS is silent or ambiguous, **this guide decides** — see §17 "Decisions the SRS leaves open".
> **Stack in one line:** Node.js 24 LTS · TypeScript (strict) · Fastify 5 · PostgreSQL 16 · Prisma · Redis 7 · BullMQ · Zod · Vitest · Docker.

---

## Table of contents

0. [How to use this document (read first, agent)](#0-how-to-use-this-document-read-first-agent)
1. [What we are building](#1-what-we-are-building)
2. [Non-negotiable principles](#2-non-negotiable-principles)
3. [Technology stack and why](#3-technology-stack-and-why)
4. [Architecture](#4-architecture)
5. [Project structure](#5-project-structure)
6. [Coding conventions](#6-coding-conventions)
7. [Data model (Prisma schema)](#7-data-model-prisma-schema)
8. [Core domain logic](#8-core-domain-logic) — availability, inventory, pricing, orders, sourcing, logistics, POS, finance
9. [State machines](#9-state-machines)
10. [Business rules → enforcement map](#10-business-rules--enforcement-map)
11. [Authentication, authorisation and security](#11-authentication-authorisation-and-security)
12. [API design and endpoint catalogue](#12-api-design-and-endpoint-catalogue)
13. [Background jobs, events and real-time](#13-background-jobs-events-and-real-time)
14. [Integrations](#14-integrations)
15. [Testing strategy](#15-testing-strategy)
16. [Operations: config, logging, observability, deployment](#16-operations-config-logging-observability-deployment)
17. [Decisions the SRS leaves open](#17-decisions-the-srs-leaves-open)
18. [Build order (milestones with Definition of Done)](#18-build-order-milestones-with-definition-of-done)
19. [Glossary](#19-glossary)

---

## 0. How to use this document (read first, agent)

You are building a production backend for a real business that moves real money and real stock. Treat it that way.

**Working rules for the agent:**

1. **Build in the milestone order in §18.** Do not start a milestone until the previous one passes its Definition of Done. Do not build Phase 2+ features early unless a milestone says so.
2. **Follow the architecture exactly** (§4–§6). Every feature lives in a module under `src/modules/<name>` with the same file layout. Consistency matters more than cleverness.
3. **Never invent business rules.** Business behaviour comes from the SRS and §8–§10 of this guide. If something is genuinely undefined, choose the safest option (the one that cannot lose money, lose stock, or leak data), implement it behind a config flag if reasonable, and add an entry to `docs/DECISIONS.md` explaining what you chose and why.
4. **Money, stock, and status changes are sacred.** Each one happens inside a database transaction, is validated by a state machine or invariant, and leaves an audit trail. No exceptions.
5. **Tests are part of the feature.** A feature is not done until its unit and integration tests pass (§15). Run `pnpm lint && pnpm typecheck && pnpm test` before declaring any task complete.
6. **Supplier identity is confidential (BR-007).** Customer-facing responses must never contain supplier names, IDs, cost prices, or margins. Use the audience-specific serializers (§6.6). There is a test for this — keep it green.
7. **Small, reviewable commits.** One logical change per commit, conventional commit messages (`feat(orders): ...`, `fix(inventory): ...`).
8. **When you add an env var, a queue, a permission, an error code, or an event**, register it in the central list for that thing (see §6) — never inline magic strings.
9. **Do not add dependencies casually.** Use what §3 lists. If you truly need a new package, it must be well-maintained, typed, and noted in `docs/DECISIONS.md`.
10. **If this guide and the SRS conflict, this guide wins** for engineering matters; the SRS wins for business intent. Note the conflict in `docs/DECISIONS.md`.

---

## 1. What we are building

MySpares is a **hybrid physical + online spare-parts business** (Kenya, KES currency, M-Pesa first). One backend serves:

| Client | Users | Phase |
|---|---|---|
| Customer storefront (web, later mobile) | B2C customers, guests, B2B trade customers | 1 (B2B portal 2) |
| Admin / operations panel | Staff: managers, procurement, warehouse, dispatch, finance | 1 |
| POS (tablet / terminal in the shop) | Sales staff, store managers | 1 |
| Supplier portal | Supplier users | 2 |
| Rider app (PWA) | Boda boda riders | 3 (riders are admin-managed in Phase 1) |

### 1.1 The core business loop (memorise this)

```
Customer demand (online or walk-in)
        │
        ▼
   Stock check ─────────── IN STOCK ──► reserve → pay → pick → pack (MySpares brand) → dispatch/hand over → delivered
        │
     OUT OF STOCK
        │
        ▼
 Order accepted with lead time (paid in full or deposit)
        │
        ▼
 Find supplier → Purchase Order → supplier confirms → collection job (boda boda, collection code)
        │
        ▼
 Rider collects → hub → GRN + quality check (must PASS) → stock allocated to order
        │
        ▼
 Pack (MySpares brand) → delivery job (boda boda, OTP/photo) or counter handover → delivered
        │
        ▼
 Finance: revenue, COGS (landed cost), VAT, supplier payable, rider earnings, COD reconciliation
```

**The customer always buys from MySpares.** Suppliers are invisible to customers. There is **no dead-end "Out of Stock"** — every product always has a next action (order with lead time, request, pre-order).

### 1.2 Scope of this backend by phase

- **Phase 0 (Foundation):** project skeleton, auth, RBAC, audit log, vehicle DB, catalogue core, config, CI.
- **Phase 1 (Core):** catalogue + fitment + search, availability engine, cart, checkout (M-Pesa + Stripe + COD + deposit), orders + fulfilment, inventory (bins, adjustments, stocktake), suppliers + POs + GRN, logistics jobs (manual dispatch), delivery zones, POS + shifts, notifications (SMS + email), finance ledger basics, admin dashboard KPIs.
- **Phase 2:** supplier portal, part requests (quote → pay link), RMA/returns, loyalty, B2B trade accounts, promotions, reviews, WhatsApp, eTIMS, courier (Sendy/DHL).
- **Phase 3:** rider app API (OTP login, job inbox, accept, collection/delivery confirmation, earnings), GPS, B2B credit + quotes.
- **Phase 4+:** AI restock, image part search, fleet portal, authenticity QR. Out of scope until asked.

---

## 2. Non-negotiable principles

These are the "senior engineer" defaults. Every PR is judged against them.

1. **Modular monolith first.** One deployable, strong internal module boundaries. No microservices. Modules talk through their public service interface or domain events — never by reaching into another module's tables/repositories.
2. **The database is the source of truth; Postgres enforces invariants.** Use `CHECK` constraints, `UNIQUE` constraints, foreign keys, and atomic conditional `UPDATE`s. Application checks are a convenience; the database is the guarantee. Example: `on_hand >= 0`, `reserved >= 0`, `reserved <= on_hand` are DB constraints.
3. **Money is integer minor units.** `amount_cents: Int` (KES × 100). Never floats. Never `Number` arithmetic on decimals. Percentages are stored as **basis points** (`1600` = 16.00%).
4. **Every state change goes through a state machine** (§9). No `UPDATE orders SET status = ...` anywhere except inside the state-machine transition function.
5. **Append-only ledgers for stock and money.** Current stock is a cached aggregate of `stock_movements`; the finance ledger is double-entry `journal_lines`. We never edit history — we post reversing entries.
6. **Idempotency everywhere money moves.** Payment callbacks, checkout submission, payouts, and webhooks are idempotent (idempotency keys + unique provider references).
7. **Side effects after commit.** Notifications, search indexing, websockets, and third-party calls are triggered by **outbox events** written in the same transaction as the business change, then processed by workers. Never send an SMS from inside a DB transaction.
8. **Validate at the edge, trust inside.** Every request body/query/params is parsed by a Zod schema. Services receive typed, validated input.
9. **Least privilege.** Permission-based RBAC on every route. Default deny. Staff and supplier accounts require 2FA.
10. **Everything a staff member does is audited** (BR-010): who, what, when, from which IP, before/after.
11. **Fail loudly in dev, gracefully in prod.** Search down → fall back to Postgres search. SMS provider down → retry with backoff, then alert. Never lose an order because a notification failed.
12. **Observability is a feature.** Structured logs with request IDs, health checks, metrics for p95 latency, queue depth, and failed jobs.

---

## 3. Technology stack and why

Pin **exact** versions in `package.json` (no `^`). Use the latest stable release of each at project setup time.

| Concern | Choice | Why |
|---|---|---|
| Runtime | **Node.js 24 LTS** | Current LTS, native `fetch`, stable test runner support, good perf. |
| Language | **TypeScript 5.x, `strict: true`**, `noUncheckedIndexedAccess: true` | Catches whole classes of bugs; agents produce better code with strong types. |
| Package manager | **pnpm** | Fast, strict dependency resolution. |
| HTTP framework | **Fastify 5** | Fast, schema-first, great plugin model, first-class TypeScript, built-in `inject()` for tests. |
| Validation | **Zod** + `fastify-type-provider-zod` | One schema = runtime validation + TS types + OpenAPI docs. |
| Database | **PostgreSQL 16** | ACID, row locks, `CHECK` constraints, `tsvector` full-text, `pg_trgm`, JSONB, sequences. |
| ORM / migrations | **Prisma 6.x — pin it** (+ `$queryRaw` / TypedSQL for hot paths) | Typed client, readable schema, reliable migrations. Raw SQL is allowed (and required) for atomic stock updates and reports. The schema in §7 is written for Prisma 6. If you deliberately choose Prisma 7, move `datasource.url` into `prisma.config.ts` and use the `@prisma/adapter-pg` driver adapter as Prisma 7 requires — record that in `docs/DECISIONS.md`. |
| Cache / locks / rate limits | **Redis 7** (`ioredis`) | Caching, rate limiting, distributed locks, BullMQ backend, Socket.IO adapter. |
| Background jobs | **BullMQ** | Reliable queues with retries, backoff, delayed and repeatable jobs. |
| Search | `SearchProvider` interface: **Postgres FTS (`tsvector` + `pg_trgm`) first**, **OpenSearch/Elasticsearch** adapter in Milestone 7 | SRS asks for Elasticsearch **and** SQL fallback (§7.3). Interface makes both trivial. |
| Real-time | **Socket.IO** with `@socket.io/redis-adapter` | Live order feed, stock updates to POS/admin, dashboards. |
| Auth | `@fastify/jwt` (access tokens), opaque rotating refresh tokens, **argon2** for passwords, **otplib** for TOTP 2FA | Industry standard, secure defaults. |
| Security plugins | `@fastify/helmet`, `@fastify/cors`, `@fastify/rate-limit`, `@fastify/cookie`, `@fastify/multipart` | OWASP baseline. |
| API docs | `@fastify/swagger` + `@fastify/swagger-ui` generated from Zod | Docs never drift from code. |
| Logging | **pino** (Fastify default) + `pino-pretty` in dev | Fast, structured JSON logs. |
| Files | S3-compatible storage (AWS S3 / Cloudflare R2) via `@aws-sdk/client-s3`, presigned URLs; **sharp** for images | Scalable; no files on app disk. |
| PDFs / labels | **pdfmake** (PO, invoice, packing slip, receipt, label), **bwip-js** (barcodes/QR) | Pure JS, no headless browser needed. |
| Dates | **date-fns** + `date-fns-tz` (`Africa/Nairobi`) | Immutable, tree-shakable. Store UTC, display EAT. |
| Testing | **Vitest**, Fastify `inject`, **Testcontainers** (real Postgres + Redis), `@faker-js/faker` | Integration tests against real infra catch real bugs. |
| Lint / format | **ESLint** (typescript-eslint, strict) + **Prettier** | Consistency. |
| Containers | **Docker** + `docker-compose` for local (Postgres, Redis, OpenSearch, MinIO, Mailpit) | One-command local env. |
| CI | GitHub Actions: lint → typecheck → test → build → migrate check | Every PR. |

**Explicitly not used:** Mongoose/MongoDB (we need relational integrity), floats for money, `any` types, global mutable singletons outside the composition root, Express middleware patterns that bypass Fastify's lifecycle.

---

## 4. Architecture

### 4.1 Shape

```
                   ┌──────────────────────────────────────────────────────────┐
  Storefront ─┐    │                    API process (Fastify)                 │
  Admin  ─────┼──► │  routes → handlers → services → repositories → Prisma   │──► PostgreSQL
  POS    ─────┤    │                 │                                        │
  Supplier ───┤    │                 └─► outbox (same TX)                     │──► Redis (cache, rate limit, locks)
  Rider ──────┘    │  Socket.IO (Redis adapter)                               │
                   └──────────────────────────────────────────────────────────┘
                                         │ outbox rows
                                         ▼
                   ┌──────────────────────────────────────────────────────────┐
                   │             Worker process (BullMQ consumers)            │──► M-Pesa, Stripe, Africa's Talking,
                   │  outbox relay · notifications · search index · timers    │    SendGrid, Twilio WhatsApp, S3,
                   │  reservation expiry · PO/COD alerts · payouts · reports  │    OpenSearch, eTIMS
                   └──────────────────────────────────────────────────────────┘
```

- **Two entry points, one codebase:** `src/server.ts` (HTTP + websockets) and `src/worker.ts` (queues + schedulers). Both build the same composition root. They scale independently.
- **Stateless API.** No in-memory sessions; anything shared lives in Postgres or Redis. Horizontal scaling behind a load balancer works out of the box.

### 4.2 Layers inside a module

| Layer | File | Responsibility | May call |
|---|---|---|---|
| **Routes** | `*.routes.ts` | Register URLs, attach Zod schemas, auth guard + permission. No logic. | handlers |
| **Handlers (controllers)** | `*.handlers.ts` | Translate HTTP ↔ service call. Pick the actor from `request.user`. Choose serializer for the audience. | services, serializers |
| **Service** | `*.service.ts` | Business logic, transactions, state transitions, emitting events, audit. Framework-agnostic (no `request`/`reply`). | own repository, other modules' **services**, domain functions, outbox, audit |
| **Domain** | `*.domain.ts` / `*.machine.ts` | Pure functions: state machines, price/margin math, availability rules. No I/O. 100% unit-tested. | nothing with I/O |
| **Repository** | `*.repository.ts` | All Prisma/SQL for this module's tables. Accepts an optional `tx`. | Prisma |
| **Schemas** | `*.schemas.ts` | Zod request/response schemas + inferred types. | — |
| **Serializers** | `*.serializers.ts` | Map DB rows → DTOs per audience (`public`, `customer`, `staff`, `supplier`, `rider`). | — |
| **Events** | `*.events.ts` | Event names + payload types this module emits. | — |

**Rules:**
- A module's repository is private to that module. Other modules call its **service**.
- Services that must participate in another module's transaction accept `tx` as a parameter (`inventoryService.reserve(input, tx)`).
- Domain functions are pure and synchronous. If you're tempted to `await` inside one, it belongs in the service.

### 4.3 Composition root (dependency injection without magic)

`src/app/container.ts` constructs every repository and service once, wiring dependencies through constructors. No DI framework, no decorators.

```ts
// src/app/container.ts (shape — not exhaustive)
export function buildContainer(deps: { prisma: PrismaClient; redis: Redis; config: Config; logger: Logger }) {
  const audit = new AuditService(new AuditRepository(deps.prisma));
  const outbox = new OutboxService(deps.prisma);
  const inventory = new InventoryService(new InventoryRepository(deps.prisma), outbox, audit);
  const pricing = new PricingService(/* ... */);
  const orders = new OrderService(new OrderRepository(deps.prisma), inventory, pricing, outbox, audit, deps.prisma);
  // ...
  return { audit, outbox, inventory, pricing, orders /* ... */ };
}
export type Container = ReturnType<typeof buildContainer>;
```

Fastify gets the container via `app.decorate('container', container)`. Tests build a container against Testcontainers infra, or substitute fakes for third-party adapters.

### 4.4 Transactions

```ts
// src/shared/db/transaction.ts
export async function withTx<T>(prisma: PrismaClient, fn: (tx: Tx) => Promise<T>, opts?: { isolationLevel?: Prisma.TransactionIsolationLevel; timeoutMs?: number }) {
  return prisma.$transaction(fn, { isolationLevel: opts?.isolationLevel ?? 'ReadCommitted', timeout: opts?.timeoutMs ?? 10_000 });
}
```

- Default isolation **Read Committed** + **atomic conditional updates** or `SELECT ... FOR UPDATE` for contended rows (stock, order status, payment status).
- Keep transactions short. **Never call an external API inside a transaction.**
- Lock order to avoid deadlocks: always lock rows in a consistent order (e.g., inventory rows sorted by `product_id` ascending).

### 4.5 Domain events and the transactional outbox

1. Service performs a business change and, **in the same transaction**, inserts one or more rows into `outbox_events` (`type`, `aggregate_type`, `aggregate_id`, `payload`, `created_at`).
2. The worker's **outbox relay** polls (`SELECT ... FOR UPDATE SKIP LOCKED LIMIT 100`) every ~500 ms, publishes each event to BullMQ queues, and marks it `published_at`.
3. Consumers (notifications, search indexer, websocket broadcaster, finance poster, etc.) are **idempotent**: they key on `event.id`.

This guarantees "if the order was created, the customer will be notified" without distributed transactions.

### 4.6 Modules

| Module | Owns (tables) | Phase |
|---|---|---|
| `auth` | sessions/refresh tokens, OTP codes, 2FA secrets | 0 |
| `users` | users, roles, permissions, staff profiles, customer profiles, addresses, garage vehicles | 0 |
| `audit` | audit_logs | 0 |
| `vehicles` | makes, models, vehicles (YMM+engine), VIN decode cache | 0 |
| `catalog` | categories, brands, products, part numbers/cross-refs, fitment, media, specs | 0–1 |
| `search` | search index sync, suggestions | 1 |
| `inventory` | locations, bins, inventory levels, stock movements, reservations, stocktakes | 1 |
| `pricing` | price rules, trade tiers, bulk tiers, margin floors, price overrides/approvals | 1 |
| `cart` | carts, cart items | 1 |
| `orders` | orders, order items, order status history, notes | 1 |
| `fulfilment` | pick/pack tasks, packing slips, labels | 1 |
| `payments` | payments, payment attempts, refunds, webhook events | 1 |
| `procurement` | suppliers, supplier contacts, supplier catalogue items, purchase orders, PO items, GRNs | 1 |
| `part-requests` | part requests, quotes | 2 |
| `logistics` | riders, delivery zones, logistics jobs, job events, proof of delivery, COD collections, rider earnings, payouts | 1 (rider self-service 3) |
| `pos` | registers, shifts, cash movements, approvals (manager overrides) | 1 |
| `finance` | ledger accounts, journal entries/lines, supplier payables, VAT reports | 1 |
| `returns` | RMAs, RMA items | 2 |
| `promotions` | promotions, promo redemptions | 2 |
| `loyalty` | loyalty accounts, transactions | 2 |
| `reviews` | reviews | 2 |
| `notifications` | notification templates, notification log, user preferences | 1 |
| `files` | file objects (S3 metadata) | 1 |
| `reports` | read-only reporting queries, exports | 1–2 |
| `settings` | key/value business settings (thresholds, fees, cut-off times) | 0 |

---

## 5. Project structure

```
myspares-backend/
├── docker-compose.yml               # postgres, redis, opensearch, minio, mailpit
├── Dockerfile                       # multi-stage: deps → build → runtime (non-root user)
├── package.json
├── tsconfig.json
├── .env.example                     # every env var documented (see §16.1)
├── prisma/
│   ├── schema.prisma
│   ├── migrations/                  # generated; never edit an applied migration
│   └── seed/                        # roles/permissions, ledger accounts, settings, demo data
├── docs/
│   ├── DECISIONS.md                 # ADR-style log of choices made during the build
│   └── RUNBOOK.md                   # ops procedures (reconciliation, stuck jobs, payment issues)
├── src/
│   ├── server.ts                    # HTTP entry: builds app, listens
│   ├── worker.ts                    # Worker entry: queues, schedulers, outbox relay
│   ├── app/
│   │   ├── build-app.ts             # creates Fastify instance, registers plugins + module routes
│   │   ├── container.ts             # composition root
│   │   └── plugins/                 # auth, rbac, error-handler, request-context, swagger, rate-limit, socket
│   ├── config/
│   │   └── config.ts                # Zod-validated env → typed Config (fail fast on boot)
│   ├── shared/
│   │   ├── db/                      # prisma client, withTx, sql helpers
│   │   ├── errors/                  # AppError, error codes registry
│   │   ├── money/                   # Money helpers (cents, bps, VAT split, rounding)
│   │   ├── time/                    # EAT helpers, business-hours, cut-off logic
│   │   ├── ids/                     # human-readable number generators (ORD-, PO-, GRN-…)
│   │   ├── pagination/              # cursor encode/decode
│   │   ├── crypto/                  # AES-256-GCM field encryption, OTP/code generation + hashing
│   │   ├── queue/                   # queue names registry, BullMQ factory
│   │   ├── events/                  # outbox service, event type registry
│   │   ├── auth/                    # permission constants, role → permission map
│   │   └── state-machine/           # generic transition helper
│   ├── integrations/                # adapters: mpesa, stripe, africastalking, sendgrid, twilio, s3, opensearch, tecdoc, etims
│   │   └── <provider>/{client.ts, types.ts, fake.ts}
│   ├── modules/
│   │   └── <module>/
│   │       ├── <module>.routes.ts
│   │       ├── <module>.handlers.ts
│   │       ├── <module>.service.ts
│   │       ├── <module>.repository.ts
│   │       ├── <module>.schemas.ts
│   │       ├── <module>.serializers.ts
│   │       ├── <module>.domain.ts      # and/or <entity>.machine.ts
│   │       ├── <module>.events.ts
│   │       ├── <module>.jobs.ts        # BullMQ processors owned by this module (optional)
│   │       └── __tests__/
│   │           ├── <module>.domain.test.ts
│   │           └── <module>.int.test.ts
│   └── jobs/                        # scheduler registration (repeatable jobs)
└── test/
    ├── setup/                       # testcontainers bootstrap, db reset, factories
    └── e2e/                         # full journeys (§15.3)
```

**Every integration has a `fake.ts`** used in tests and in local dev when `INTEGRATIONS_MODE=fake`. The fake records calls and can simulate success, failure, and delayed callbacks.

---

## 6. Coding conventions

### 6.1 TypeScript
- `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`. No `any` (use `unknown` + narrowing). No non-null `!` except in tests.
- ESM modules. Named exports only (no default exports).
- File names `kebab-case`, classes `PascalCase`, functions/vars `camelCase`, constants `SCREAMING_SNAKE_CASE`, DB columns `snake_case` (Prisma `@map`), JSON API fields `camelCase`.

### 6.2 Errors
All thrown business errors are `AppError` with a **registered code**:

```ts
// src/shared/errors/codes.ts
export const ErrorCodes = {
  VALIDATION_FAILED:        { status: 400 },
  UNAUTHENTICATED:          { status: 401 },
  TWO_FACTOR_REQUIRED:      { status: 401 },
  FORBIDDEN:                { status: 403 },
  NOT_FOUND:                { status: 404 },
  CONFLICT:                 { status: 409 },
  INVALID_STATE_TRANSITION: { status: 409 },
  INSUFFICIENT_STOCK:       { status: 409 },
  RESERVATION_EXPIRED:      { status: 409 },
  PRICE_BELOW_MARGIN_FLOOR: { status: 422 },
  APPROVAL_REQUIRED:        { status: 422 },
  PAYMENT_FAILED:           { status: 402 },
  IDEMPOTENCY_CONFLICT:     { status: 409 },
  RATE_LIMITED:             { status: 429 },
  INTEGRATION_UNAVAILABLE:  { status: 503 },
  INTERNAL:                 { status: 500 },
} as const;
```

Error response shape (everywhere, via the global error handler):

```json
{
  "error": {
    "code": "INSUFFICIENT_STOCK",
    "message": "Only 2 units of BRK-PAD-0042 are available.",
    "details": { "productId": "…", "requested": 3, "available": 2 },
    "requestId": "req_01J…"
  }
}
```

Never leak stack traces, SQL, or internal IDs of other entities in production errors. Unknown errors → `INTERNAL`, full detail logged server-side only.

### 6.3 Responses
- Single resource: `{ "data": { ... } }`
- List: `{ "data": [ ... ], "page": { "nextCursor": "…", "limit": 25 } }` — **cursor pagination** by default (`?limit=25&cursor=…`), max limit 100. Admin tables that need "page X of Y" may use `?page=&pageSize=` with a `total` (only on indexed queries).
- Timestamps: ISO-8601 UTC strings. Money: `{ "amountCents": 450000, "currency": "KES" }` or plain `*Cents` integer fields — be consistent within a DTO (prefer `*Cents` integers).

### 6.4 Validation
- Every route declares `body`, `querystring`, `params`, and `response` Zod schemas. Response schemas also strip unexpected fields — a second line of defence for confidentiality.
- Phone numbers normalised to E.164 (`+2547XXXXXXXX`) with `libphonenumber-js`. VIN: 17 chars, `[A-HJ-NPR-Z0-9]`, no I/O/Q.

### 6.5 Naming of human-readable numbers
Generated from Postgres sequences, formatted in `src/shared/ids`:

| Entity | Format | Example |
|---|---|---|
| Order | `ORD-YYMMDD-NNNNN` | `ORD-261010-00042` |
| Purchase order | `PO-YYMM-NNNNN` | `PO-2610-00113` |
| GRN | `GRN-YYMM-NNNNN` | |
| Logistics job | `JOB-YYMMDD-NNNN` | |
| Part request | `PR-YYMM-NNNNN` | |
| RMA | `RMA-YYMM-NNNNN` | |
| Receipt (POS) | `RCT-<register>-NNNNNN` | |
| Supplier | `SUP-NNNN` | |
| Rider | `RDR-NNNN` | |

Internal primary keys are UUIDs. Human numbers are `UNIQUE` and used in UIs, SMS, and PDFs.

### 6.6 Serializers and audiences (confidentiality by construction)

Each module exports serializers per audience:

```ts
export const productSerializers = {
  public:   (p: ProductWithRelations, ctx: PricingContext) => PublicProductDto,   // no cost, no supplier, no margin
  staff:    (p: ProductWithRelations) => StaffProductDto,                          // cost/margin only if permission `pricing:view_cost`
};
```

- Customer/public DTOs are built from **allow-lists**, never by deleting fields from a full row.
- A test (`confidentiality.int.test.ts`) crawls all customer-facing endpoints with seeded data and asserts no response contains: supplier names/IDs, `cost`, `landedCost`, `margin`, `poNumber`, `grnNumber`, rider national ID.

### 6.7 Registries (no magic strings)
- `src/shared/auth/permissions.ts` — every permission.
- `src/shared/queue/queues.ts` — every queue name.
- `src/shared/events/event-types.ts` — every domain event.
- `src/shared/errors/codes.ts` — every error code.
- `src/config/config.ts` — every env var.
- `prisma/seed/settings.ts` — every business setting key with default.

### 6.8 Audit helper
```ts
await audit.record(tx, {
  actor,                         // { userId, role, ip, userAgent }
  action: 'order.status_changed',
  entityType: 'order', entityId: order.id,
  before: { status: 'PACKED' }, after: { status: 'DISPATCHED' },
  reason,                        // required for overrides, voids, adjustments, cancellations
});
```
Called inside the same transaction as the change. A Fastify `onResponse` hook additionally logs every **mutating staff/supplier request** (method, route, status, actor, IP) as a coarse safety net.

---

## 7. Data model (Prisma schema)

This is the **Phase 0–1 core**. Phase 2+ entities are listed in §7.3 — add them in their milestone. Keep naming as given; other sections of this guide refer to these names.

### 7.1 Core schema

Conventions: `id String @id @default(uuid()) @db.Uuid`; `createdAt`/`updatedAt` on every table; `@@map("snake_case_plural")`; money as `Int` cents; percentages as `Int` basis points; soft-delete only where stated (`deletedAt`).

> After writing the Prisma schema, add a raw SQL migration for the `CHECK` constraints, partial indexes, sequences, and `tsvector`/trigram indexes that Prisma can't express (listed in §7.2).

```prisma
generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["typedSql"]
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ───────────────────────────── Identity & access ─────────────────────────────

enum UserType {
  CUSTOMER        // B2C
  TRADE_CUSTOMER  // B2B (garage, workshop, fleet)
  STAFF
  SUPPLIER_USER
  RIDER
}

enum UserStatus {
  PENDING
  ACTIVE
  SUSPENDED
  DELETED // anonymised
}

model User {
  id              String     @id @default(uuid()) @db.Uuid
  type            UserType
  status          UserStatus @default(ACTIVE)
  email           String?    @unique
  phone           String?    @unique // E.164
  passwordHash    String?    @map("password_hash")
  firstName       String?    @map("first_name")
  lastName        String?    @map("last_name")
  emailVerifiedAt DateTime?  @map("email_verified_at")
  phoneVerifiedAt DateTime?  @map("phone_verified_at")
  totpSecretEnc   String?    @map("totp_secret_enc") // AES-256-GCM encrypted
  totpEnabledAt   DateTime?  @map("totp_enabled_at")
  lastLoginAt     DateTime?  @map("last_login_at")
  supplierId      String?    @map("supplier_id") @db.Uuid // when type = SUPPLIER_USER
  riderId         String?    @unique @map("rider_id") @db.Uuid // when type = RIDER
  createdAt       DateTime   @default(now()) @map("created_at")
  updatedAt       DateTime   @updatedAt @map("updated_at")

  roles          UserRole[]
  refreshTokens  RefreshToken[]
  addresses      Address[]
  garage         GarageVehicle[]
  customerProfile CustomerProfile?
  supplier       Supplier? @relation(fields: [supplierId], references: [id])
  rider          Rider?    @relation(fields: [riderId], references: [id])

  @@map("users")
}

model Role {
  id          String           @id @default(uuid()) @db.Uuid
  key         String           @unique // e.g. STORE_MANAGER
  name        String
  permissions RolePermission[]
  users       UserRole[]
  @@map("roles")
}

model Permission {
  id    String           @id @default(uuid()) @db.Uuid
  key   String           @unique // e.g. orders:update_status
  roles RolePermission[]
  @@map("permissions")
}

model RolePermission {
  roleId       String     @map("role_id") @db.Uuid
  permissionId String     @map("permission_id") @db.Uuid
  role         Role       @relation(fields: [roleId], references: [id], onDelete: Cascade)
  permission   Permission @relation(fields: [permissionId], references: [id], onDelete: Cascade)
  @@id([roleId, permissionId])
  @@map("role_permissions")
}

model UserRole {
  userId String @map("user_id") @db.Uuid
  roleId String @map("role_id") @db.Uuid
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  role   Role   @relation(fields: [roleId], references: [id], onDelete: Cascade)
  @@id([userId, roleId])
  @@map("user_roles")
}

model RefreshToken {
  id         String    @id @default(uuid()) @db.Uuid
  userId     String    @map("user_id") @db.Uuid
  familyId   String    @map("family_id") @db.Uuid // rotation family; reuse → revoke family
  tokenHash  String    @unique @map("token_hash") // SHA-256 of opaque token
  expiresAt  DateTime  @map("expires_at")
  revokedAt  DateTime? @map("revoked_at")
  replacedBy String?   @map("replaced_by") @db.Uuid
  ip         String?
  userAgent  String?   @map("user_agent")
  createdAt  DateTime  @default(now()) @map("created_at")
  user       User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId])
  @@map("refresh_tokens")
}

enum OtpPurpose {
  LOGIN
  VERIFY_PHONE
  RESET_PASSWORD
}

model OtpCode {
  id        String     @id @default(uuid()) @db.Uuid
  phone     String
  purpose   OtpPurpose
  codeHash  String     @map("code_hash")
  attempts  Int        @default(0)
  expiresAt DateTime   @map("expires_at")
  usedAt    DateTime?  @map("used_at")
  createdAt DateTime   @default(now()) @map("created_at")
  @@index([phone, purpose])
  @@map("otp_codes")
}

enum CustomerTier {
  RETAIL
  TRADE_BRONZE
  TRADE_SILVER
  TRADE_GOLD
}

model CustomerProfile {
  userId          String       @id @map("user_id") @db.Uuid
  tier            CustomerTier @default(RETAIL)
  businessName    String?      @map("business_name")
  kraPin          String?      @map("kra_pin")
  creditLimitCents Int         @default(0) @map("credit_limit_cents")
  paymentTermsDays Int         @default(0) @map("payment_terms_days")
  isWalkInOnly    Boolean      @default(false) @map("is_walk_in_only") // created at POS
  marketingOptIn  Boolean      @default(false) @map("marketing_opt_in")
  user            User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@map("customer_profiles")
}

model Address {
  id           String   @id @default(uuid()) @db.Uuid
  userId       String   @map("user_id") @db.Uuid
  label        String?
  recipientName String  @map("recipient_name")
  phone        String
  line1        String
  line2        String?
  area         String   // e.g. Westlands
  city         String   @default("Nairobi")
  lat          Float?
  lng          Float?
  placeId      String?  @map("place_id") // Google Places
  deliveryZoneId String? @map("delivery_zone_id") @db.Uuid
  isDefault    Boolean  @default(false) @map("is_default")
  createdAt    DateTime @default(now()) @map("created_at")
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId])
  @@map("addresses")
}

// ───────────────────────────── Vehicles & fitment ─────────────────────────────

model VehicleMake {
  id     String         @id @default(uuid()) @db.Uuid
  name   String         @unique
  slug   String         @unique
  models VehicleModel[]
  @@map("vehicle_makes")
}

model VehicleModel {
  id       String      @id @default(uuid()) @db.Uuid
  makeId   String      @map("make_id") @db.Uuid
  name     String
  slug     String
  make     VehicleMake @relation(fields: [makeId], references: [id])
  vehicles Vehicle[]
  @@unique([makeId, slug])
  @@map("vehicle_models")
}

model Vehicle {
  id          String       @id @default(uuid()) @db.Uuid
  modelId     String       @map("model_id") @db.Uuid
  yearFrom    Int          @map("year_from")
  yearTo      Int          @map("year_to")
  engine      String?      // e.g. "1.8L 2ZR-FE Petrol"
  variant     String?      // trim / body
  externalRef String?      @unique @map("external_ref") // TecDoc/AutoSync id
  vinPattern  String?      @map("vin_pattern")
  model       VehicleModel @relation(fields: [modelId], references: [id])
  fitments    ProductFitment[]
  @@index([modelId, yearFrom, yearTo])
  @@map("vehicles")
}

model GarageVehicle {
  id        String   @id @default(uuid()) @db.Uuid
  userId    String   @map("user_id") @db.Uuid
  vehicleId String   @map("vehicle_id") @db.Uuid
  year      Int
  vin       String?
  nickname  String?
  isActive  Boolean  @default(false) @map("is_active")
  createdAt DateTime @default(now()) @map("created_at")
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId])
  @@map("garage_vehicles") // max 10 per user — enforced in service
}

// ───────────────────────────── Catalogue ─────────────────────────────

enum ProductStatus {
  DRAFT
  ACTIVE
  ARCHIVED
}

enum QualityGrade {
  ECONOMY
  STANDARD
  PREMIUM
}

enum PartOrigin {
  OEM
  OES
  AFTERMARKET
}

enum PartCondition {
  NEW
  USED
  REMANUFACTURED
}

model Category {
  id       String     @id @default(uuid()) @db.Uuid
  parentId String?    @map("parent_id") @db.Uuid
  name     String
  slug     String     @unique
  sortOrder Int       @default(0) @map("sort_order")
  parent   Category?  @relation("CategoryTree", fields: [parentId], references: [id])
  children Category[] @relation("CategoryTree")
  products Product[]
  @@map("categories")
}

model Brand {
  id       String    @id @default(uuid()) @db.Uuid
  name     String    @unique
  slug     String    @unique
  logoFileId String? @map("logo_file_id") @db.Uuid
  products Product[]
  @@map("brands")
}

model Product {
  id                 String        @id @default(uuid()) @db.Uuid
  sku                String        @unique
  slug               String        @unique
  name               String
  description        String?
  brandId            String?       @map("brand_id") @db.Uuid
  categoryId         String        @map("category_id") @db.Uuid
  status             ProductStatus @default(DRAFT)
  qualityGrade       QualityGrade  @default(STANDARD) @map("quality_grade")
  origin             PartOrigin    @default(AFTERMARKET)
  condition          PartCondition @default(NEW)
  barcode            String?       @unique

  // Pricing (all cents). Cost fields are staff-only.
  retailPriceCents   Int           @map("retail_price_cents")       // VAT-inclusive
  salePriceCents     Int?          @map("sale_price_cents")
  saleStartsAt       DateTime?     @map("sale_starts_at")
  saleEndsAt         DateTime?     @map("sale_ends_at")
  tradePriceCents    Int?          @map("trade_price_cents")        // default trade price; tiers override
  lastCostCents      Int?          @map("last_cost_cents")          // last landed cost (from GRN)
  avgCostCents       Int?          @map("avg_cost_cents")           // weighted average landed cost
  coreChargeCents    Int           @default(0) @map("core_charge_cents")
  vatRateBps         Int           @default(1600) @map("vat_rate_bps")
  minMarginBps       Int?          @map("min_margin_bps")           // overrides global floor

  // Inventory policy
  lowStockThreshold  Int           @default(3) @map("low_stock_threshold")
  reorderPoint       Int           @default(0) @map("reorder_point")
  reorderQty         Int           @default(0) @map("reorder_qty")
  sourcingLeadTimeMins Int?        @map("sourcing_lead_time_mins")  // learned/estimated
  isSourceable       Boolean       @default(true) @map("is_sourceable")

  // Content
  specs              Json?         // [{label, value}]
  warrantyText       String?       @map("warranty_text")
  seoTitle           String?       @map("seo_title")
  seoDescription     String?       @map("seo_description")
  weightGrams        Int?          @map("weight_grams")

  createdAt          DateTime      @default(now()) @map("created_at")
  updatedAt          DateTime      @updatedAt @map("updated_at")

  brand        Brand?           @relation(fields: [brandId], references: [id])
  category     Category         @relation(fields: [categoryId], references: [id])
  partNumbers  PartNumber[]
  fitments     ProductFitment[]
  media        ProductMedia[]
  inventory    InventoryLevel[]
  supplierItems SupplierCatalogItem[]

  @@index([categoryId, status])
  @@index([brandId])
  @@map("products")
}

enum PartNumberType {
  OEM
  OES
  AFTERMARKET
  SUPERSEDED
}

model PartNumber {
  id           String         @id @default(uuid()) @db.Uuid
  productId    String         @map("product_id") @db.Uuid
  type         PartNumberType
  number       String
  normalized   String         // uppercase, no spaces/dashes — used for lookup
  manufacturer String?
  product      Product        @relation(fields: [productId], references: [id], onDelete: Cascade)
  @@unique([productId, type, normalized])
  @@index([normalized])
  @@map("part_numbers")
}

model ProductFitment {
  productId    String   @map("product_id") @db.Uuid
  vehicleId    String   @map("vehicle_id") @db.Uuid
  notes        String?
  position     String?  // Front/Rear/Left/Right
  verified     Boolean  @default(false)
  product      Product  @relation(fields: [productId], references: [id], onDelete: Cascade)
  vehicle      Vehicle  @relation(fields: [vehicleId], references: [id])
  @@id([productId, vehicleId])
  @@index([vehicleId])
  @@map("product_fitments")
}

model ProductMedia {
  id        String  @id @default(uuid()) @db.Uuid
  productId String  @map("product_id") @db.Uuid
  fileId    String  @map("file_id") @db.Uuid
  kind      String  @default("IMAGE") // IMAGE | IMAGE_360 | PDF_GUIDE | VIDEO_URL
  sortOrder Int     @default(0) @map("sort_order")
  isPrimary Boolean @default(false) @map("is_primary")
  product   Product @relation(fields: [productId], references: [id], onDelete: Cascade)
  @@index([productId, sortOrder])
  @@map("product_media") // max 20 images per product — enforced in service
}

// ───────────────────────────── Inventory ─────────────────────────────

model Location {
  id        String  @id @default(uuid()) @db.Uuid
  code      String  @unique // e.g. HUB-NBO
  name      String
  isDefault Boolean @default(false) @map("is_default")
  address   String?
  bins      Bin[]
  @@map("locations")
}

model Bin {
  id         String   @id @default(uuid()) @db.Uuid
  locationId String   @map("location_id") @db.Uuid
  code       String   // e.g. A-03-B2
  location   Location @relation(fields: [locationId], references: [id])
  @@unique([locationId, code])
  @@map("bins")
}

model InventoryLevel {
  productId  String   @map("product_id") @db.Uuid
  locationId String   @map("location_id") @db.Uuid
  binId      String?  @map("bin_id") @db.Uuid
  onHand     Int      @default(0) @map("on_hand")   // physically present (incl. allocated-but-not-shipped)
  reserved   Int      @default(0)                    // held for orders not yet shipped/handed over
  version    Int      @default(0)                    // bumped on every change (optimistic checks, cache busting)
  updatedAt  DateTime @updatedAt @map("updated_at")
  product    Product  @relation(fields: [productId], references: [id])
  @@id([productId, locationId])
  @@map("inventory_levels")
  // CHECK (on_hand >= 0), CHECK (reserved >= 0), CHECK (reserved <= on_hand)  -- raw SQL migration
  // available = on_hand - reserved (computed, never stored)
}

enum StockMovementReason {
  SALE              // shipped / handed over
  GRN_RECEIPT       // received from supplier
  ADJUSTMENT_DAMAGED
  ADJUSTMENT_COUNTED
  ADJUSTMENT_STOLEN
  ADJUSTMENT_PROMO_WRITE_OFF
  ADJUSTMENT_FOUND
  CUSTOMER_RETURN
  DELIVERY_RETURNED // failed delivery came back to the hub
  RETURN_TO_SUPPLIER
  TRANSFER_IN
  TRANSFER_OUT
}

model StockMovement {
  id           String              @id @default(uuid()) @db.Uuid
  productId    String              @map("product_id") @db.Uuid
  locationId   String              @map("location_id") @db.Uuid
  quantity     Int                 // signed: +in, -out
  reason       StockMovementReason
  unitCostCents Int?               @map("unit_cost_cents")
  referenceType String?            @map("reference_type") // ORDER | GRN | STOCKTAKE | RMA | ADJUSTMENT
  referenceId  String?             @map("reference_id") @db.Uuid
  note         String?
  actorId      String?             @map("actor_id") @db.Uuid
  createdAt    DateTime            @default(now()) @map("created_at")
  @@index([productId, createdAt])
  @@index([referenceType, referenceId])
  @@map("stock_movements") // append-only. Never UPDATE or DELETE.
}

enum ReservationStatus {
  ACTIVE      // holding stock
  COMMITTED   // converted to sale on ship/handover
  RELEASED    // expired or cancelled
}

model StockReservation {
  id          String            @id @default(uuid()) @db.Uuid
  productId   String            @map("product_id") @db.Uuid
  locationId  String            @map("location_id") @db.Uuid
  orderItemId String            @map("order_item_id") @db.Uuid
  quantity    Int
  status      ReservationStatus @default(ACTIVE)
  expiresAt   DateTime?         @map("expires_at") // set while order awaits payment; null once paid
  createdAt   DateTime          @default(now()) @map("created_at")
  updatedAt   DateTime          @updatedAt @map("updated_at")
  @@index([status, expiresAt])
  @@index([orderItemId])
  @@map("stock_reservations")
}

model Stocktake {
  id          String   @id @default(uuid()) @db.Uuid
  locationId  String   @map("location_id") @db.Uuid
  scope       String   // FULL | BIN | SPOT
  status      String   @default("OPEN") // OPEN | SUBMITTED | APPROVED | CANCELLED
  startedById String   @map("started_by_id") @db.Uuid
  approvedById String? @map("approved_by_id") @db.Uuid
  createdAt   DateTime @default(now()) @map("created_at")
  closedAt    DateTime? @map("closed_at")
  lines       StocktakeLine[]
  @@map("stocktakes")
}

model StocktakeLine {
  id            String    @id @default(uuid()) @db.Uuid
  stocktakeId   String    @map("stocktake_id") @db.Uuid
  productId     String    @map("product_id") @db.Uuid
  binId         String?   @map("bin_id") @db.Uuid
  systemQty     Int       @map("system_qty") // snapshot at count time
  countedQty    Int       @map("counted_qty")
  variance      Int       // counted - system
  countedById   String    @map("counted_by_id") @db.Uuid
  stocktake     Stocktake @relation(fields: [stocktakeId], references: [id], onDelete: Cascade)
  @@unique([stocktakeId, productId])
  @@map("stocktake_lines")
}

// ───────────────────────────── Cart ─────────────────────────────

model Cart {
  id         String     @id @default(uuid()) @db.Uuid
  userId     String?    @unique @map("user_id") @db.Uuid
  guestToken String?    @unique @map("guest_token")
  promoCode  String?    @map("promo_code")
  updatedAt  DateTime   @updatedAt @map("updated_at")
  items      CartItem[]
  @@map("carts")
}

model CartItem {
  id        String  @id @default(uuid()) @db.Uuid
  cartId    String  @map("cart_id") @db.Uuid
  productId String  @map("product_id") @db.Uuid
  quantity  Int
  garageVehicleId String? @map("garage_vehicle_id") @db.Uuid
  cart      Cart    @relation(fields: [cartId], references: [id], onDelete: Cascade)
  @@unique([cartId, productId])
  @@map("cart_items") // NOTE: cart never reserves stock (BR-002)
}

// ───────────────────────────── Orders ─────────────────────────────

enum OrderChannel {
  ONLINE
  WALK_IN
}

enum OrderStatus {
  PENDING_PAYMENT     // created at checkout; reservation held up to 30 min
  PLACED              // payment/deposit captured or COD accepted (BR-001)
  CONFIRMED           // staff/system confirmed; ready to route
  SOURCING            // ≥1 item awaiting supplier
  PICKING
  PACKED
  READY_FOR_COLLECTION // click & collect / walk-in sourced
  DISPATCHED
  DELIVERED
  COMPLETED           // walk-in handed over / collected, or delivered + settled
  CANCELLED
  RETURNED
}

enum PaymentStatus {
  UNPAID
  DEPOSIT_PAID
  PAID
  PARTIALLY_REFUNDED
  REFUNDED
  COD_PENDING
}

enum DeliveryMethod {
  STANDARD
  EXPRESS
  CLICK_AND_COLLECT
  COUNTER          // walk-in immediate
  COURIER          // long distance (Phase 2)
}

model Order {
  id                 String         @id @default(uuid()) @db.Uuid
  number             String         @unique
  channel            OrderChannel
  status             OrderStatus    @default(PENDING_PAYMENT)
  paymentStatus      PaymentStatus  @default(UNPAID) @map("payment_status")
  customerId         String?        @map("customer_id") @db.Uuid // null = anonymous walk-in
  guestEmail         String?        @map("guest_email")
  guestPhone         String?        @map("guest_phone")
  deliveryMethod     DeliveryMethod @map("delivery_method")
  deliveryAddress    Json?          @map("delivery_address") // snapshot
  deliveryZoneId     String?        @map("delivery_zone_id") @db.Uuid
  isCod              Boolean        @default(false) @map("is_cod")
  hasSourcedItems    Boolean        @default(false) @map("has_sourced_items")
  sourcingAcceptedAt DateTime?      @map("sourcing_accepted_at") // customer accepted lead time
  promisedBy         DateTime?      @map("promised_by")

  subtotalCents      Int            @map("subtotal_cents")
  discountCents      Int            @default(0) @map("discount_cents")
  deliveryFeeCents   Int            @default(0) @map("delivery_fee_cents")
  vatCents           Int            @map("vat_cents")       // VAT portion contained in total
  totalCents         Int            @map("total_cents")
  depositRequiredCents Int          @default(0) @map("deposit_required_cents")
  amountPaidCents    Int            @default(0) @map("amount_paid_cents")
  amountRefundedCents Int           @default(0) @map("amount_refunded_cents")
  promoCode          String?        @map("promo_code")

  createdById        String?        @map("created_by_id") @db.Uuid // staff (POS) or null
  shiftId            String?        @map("shift_id") @db.Uuid      // POS
  cancelledReason    String?        @map("cancelled_reason")
  idempotencyKey     String?        @unique @map("idempotency_key")
  version            Int            @default(0)
  placedAt           DateTime?      @map("placed_at")
  deliveredAt        DateTime?      @map("delivered_at")
  createdAt          DateTime       @default(now()) @map("created_at")
  updatedAt          DateTime       @updatedAt @map("updated_at")

  items         OrderItem[]
  statusHistory OrderStatusEvent[]
  payments      Payment[]
  notes         OrderNote[]

  @@index([status, createdAt])
  @@index([customerId, createdAt])
  @@index([channel, createdAt])
  @@map("orders")
}

enum ItemFulfilmentSource {
  STOCK
  SOURCED
  PRE_ORDER
}

enum ItemSourcingStatus {
  NOT_REQUIRED
  AWAITING_PO
  PO_SENT
  SUPPLIER_CONFIRMED
  RIDER_ASSIGNED
  COLLECTED
  RECEIVED       // GRN passed and allocated
  FAILED         // supplier rejected / QC failed — needs re-sourcing
}

model OrderItem {
  id               String               @id @default(uuid()) @db.Uuid
  orderId          String               @map("order_id") @db.Uuid
  productId        String?              @map("product_id") @db.Uuid // null for part-request custom items
  sku              String               // snapshot
  name             String               // snapshot
  quantity         Int
  unitPriceCents   Int                  @map("unit_price_cents")   // VAT-inclusive, after item-level discounts
  vatRateBps       Int                  @map("vat_rate_bps")
  unitCostCents    Int?                 @map("unit_cost_cents")    // landed cost — set at fulfilment (staff-only)
  source           ItemFulfilmentSource
  sourcingStatus   ItemSourcingStatus   @default(NOT_REQUIRED) @map("sourcing_status")
  leadTimeMins     Int?                 @map("lead_time_mins")
  purchaseOrderItemId String?           @map("purchase_order_item_id") @db.Uuid
  priceOverrideApprovalId String?       @map("price_override_approval_id") @db.Uuid
  order            Order                @relation(fields: [orderId], references: [id], onDelete: Cascade)
  @@index([orderId])
  @@index([sourcingStatus])
  @@map("order_items")
}

model OrderStatusEvent {
  id         String      @id @default(uuid()) @db.Uuid
  orderId    String      @map("order_id") @db.Uuid
  fromStatus OrderStatus? @map("from_status")
  toStatus   OrderStatus @map("to_status")
  actorId    String?     @map("actor_id") @db.Uuid
  note       String?
  customerVisibleText String? @map("customer_visible_text") // "Rider on the way to supplier" etc.
  createdAt  DateTime    @default(now()) @map("created_at")
  order      Order       @relation(fields: [orderId], references: [id], onDelete: Cascade)
  @@index([orderId, createdAt])
  @@map("order_status_events")
}

model OrderNote {
  id        String   @id @default(uuid()) @db.Uuid
  orderId   String   @map("order_id") @db.Uuid
  authorId  String   @map("author_id") @db.Uuid
  body      String
  isInternal Boolean @default(true) @map("is_internal")
  createdAt DateTime @default(now()) @map("created_at")
  order     Order    @relation(fields: [orderId], references: [id], onDelete: Cascade)
  @@map("order_notes")
}

// ───────────────────────────── Payments ─────────────────────────────

enum PaymentMethod {
  MPESA_STK
  MPESA_PAYBILL     // manual paybill/till reference
  CARD_STRIPE
  CARD_POS_TERMINAL
  CASH
  BANK_TRANSFER
  TRADE_CREDIT
  COD               // cash collected by rider
}

enum PaymentKind {
  FULL
  DEPOSIT
  BALANCE
}

enum PaymentState {
  INITIATED
  PENDING        // awaiting callback
  SUCCEEDED
  FAILED
  CANCELLED
  REFUNDED
}

model Payment {
  id              String        @id @default(uuid()) @db.Uuid
  orderId         String        @map("order_id") @db.Uuid
  method          PaymentMethod
  kind            PaymentKind
  state           PaymentState  @default(INITIATED)
  amountCents     Int           @map("amount_cents")
  phone           String?       // M-Pesa payer
  providerRef     String?       @unique @map("provider_ref")       // MpesaReceiptNumber / Stripe PI id
  providerRequestId String?     @unique @map("provider_request_id") // CheckoutRequestID
  failureReason   String?       @map("failure_reason")
  receivedById    String?       @map("received_by_id") @db.Uuid   // staff for cash/POS
  shiftId         String?       @map("shift_id") @db.Uuid
  idempotencyKey  String?       @unique @map("idempotency_key")
  rawCallback     Json?         @map("raw_callback")
  succeededAt     DateTime?     @map("succeeded_at")
  createdAt       DateTime      @default(now()) @map("created_at")
  updatedAt       DateTime      @updatedAt @map("updated_at")
  order           Order         @relation(fields: [orderId], references: [id])
  @@index([orderId])
  @@index([state, createdAt])
  @@map("payments")
}

model Refund {
  id          String   @id @default(uuid()) @db.Uuid
  orderId     String   @map("order_id") @db.Uuid
  paymentId   String   @map("payment_id") @db.Uuid
  rmaId       String?  @map("rma_id") @db.Uuid  // required by BR-009 for return refunds
  amountCents Int      @map("amount_cents")
  state       PaymentState @default(INITIATED)
  reason      String
  approvedById String  @map("approved_by_id") @db.Uuid
  providerRef String?  @unique @map("provider_ref")
  createdAt   DateTime @default(now()) @map("created_at")
  @@map("refunds")
}

model WebhookEvent {
  id          String   @id @default(uuid()) @db.Uuid
  provider    String   // MPESA | STRIPE | AT | SENDGRID
  externalId  String   @map("external_id")
  payload     Json
  processedAt DateTime? @map("processed_at")
  error       String?
  createdAt   DateTime @default(now()) @map("created_at")
  @@unique([provider, externalId]) // dedupe
  @@map("webhook_events")
}

// ───────────────────────────── Procurement ─────────────────────────────

enum SupplierType {
  PRIMARY
  SECONDARY
  SPECIALIST
}

enum SupplierStatus {
  ACTIVE
  SUSPENDED
  BLACKLISTED
}

enum PaymentTerms {
  ON_COLLECTION
  NET_7
  NET_14
  NET_30
}

model Supplier {
  id               String         @id @default(uuid()) @db.Uuid
  code             String         @unique // SUP-0001
  name             String
  type             SupplierType
  status           SupplierStatus @default(ACTIVE)
  statusReason     String?        @map("status_reason")
  phone            String
  email            String?
  whatsapp         String?
  addressLine      String         @map("address_line")
  area             String
  lat              Float?
  lng              Float?
  categories       String[]       // category slugs they specialise in
  paymentTerms     PaymentTerms   @default(ON_COLLECTION) @map("payment_terms")
  payoutMethod     String         @default("MPESA") @map("payout_method") // MPESA | BANK | CASH
  payoutDetailsEnc String?        @map("payout_details_enc") // encrypted JSON (till/paybill/bank)
  typicalLeadTimeMins Int         @default(120) @map("typical_lead_time_mins")
  portalEnabled    Boolean        @default(false) @map("portal_enabled")
  // rolling performance (recomputed nightly)
  fulfilmentRateBps Int?          @map("fulfilment_rate_bps")
  avgResponseMins  Int?           @map("avg_response_mins")
  qualityPassRateBps Int?         @map("quality_pass_rate_bps")
  createdAt        DateTime       @default(now()) @map("created_at")
  updatedAt        DateTime       @updatedAt @map("updated_at")
  contacts         SupplierContact[]
  catalogItems     SupplierCatalogItem[]
  purchaseOrders   PurchaseOrder[]
  users            User[]
  @@map("suppliers")
}

model SupplierContact {
  id         String   @id @default(uuid()) @db.Uuid
  supplierId String   @map("supplier_id") @db.Uuid
  name       String
  phone      String
  role       String?
  supplier   Supplier @relation(fields: [supplierId], references: [id], onDelete: Cascade)
  @@map("supplier_contacts")
}

model SupplierCatalogItem {
  id               String    @id @default(uuid()) @db.Uuid
  supplierId       String    @map("supplier_id") @db.Uuid
  productId        String?   @map("product_id") @db.Uuid // mapped to our product
  supplierSku      String?   @map("supplier_sku")
  partNumberNorm   String    @map("part_number_norm")
  description      String
  costCents        Int       @map("cost_cents")           // APPROVED price
  pendingCostCents Int?      @map("pending_cost_cents")   // supplier-submitted, awaiting admin approval
  availability     String    @default("UNKNOWN")          // IN_STOCK | LOW | OUT | UNKNOWN
  lastConfirmedAt  DateTime? @map("last_confirmed_at")
  updatedAt        DateTime  @updatedAt @map("updated_at")
  supplier         Supplier  @relation(fields: [supplierId], references: [id], onDelete: Cascade)
  product          Product?  @relation(fields: [productId], references: [id])
  @@unique([supplierId, partNumberNorm])
  @@index([productId])
  @@index([partNumberNorm])
  @@map("supplier_catalog_items")
}

enum PurchaseOrderKind {
  REACTIVE   // against a customer order / part request
  RESTOCK    // proactive, needs approval
}

enum PurchaseOrderStatus {
  DRAFT
  PENDING_APPROVAL      // restock POs
  SENT
  CONFIRMED_BY_SUPPLIER
  PARTIALLY_CONFIRMED
  REJECTED_BY_SUPPLIER
  RIDER_ASSIGNED
  COLLECTED
  RECEIVED              // GRN created (fully or partially, see items)
  INVOICED
  PAID
  CANCELLED
}

enum PoChannel {
  PORTAL
  EMAIL
  WHATSAPP
  PHONE
}

model PurchaseOrder {
  id               String              @id @default(uuid()) @db.Uuid
  number           String              @unique
  supplierId       String              @map("supplier_id") @db.Uuid
  kind             PurchaseOrderKind
  status           PurchaseOrderStatus @default(DRAFT)
  orderId          String?             @map("order_id") @db.Uuid        // reactive
  partRequestId    String?             @map("part_request_id") @db.Uuid
  sentVia          PoChannel?          @map("sent_via")
  sentAt           DateTime?           @map("sent_at")
  confirmedAt      DateTime?           @map("confirmed_at")
  requestedCollectionAt DateTime?      @map("requested_collection_at")
  supplierReadyAt  DateTime?           @map("supplier_ready_at")
  collectionCodeHash String?           @map("collection_code_hash")
  collectionCodeExpiresAt DateTime?    @map("collection_code_expires_at")
  totalCostCents   Int                 @default(0) @map("total_cost_cents")
  collectionFeeCents Int               @default(0) @map("collection_fee_cents") // allocated into landed cost
  otherCostsCents  Int                 @default(0) @map("other_costs_cents")    // duties etc.
  supplierInvoiceRef String?           @map("supplier_invoice_ref")
  paymentDueAt     DateTime?           @map("payment_due_at")
  approvedById     String?             @map("approved_by_id") @db.Uuid
  createdById      String              @map("created_by_id") @db.Uuid
  rejectionReason  String?             @map("rejection_reason")
  notes            String?
  version          Int                 @default(0)
  createdAt        DateTime            @default(now()) @map("created_at")
  updatedAt        DateTime            @updatedAt @map("updated_at")
  supplier         Supplier            @relation(fields: [supplierId], references: [id])
  items            PurchaseOrderItem[]
  grns             Grn[]
  @@index([status, createdAt])
  @@index([supplierId, status])
  @@index([orderId])
  @@map("purchase_orders")
}

model PurchaseOrderItem {
  id              String        @id @default(uuid()) @db.Uuid
  purchaseOrderId String        @map("purchase_order_id") @db.Uuid
  productId       String?       @map("product_id") @db.Uuid
  partNumber      String        @map("part_number")
  description     String
  quantity        Int
  confirmedQty    Int?          @map("confirmed_qty")
  receivedQty     Int           @default(0) @map("received_qty")
  unitCostCents   Int           @map("unit_cost_cents")
  orderItemId     String?       @map("order_item_id") @db.Uuid // reactive link
  purchaseOrder   PurchaseOrder @relation(fields: [purchaseOrderId], references: [id], onDelete: Cascade)
  @@map("purchase_order_items")
}

enum GrnStatus {
  PENDING
  PASSED
  PARTIAL_PASS
  FAILED
}

model Grn {
  id              String        @id @default(uuid()) @db.Uuid
  number          String        @unique
  purchaseOrderId String        @map("purchase_order_id") @db.Uuid
  status          GrnStatus     @default(PENDING)
  receivedById    String        @map("received_by_id") @db.Uuid
  logisticsJobId  String?       @map("logistics_job_id") @db.Uuid
  notes           String?
  createdAt       DateTime      @default(now()) @map("created_at")
  completedAt     DateTime?     @map("completed_at")
  purchaseOrder   PurchaseOrder @relation(fields: [purchaseOrderId], references: [id])
  lines           GrnLine[]
  @@map("grns")
}

model GrnLine {
  id                  String  @id @default(uuid()) @db.Uuid
  grnId               String  @map("grn_id") @db.Uuid
  purchaseOrderItemId String  @map("purchase_order_item_id") @db.Uuid
  receivedQty         Int     @map("received_qty")
  acceptedQty         Int     @map("accepted_qty")
  rejectedQty         Int     @map("rejected_qty")
  checks              Json    // { correctPart: bool, correctQty: bool, noDamage: bool }
  rejectionReason     String? @map("rejection_reason")
  grn                 Grn     @relation(fields: [grnId], references: [id], onDelete: Cascade)
  @@map("grn_lines")
}

// ───────────────────────────── Logistics ─────────────────────────────

enum RiderStatus {
  PENDING_APPROVAL
  ACTIVE
  SUSPENDED
  REMOVED
}

model Rider {
  id            String      @id @default(uuid()) @db.Uuid
  code          String      @unique
  name          String
  phone         String      @unique
  nationalIdEnc String      @map("national_id_enc") // encrypted
  bikePlate     String      @map("bike_plate")
  mpesaNumber   String      @map("mpesa_number")
  status        RiderStatus @default(PENDING_APPROVAL)
  statusReason  String?     @map("status_reason")
  isPreferred   Boolean     @default(false) @map("is_preferred")
  isOnDuty      Boolean     @default(false) @map("is_on_duty")
  ratingAvgX100 Int?        @map("rating_avg_x100") // 4.62 → 462
  createdAt     DateTime    @default(now()) @map("created_at")
  updatedAt     DateTime    @updatedAt @map("updated_at")
  jobs          LogisticsJob[]
  user          User?
  @@map("riders")
}

model DeliveryZone {
  id              String  @id @default(uuid()) @db.Uuid
  name            String  @unique // Westlands, Kilimani…
  feeType         String  @default("FLAT") @map("fee_type") // FLAT | PER_KM
  customerFeeCents Int    @map("customer_fee_cents")
  perKmCents      Int?    @map("per_km_cents")
  riderFeeCents   Int     @map("rider_fee_cents")        // what we pay the rider
  expressSurchargeCents Int @default(0) @map("express_surcharge_cents")
  isActive        Boolean @default(true) @map("is_active")
  polygon         Json?   // optional GeoJSON for auto-matching
  @@map("delivery_zones")
}

enum JobType {
  COLLECTION
  DELIVERY
}

enum JobStatus {
  CREATED
  ASSIGNED
  EN_ROUTE        // to supplier (collection) or to customer (delivery)
  COLLECTED       // collection only
  DELIVERED_TO_HUB // collection only
  CONFIRMED       // collection: GRN created
  DELIVERED       // delivery only
  CUSTOMER_CONFIRMED // delivery only (OTP / photo)
  FAILED
  CANCELLED
}

model LogisticsJob {
  id              String    @id @default(uuid()) @db.Uuid
  number          String    @unique
  type            JobType
  status          JobStatus @default(CREATED)
  riderId         String?   @map("rider_id") @db.Uuid
  purchaseOrderId String?   @map("purchase_order_id") @db.Uuid // COLLECTION
  orderId         String?   @map("order_id") @db.Uuid          // DELIVERY
  origin          Json      // { name, address, lat, lng, phone }
  destination     Json
  urgency         String    @default("NORMAL") // NORMAL | URGENT
  instructions    String?
  codAmountCents  Int       @default(0) @map("cod_amount_cents")
  deliveryOtpHash String?   @map("delivery_otp_hash")
  otpAttempts     Int       @default(0) @map("otp_attempts")
  proofFileId     String?   @map("proof_file_id") @db.Uuid // photo (Phase 1)
  riderFeeCents   Int       @default(0) @map("rider_fee_cents")
  etaAt           DateTime? @map("eta_at")
  assignedAt      DateTime? @map("assigned_at")
  startedAt       DateTime? @map("started_at")
  completedAt     DateTime? @map("completed_at")
  cancelReason    String?   @map("cancel_reason")
  createdById     String    @map("created_by_id") @db.Uuid
  version         Int       @default(0)
  createdAt       DateTime  @default(now()) @map("created_at")
  updatedAt       DateTime  @updatedAt @map("updated_at")
  rider           Rider?    @relation(fields: [riderId], references: [id])
  events          LogisticsJobEvent[]
  @@index([status, type])
  @@index([riderId, status])
  @@map("logistics_jobs")
}

model LogisticsJobEvent {
  id        String    @id @default(uuid()) @db.Uuid
  jobId     String    @map("job_id") @db.Uuid
  fromStatus JobStatus? @map("from_status")
  toStatus  JobStatus @map("to_status")
  actorId   String?   @map("actor_id") @db.Uuid
  lat       Float?
  lng       Float?
  note      String?
  createdAt DateTime  @default(now()) @map("created_at")
  job       LogisticsJob @relation(fields: [jobId], references: [id], onDelete: Cascade)
  @@map("logistics_job_events")
}

model CodCollection {
  id             String    @id @default(uuid()) @db.Uuid
  jobId          String    @unique @map("job_id") @db.Uuid
  orderId        String    @map("order_id") @db.Uuid
  riderId        String    @map("rider_id") @db.Uuid
  expectedCents  Int       @map("expected_cents")
  reportedCents  Int?      @map("reported_cents")  // rider says
  handedOverCents Int?     @map("handed_over_cents") // staff counted
  status         String    @default("OUTSTANDING") // OUTSTANDING | RECONCILED | DISCREPANCY
  collectedAt    DateTime  @map("collected_at")
  reconciledAt   DateTime? @map("reconciled_at")
  reconciledById String?   @map("reconciled_by_id") @db.Uuid
  note           String?
  @@index([riderId, status])
  @@map("cod_collections")
}

model RiderEarning {
  id          String   @id @default(uuid()) @db.Uuid
  riderId     String   @map("rider_id") @db.Uuid
  jobId       String?  @unique @map("job_id") @db.Uuid
  amountCents Int      @map("amount_cents") // negative for deductions
  type        String   // TRIP | BONUS | DEDUCTION
  reason      String?
  payoutId    String?  @map("payout_id") @db.Uuid
  createdAt   DateTime @default(now()) @map("created_at")
  @@index([riderId, payoutId])
  @@map("rider_earnings")
}

model Payout {
  id           String   @id @default(uuid()) @db.Uuid
  payeeType    String   @map("payee_type") // RIDER | SUPPLIER
  payeeId      String   @map("payee_id") @db.Uuid
  amountCents  Int      @map("amount_cents")
  method       String   // MPESA_B2C | BANK | CASH
  state        PaymentState @default(INITIATED)
  providerRef  String?  @unique @map("provider_ref")
  idempotencyKey String @unique @map("idempotency_key")
  approvedById String   @map("approved_by_id") @db.Uuid
  createdAt    DateTime @default(now()) @map("created_at")
  completedAt  DateTime? @map("completed_at")
  @@map("payouts")
}

// ───────────────────────────── POS ─────────────────────────────

model Register {
  id         String  @id @default(uuid()) @db.Uuid
  code       String  @unique // POS-01
  locationId String  @map("location_id") @db.Uuid
  isActive   Boolean @default(true) @map("is_active")
  @@map("registers")
}

model Shift {
  id               String    @id @default(uuid()) @db.Uuid
  registerId       String    @map("register_id") @db.Uuid
  openedById       String    @map("opened_by_id") @db.Uuid
  closedById       String?   @map("closed_by_id") @db.Uuid
  openingFloatCents Int      @map("opening_float_cents")
  expectedCashCents Int?     @map("expected_cash_cents")  // computed at close
  countedCashCents Int?      @map("counted_cash_cents")
  varianceCents    Int?      @map("variance_cents")
  status           String    @default("OPEN") // OPEN | CLOSED
  openedAt         DateTime  @default(now()) @map("opened_at")
  closedAt         DateTime? @map("closed_at")
  @@index([registerId, status])
  @@map("shifts") // partial unique index: one OPEN shift per register (raw SQL)
}

model CashMovement {
  id          String   @id @default(uuid()) @db.Uuid
  shiftId     String   @map("shift_id") @db.Uuid
  type        String   // SALE | REFUND | PAY_IN | PAY_OUT | COD_HANDOVER
  amountCents Int      @map("amount_cents") // signed
  referenceId String?  @map("reference_id") @db.Uuid
  actorId     String   @map("actor_id") @db.Uuid
  note        String?
  createdAt   DateTime @default(now()) @map("created_at")
  @@index([shiftId])
  @@map("cash_movements")
}

model Approval {
  id           String   @id @default(uuid()) @db.Uuid
  type         String   // DISCOUNT_OVER_THRESHOLD | PRICE_BELOW_FLOOR | VOID | REFUND | STOCK_ADJUSTMENT | RESTOCK_PO
  requestedById String  @map("requested_by_id") @db.Uuid
  approvedById String   @map("approved_by_id") @db.Uuid
  entityType   String   @map("entity_type")
  entityId     String?  @map("entity_id") @db.Uuid
  context      Json     // amounts, percentages, reason
  createdAt    DateTime @default(now()) @map("created_at")
  @@map("approvals") // approver must hold the permission; approver ≠ requester for money-affecting types
}

// ───────────────────────────── Finance ─────────────────────────────

model LedgerAccount {
  id    String @id @default(uuid()) @db.Uuid
  code  String @unique // see §8.9
  name  String
  type  String // ASSET | LIABILITY | REVENUE | EXPENSE | EQUITY
  @@map("ledger_accounts")
}

model JournalEntry {
  id            String        @id @default(uuid()) @db.Uuid
  occurredAt    DateTime      @map("occurred_at")
  description   String
  sourceType    String        @map("source_type") // ORDER | PAYMENT | GRN | PAYOUT | REFUND | COD | ADJUSTMENT
  sourceId      String        @map("source_id") @db.Uuid
  idempotencyKey String       @unique @map("idempotency_key") // e.g. "order.delivered:<orderId>"
  channel       OrderChannel?
  createdAt     DateTime      @default(now()) @map("created_at")
  lines         JournalLine[]
  @@index([sourceType, sourceId])
  @@map("journal_entries")
}

model JournalLine {
  id          String       @id @default(uuid()) @db.Uuid
  entryId     String       @map("entry_id") @db.Uuid
  accountId   String       @map("account_id") @db.Uuid
  debitCents  Int          @default(0) @map("debit_cents")
  creditCents Int          @default(0) @map("credit_cents")
  partyType   String?      @map("party_type") // SUPPLIER | RIDER | CUSTOMER
  partyId     String?      @map("party_id") @db.Uuid
  entry       JournalEntry @relation(fields: [entryId], references: [id], onDelete: Cascade)
  @@index([accountId])
  @@index([partyType, partyId])
  @@map("journal_lines") // trigger/assertion: sum(debit) = sum(credit) per entry
}

// ───────────────────────────── Platform ─────────────────────────────

model AuditLog {
  id         String   @id @default(uuid()) @db.Uuid
  actorId    String?  @map("actor_id") @db.Uuid
  actorRole  String?  @map("actor_role")
  ip         String?
  userAgent  String?  @map("user_agent")
  action     String
  entityType String   @map("entity_type")
  entityId   String?  @map("entity_id")
  before     Json?
  after      Json?
  reason     String?
  requestId  String?  @map("request_id")
  createdAt  DateTime @default(now()) @map("created_at")
  @@index([entityType, entityId])
  @@index([actorId, createdAt])
  @@map("audit_logs") // append-only; app DB role has no UPDATE/DELETE on this table
}

model OutboxEvent {
  id            String    @id @default(uuid()) @db.Uuid
  type          String
  aggregateType String    @map("aggregate_type")
  aggregateId   String    @map("aggregate_id")
  payload       Json
  publishedAt   DateTime? @map("published_at")
  attempts      Int       @default(0)
  lastError     String?   @map("last_error")
  createdAt     DateTime  @default(now()) @map("created_at")
  @@index([publishedAt, createdAt])
  @@map("outbox_events")
}

model Setting {
  key       String   @id
  value     Json
  updatedById String? @map("updated_by_id") @db.Uuid
  updatedAt DateTime @updatedAt @map("updated_at")
  @@map("settings")
}

model FileObject {
  id          String   @id @default(uuid()) @db.Uuid
  bucket      String
  key         String   @unique
  contentType String   @map("content_type")
  sizeBytes   Int      @map("size_bytes")
  isPublic    Boolean  @default(false) @map("is_public")
  uploadedById String? @map("uploaded_by_id") @db.Uuid
  createdAt   DateTime @default(now()) @map("created_at")
  @@map("file_objects")
}

model NotificationLog {
  id         String   @id @default(uuid()) @db.Uuid
  channel    String   // SMS | EMAIL | WHATSAPP | PUSH
  template   String
  recipient  String
  eventId    String?  @map("event_id") @db.Uuid // outbox event → dedupe
  status     String   @default("QUEUED") // QUEUED | SENT | DELIVERED | FAILED
  providerRef String? @map("provider_ref")
  error      String?
  createdAt  DateTime @default(now()) @map("created_at")
  @@unique([eventId, channel, recipient])
  @@map("notification_logs")
}
```

### 7.2 Raw SQL migration (required — add each statement in the milestone that creates its table)

```sql
-- Stock invariants
ALTER TABLE inventory_levels ADD CONSTRAINT inv_on_hand_nonneg CHECK (on_hand >= 0);
ALTER TABLE inventory_levels ADD CONSTRAINT inv_reserved_nonneg CHECK (reserved >= 0);
ALTER TABLE inventory_levels ADD CONSTRAINT inv_reserved_le_on_hand CHECK (reserved <= on_hand);

-- Money sanity
ALTER TABLE orders ADD CONSTRAINT orders_amounts_nonneg CHECK (subtotal_cents >= 0 AND total_cents >= 0 AND amount_paid_cents >= 0);
ALTER TABLE order_items ADD CONSTRAINT order_items_qty_pos CHECK (quantity > 0);
ALTER TABLE purchase_order_items ADD CONSTRAINT poi_qty_pos CHECK (quantity > 0);
ALTER TABLE journal_lines ADD CONSTRAINT jl_one_side CHECK ((debit_cents = 0) <> (credit_cents = 0) AND debit_cents >= 0 AND credit_cents >= 0);

-- One open shift per register
CREATE UNIQUE INDEX shifts_one_open_per_register ON shifts(register_id) WHERE status = 'OPEN';

-- One active job per (PO) collection / (order) delivery at a time
CREATE UNIQUE INDEX jobs_one_active_collection ON logistics_jobs(purchase_order_id) WHERE type = 'COLLECTION' AND status NOT IN ('CANCELLED','FAILED','CONFIRMED');
CREATE UNIQUE INDEX jobs_one_active_delivery   ON logistics_jobs(order_id) WHERE type = 'DELIVERY' AND status NOT IN ('CANCELLED','FAILED','CUSTOMER_CONFIRMED');

-- Number sequences
CREATE SEQUENCE order_number_seq; CREATE SEQUENCE po_number_seq; CREATE SEQUENCE grn_number_seq;
CREATE SEQUENCE job_number_seq;  CREATE SEQUENCE pr_number_seq; CREATE SEQUENCE rma_number_seq;

-- Search (Postgres provider)
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;
ALTER TABLE products ADD COLUMN search_vector tsvector;
CREATE INDEX products_search_idx ON products USING GIN (search_vector);
CREATE INDEX products_name_trgm  ON products USING GIN (name gin_trgm_ops);
CREATE INDEX part_numbers_trgm   ON part_numbers USING GIN (normalized gin_trgm_ops);
-- search_vector maintained by trigger from name, sku, brand name, category name, part numbers (weights A/B/C)

-- Audit log immutability: app role cannot modify history
REVOKE UPDATE, DELETE ON audit_logs, stock_movements, journal_lines, journal_entries FROM myspares_app;

-- Double-entry balance (deferred constraint trigger)
-- CREATE CONSTRAINT TRIGGER journal_balanced AFTER INSERT ON journal_lines DEFERRABLE INITIALLY DEFERRED
--   FOR EACH ROW EXECUTE FUNCTION assert_journal_entry_balanced();
```

### 7.3 Phase 2+ entities (add in their milestone)

| Entity | Key fields | Milestone |
|---|---|---|
| `PartRequest` | number, customerId/contact, vehicle (vehicleId or free text/VIN), partName, partNumber, condition (NEW/USED/EITHER), budgetCents, urgency (TODAY/DAYS_2_3/NO_RUSH), notes, photos, status, assignedToId, closedReason | M12 |
| `PartRequestQuote` | partRequestId, priceCents, leadTimeMins, supplierId (internal), costCents (internal), expiresAt, payToken (hashed), status (SENT/ACCEPTED/DECLINED/EXPIRED) | M12 |
| `Rma` / `RmaItem` | number, orderId, reason, status (REQUESTED/APPROVED/RECEIVED/INSPECTED/REFUNDED/REJECTED), resolution (REFUND/REPLACE/CREDIT), restock (bool) | M12 |
| `Promotion` / `PromotionRedemption` | code, type (PERCENT/FIXED/FREE_DELIVERY/BOGO), valueBps/valueCents, conditions JSON, startsAt, endsAt, usageLimit, perCustomerLimit, status | M12 |
| `LoyaltyAccount` / `LoyaltyTransaction` | balance, tier; points (signed), type (EARN/REDEEM/ADJUST/EXPIRE), orderId | M12 |
| `Review` | productId, userId, orderItemId, rating 1–5, title, body, photos, verifiedPurchase, status (PENDING/PUBLISHED/REJECTED) | M12 |
| `TradeTierPrice` / `BulkPriceTier` | productId, tier, priceCents / minQty, priceCents | M12 |
| `Wishlist` / `WishlistItem` + `StockAlertSubscription` / `PriceAlertSubscription` | | M12 |
| `EtimsInvoice` | orderId, controlUnitInvoiceNo, qrUrl, status, raw | M12 |
| `Vendor` (marketplace) | — only when explicitly started | later |

---

## 8. Core domain logic

This is the heart of the system. Implement each subsection as **pure domain functions** (unit-tested) plus a **service** that does the I/O.

### 8.1 Availability engine (SRS §2.5, §3.3)

The customer never sees a dead-end "Out of Stock". Every product resolves to exactly one of five statuses:

```ts
type Availability =
  | { status: 'AVAILABLE';          available: number }
  | { status: 'LOW_STOCK';          available: number }              // 1..lowStockThreshold (default 3)
  | { status: 'AVAILABLE_TO_ORDER'; leadTimeMins: number; readyBy: Date }
  | { status: 'PRE_ORDER';          expectedAt: Date }
  | { status: 'RARE_PART_REQUEST' };
```

**Algorithm** (`catalog/availability.domain.ts`, pure):

```
available = Σ over sellable locations (on_hand − reserved)

if product.status ≠ ACTIVE                         → not purchasable (404 on storefront)
if available > product.lowStockThreshold            → AVAILABLE
if available ≥ 1                                    → LOW_STOCK
-- available = 0 from here
if product has an open RESTOCK PO (SENT/CONFIRMED/…) with expected date
   and settings.preorder.enabled                    → PRE_ORDER(expectedAt)
if product.isSourceable and hasSourcingCandidate    → AVAILABLE_TO_ORDER(leadTime)
otherwise                                           → RARE_PART_REQUEST
```

- `hasSourcingCandidate` = at least one `SupplierCatalogItem` mapped to the product, supplier `ACTIVE`, `availability ∈ {IN_STOCK, LOW, UNKNOWN}`, and approved `costCents` present.
- **Lead time** = `min(candidate.supplier.typicalLeadTimeMins, product.sourcingLeadTimeMins ?? ∞)` + `settings.sourcing.hubProcessingMins` (default 45) + delivery window for the zone. Convert to a `readyBy` with business hours and the **same-day cut-off** (`settings.sourcing.sameDayCutoff = "14:00"` EAT): orders placed before cut-off on a business day with lead time that fits before `settings.business.closeTime` get same-day promise; otherwise next business day.
- **Quantity > available:** the line is split: `available` units as `STOCK` + the rest as `SOURCED` (if sourceable) — two order items, two timelines (SRS §3.7.1 mixed-status cart).
- Availability is cached in Redis per product (`avail:{productId}:{inventoryVersion}`) for 30s and invalidated on any inventory change event. **Checkout always recomputes from the DB.**

### 8.2 Inventory: on-hand, reserved, available

Definitions (single source of truth for online + POS):
- `on_hand` — units physically in the hub (including units allocated to orders but not yet shipped).
- `reserved` — units promised to orders that haven't left the building.
- `available = on_hand − reserved` — what we can sell right now. **This is what drops instantly when someone orders**, so the POS and the website can never sell the same unit (SRS §7.4).

**All mutations use atomic SQL in a repository** (never read-modify-write in JS):

```sql
-- reserve (fails if not enough)
UPDATE inventory_levels
   SET reserved = reserved + $qty, version = version + 1
 WHERE product_id = $pid AND location_id = $loc AND on_hand - reserved >= $qty
RETURNING on_hand, reserved;           -- 0 rows → throw INSUFFICIENT_STOCK

-- release
UPDATE inventory_levels SET reserved = reserved - $qty, version = version + 1
 WHERE product_id = $pid AND location_id = $loc AND reserved >= $qty;

-- commit (goods leave the hub: dispatched or handed over)
UPDATE inventory_levels SET on_hand = on_hand - $qty, reserved = reserved - $qty, version = version + 1
 WHERE product_id = $pid AND location_id = $loc AND reserved >= $qty AND on_hand >= $qty;

-- receive (GRN pass / return to stock / positive adjustment)
INSERT ... ON CONFLICT (product_id, location_id) DO UPDATE SET on_hand = inventory_levels.on_hand + $qty, version = inventory_levels.version + 1;
```

Every one of these also writes a `stock_movements` row (except reserve/release, which are tracked in `stock_reservations`) **in the same transaction**, and emits `inventory.changed` via outbox (→ websocket push to POS/admin within < 5 s, search/availability cache invalidation).

**Reservation lifecycle (BR-002: cart never reserves):**

| Moment | Effect |
|---|---|
| Order created at checkout (`PENDING_PAYMENT`) | `reserve` for STOCK lines, `StockReservation(ACTIVE, expiresAt = now + 30 min)` |
| Payment/deposit captured (`PLACED`) | `expiresAt = null` (held until shipped) |
| COD order accepted | same as captured (held) |
| 30 min pass unpaid | expiry job → `release`, reservation `RELEASED`, order `CANCELLED` (reason `PAYMENT_TIMEOUT`) |
| Dispatch / counter handover | `commit` → `SALE` movement, reservation `COMMITTED` |
| Order cancelled | `release` |

**Late payment edge case:** a payment callback arrives for an order already cancelled by expiry → try to re-reserve; if stock is gone, convert the item to `SOURCED` (if sourceable) and notify staff; if not possible, auto-create a refund and alert finance. Never silently drop a payment.

**Stock adjustments** (`POST /admin/inventory/adjustments`): reason code required (`DAMAGED`, `COUNTED`, `STOLEN`, `PROMO_WRITE_OFF`, `FOUND`, `RETURNED`), note required, permission `inventory:adjust`; adjustments with value above `settings.inventory.adjustmentApprovalCents` require an `Approval`.

**Stocktake:** open (snapshot `system_qty` per line at count time) → staff submit counts per bin → system computes variances → manager approves → one `ADJUSTMENT_COUNTED` movement per variance line. Discrepancy report lists all non-zero variances. Lines for products with movements *during* the count are flagged for recount.

**Reorder report:** products where `available ≤ reorderPoint`, sorted by 30-day sales velocity desc, recommended qty = `max(reorderQty, ceil(velocityPerDay × settings.inventory.daysOfCover) − available)`.

### 8.3 Pricing & margin (SRS §2.6.3)

All functions in `pricing/pricing.domain.ts`, pure.

- **Retail price is VAT-inclusive** (Kenyan B2C norm). VAT portion of a line: `vat = round(lineTotal × rateBps / (10000 + rateBps))` (round half-up, per line). Order VAT = Σ line VAT + delivery fee VAT.
- **Cost prices are VAT-exclusive** (input VAT is reclaimable). Margin math is always done on **net-of-VAT** selling price.
- **Landed cost per unit** (computed at GRN pass):
  `landed = unitCost + (po.collectionFeeCents + po.otherCostsCents) × (lineValue / poValue) / acceptedQty`
- **Product cost** maintained as weighted average: `avgCost = (avgCost × onHandBefore + landed × qty) / (onHandBefore + qty)`; `lastCost = landed`.
- **Unit cost on an order item:** SOURCED item → the landed cost of its specific PO line; STOCK item → `avgCostCents` at commit time. Stored in `order_items.unit_cost_cents` (staff-only).
- **Effective unit price** for a buyer context `{ customerTier, quantity, at }`:
  1. Start with `retailPriceCents`; if a sale window is active use `salePriceCents`.
  2. If buyer is a trade customer: trade tier price → else `tradePriceCents` → else retail. (Phase 2 tiers.)
  3. Bulk tier for the quantity, if lower.
  4. Take the **lowest** of the applicable candidates. Promotions apply after (Phase 2).
- **Margin floor check** (`checkPriceFloor`), on product save, sale price set, POS discount, promotion creation, and part-request quote:
  - `netPrice < landedCost` → `BLOCK_BELOW_COST` → requires `Approval(PRICE_BELOW_FLOOR)` by a user with `finance:approve_below_cost` (**BR-004**).
  - `margin% < (product.minMarginBps ?? settings.pricing.minMarginBps)` → `WARN_BELOW_MARGIN` → staff must pass `acknowledgeMarginWarning: true`; recorded in audit.
  - Otherwise `OK`.
- **Gross margin** = `netPrice − landedCost`; **margin %** = `grossMargin / netPrice × 10000` (bps). Only staff DTOs with `pricing:view_cost` see these.

### 8.4 Cart & checkout (SRS §3.7)

**Cart** is just intent: product + qty (+ optional garage vehicle for fitment warning). Guests get a `guest_token` cookie; on login the guest cart merges into the user cart (sum quantities, cap at 99). Cart reads return **live** pricing/availability per line and a fitment warning when `garageVehicleId` doesn't match the product's fitments.

**Checkout is two calls:**

1. `POST /api/v1/checkout/quote` — **no side effects.** Input: cart or explicit items, delivery method, address/zone, payment method preference, promo code. Output: priced lines (split STOCK/SOURCED), per-group timelines (`readyBy`), delivery fee (zone fee; free above `settings.delivery.freeThresholdCents`; express surcharge), VAT, total, `depositAllowed`, `depositRequiredCents`, `codAllowed`, and the sourcing acknowledgement text when any line is sourced.
2. `POST /api/v1/orders` with header **`Idempotency-Key: <uuid>`** — in one transaction:
   1. Re-run the quote logic against the DB (never trust client prices). If total changed vs. `expectedTotalCents` sent by client → `409 CONFLICT` with the new quote.
   2. If any sourced line: require `acceptSourcingLeadTime: true` (stores `sourcingAcceptedAt`).
   3. Create `Order(PENDING_PAYMENT)` + items + status event.
   4. Reserve stock for STOCK lines (sorted by productId to avoid deadlocks).
   5. Outbox `order.created`. Return order + next action (`pay`).
   - Same idempotency key + same payload → return the original order. Same key + different payload → `IDEMPOTENCY_CONFLICT`.
3. `POST /api/v1/orders/:id/payments` → initiate M-Pesa STK / Stripe PaymentIntent (see §14). Payment success (callback/webhook) moves the order to `PLACED`.

**Payment rules:**
- Online, all-stock: full payment (M-Pesa, card) **or** COD if `codAllowed`.
- `codAllowed` only when: all lines are STOCK, total ≤ `settings.cod.maxOrderCents`, delivery method STANDARD/EXPRESS, customer not flagged. (COD orders move to `PLACED` with `paymentStatus = COD_PENDING`.)
- Online, any sourced line: full payment by default; deposit allowed when the sourced-lines value ≥ `settings.deposit.minSourcedValueCents`; deposit = `settings.deposit.percentBps` (default 3000 = 30%) of total, rounded up to whole shillings.
- Walk-in sourced: deposit of at least `settings.deposit.walkInPercentBps`; **non-refundable once a PO is SENT (BR-008)** — enforced in cancellation logic and printed on the receipt.
- Pre-order: full payment upfront.
- Balance collection: on delivery (COD of remainder), at counter, or via payment link.

### 8.5 Order lifecycle & fulfilment

**Order status is an aggregate of its items** — recomputed by `orders/order-status.domain.ts` after any item/sourcing change, then applied via the state machine (§9.1):

- After `PLACED`, the system auto-confirms (`CONFIRMED`) unless the order is flagged for review (high value COD, first-time trade credit, etc. → stays `PLACED` for staff).
- `CONFIRMED` → if any item `source ∈ {SOURCED, PRE_ORDER}` and not yet `RECEIVED` → `SOURCING`; else → enters the **fulfilment queue** (`PICKING`).
- When the last sourced item becomes `RECEIVED` (GRN passed + allocated) → `PICKING`.
- **Phase 1 ships each order as one consignment** (no partial dispatch). `promisedBy` = latest line `readyBy`.

**Fulfilment queue** (`GET /admin/fulfilment/queue`): orders in `PICKING`, oldest promise first; each line shows bin code. Staff actions:
- `POST /admin/orders/:id/pick` (records picker) → per-line confirm (scan barcode optional) → `PACKED` requires quality check confirmation + generates **packing slip** and **package label** PDFs (MySpares branding, order number, part name/number, quality grade — **never supplier data**, BR-007).
- `PACKED` → online delivery: create delivery job (§8.7) → `DISPATCHED` when rider is `EN_ROUTE`; click & collect / walk-in sourced: `READY_FOR_COLLECTION` + notify customer; walk-in in-stock: straight to `COMPLETED` at the counter.
- **Commit stock** (on_hand −) happens at `DISPATCHED` or at counter handover/collection.

**Customer-facing timeline** (SRS §11.2 "Track Your Sourcing"): `OrderStatusEvent.customerVisibleText` is set from a fixed message map — never free text that could leak supplier info:

| Internal trigger | Customer sees |
|---|---|
| item `AWAITING_PO` / `PO_SENT` | "MySpares is searching for your part" |
| item `SUPPLIER_CONFIRMED` | "Part confirmed — we're arranging collection" |
| collection job `EN_ROUTE` | "Our rider is on the way to collect your part" |
| collection job `COLLECTED` | "Part collected — heading to our hub" |
| order `PACKED` | "Your order is packed and will be dispatched shortly" |
| delivery job `EN_ROUTE` | "Rider [first name] is on the way to you · [rider phone]" |
| `DELIVERED` | "Delivered — enjoy!" |

**Cancellation rules:**
- Customer can cancel online orders while `PENDING_PAYMENT`, `PLACED`, `CONFIRMED`, or `SOURCING` **before any PO for its items is SENT** → full refund.
- After a PO is SENT: staff-only cancellation with reason; walk-in deposits are forfeited (BR-008); online refunds per `settings.cancellation.sourcedRestockingFeeBps` (default 0) — staff decides, audited.
- After `DISPATCHED`: no cancellation — goes through returns (RMA, BR-009).
- Cancelling releases reservations, cancels unsent POs and open jobs, and creates refunds where due.

### 8.6 Procurement: suppliers, POs, GRN (SRS §2.6, §2.8, §4.3)

**Sourcing kickoff:** when an order reaches `SOURCING`, each sourced item becomes `AWAITING_PO` and appears in the **Sourcing queue**. The service proposes ranked supplier candidates:

```
filter: supplier.status = ACTIVE, catalog item mapped to product (or matching normalized part number)
rank by: supplier.type (PRIMARY > SECONDARY > SPECIALIST)
       → catalog availability (IN_STOCK > LOW > UNKNOWN)
       → fulfilmentRateBps desc → landed cost asc → typicalLeadTimeMins asc
```

**PO rules:**
- **BR-003:** no PO without either a linked customer order item / accepted part-request quote (`REACTIVE`) or an approval (`RESTOCK` → `PENDING_APPROVAL` → approved by `procurement:approve_restock`).
- Creating a reactive PO pre-fills lines from the order items and approved catalogue cost. Staff can edit cost (requires note); if the new cost makes the already-sold line fall below the cost floor, raise `APPROVAL_REQUIRED`.
- **Send** (`POST /admin/purchase-orders/:id/send { channel }`): generates PO PDF; `PORTAL` → visible in supplier portal + SMS; `EMAIL` → SendGrid with PDF; `WHATSAPP` → Twilio template with PDF link (Phase 2) or "sent manually" log in Phase 1; `PHONE` → requires a call note. Status `SENT`, `sentAt` set, item sourcing status `PO_SENT`. Overdue-confirmation timer starts (`settings.procurement.confirmTimeoutMins`, default 30).
- **Supplier response** (portal action or staff logging a phone/WhatsApp reply):
  - Confirm → `CONFIRMED_BY_SUPPLIER`, `supplierReadyAt`, items `SUPPLIER_CONFIRMED`. A **collection code** (6 digits, CSPRNG) is generated; only its hash is stored.
  - Partial → `PARTIALLY_CONFIRMED` with `confirmedQty`; unconfirmed qty returns to the sourcing queue for another supplier.
  - Reject (reason) → `REJECTED_BY_SUPPLIER`; items back to `AWAITING_PO`; urgent alert to procurement.
- **BR-011:** a collection job can only be created for a PO in `CONFIRMED_BY_SUPPLIER` / `PARTIALLY_CONFIRMED`.
- **Collection code flow:** the plaintext code is sent to the assigned rider (job notification) and to the supplier (PO confirmation message). At pickup the rider quotes it; the supplier verifies and confirms handover by entering it in the portal (`POST /supplier/purchase-orders/:id/handover {code}`), or staff enters it after a call. Max 5 attempts, then locked + alert. Reassigning the rider rotates the code.

**GRN (Goods Received Note)** — created when the collection rider arrives at the hub (`POST /admin/grns { purchaseOrderId, jobId }`), then per line: `receivedQty`, `acceptedQty`, `rejectedQty`, checks `{ correctPart, correctQty, noDamage }`, rejection reason. Completing a GRN (`POST /admin/grns/:id/complete`) in one transaction:
1. For accepted qty: `receive` stock (`GRN_RECEIPT` movement, unit cost = landed), update `avgCostCents`/`lastCostCents`, increment `PurchaseOrderItem.receivedQty`.
2. **BR-012:** for reactive lines, immediately **reserve** the accepted units against the linked order item (reservation `ACTIVE`, no expiry) and set item `RECEIVED` + `unitCostCents`. Restock lines first satisfy waiting `PRE_ORDER`/`SOURCED` items FIFO, the rest becomes free stock.
3. GRN status: all accepted → `PASSED`; some → `PARTIAL_PASS`; none → `FAILED`.
4. Rejected qty: outbox `grn.failed` → alert procurement + notify supplier; affected order items → `FAILED` and back into the sourcing queue (replacement PO, same or different supplier); supplier credit note tracked on the PO.
5. PO → `RECEIVED` when all lines are received or closed; collection job → `CONFIRMED`; outbox `grn.completed` (→ finance posts inventory + payables, supplier quality score).

**Supplier invoicing & payment:** staff records supplier invoice ref against the PO (`INVOICED`, three-way match: PO qty/cost vs GRN accepted vs invoice amount — mismatch blocks payment until resolved). `paymentDueAt` from terms (`ON_COLLECTION` = GRN date, `NET_7/14/30`). **No PO, no payment.** Payment recorded via payouts (M-Pesa B2C / bank / cash) → `PAID`. Overdue payables flagged daily.

**Supplier price lists:** supplier uploads CSV/XLSX (portal) or staff uploads on their behalf → parsed into `pending_cost_cents`; changes go live only after admin approval (`procurement:approve_supplier_prices`).

**Supplier performance** (nightly job): fulfilment rate = confirmed POs / sent POs; avg response = sentAt → confirmedAt; quality pass rate = accepted qty / received qty; avg collection time = job assignedAt → collected.

### 8.7 Logistics: riders, jobs, zones, COD (SRS §2.7, §4.5)

- **BR-005:** every trip is a `LogisticsJob` created **before** the rider departs. No job, no trip, no rider pay.
- **Riders:** registered by admin (Phase 1) or self-registered via rider app (Phase 3) → `PENDING_APPROVAL` → approved by `logistics:manage_riders`. National ID and payout details encrypted at rest. Only `ACTIVE` riders can be assigned. `isOnDuty` toggled by admin (Phase 1) or the rider (Phase 3). Preferred riders are listed first in assignment suggestions.
- **Collection job** (from PO): origin = supplier address snapshot, destination = hub, items, PO number as the reference, urgency. Rider fee = the zone rider fee for the supplier's area (or `settings.logistics.defaultCollectionFeeCents`). That fee is added to `po.collectionFeeCents` → landed cost.
- **Delivery job** (from a `PACKED` order): origin = hub, destination = address snapshot, package description, `codAmountCents = totalCents − amountPaidCents` when COD/balance, rider fee from the zone (express adds surcharge to the customer fee only).
- **Assignment:** `POST /admin/logistics/jobs/:id/assign { riderId }`. A rider may hold at most `settings.logistics.maxConcurrentJobs` (default 3) active jobs. Notifies rider (SMS Phase 1; WhatsApp/app push later) and — for collections — the supplier ("Rider X is on the way, ETA …"); for deliveries — the customer ("Your MySpares order is on its way. Rider: [Name], Contact: [Phone]").
- **Proof of delivery:** setting `delivery.proofMode`: `PHOTO` (Phase 1 default — rider sends photo; staff uploads/attaches, or rider app uploads in Phase 3), `OTP` (Phase 3 — 6-digit code SMSed to customer at dispatch, rider enters it, 5 attempts max), or `PHOTO_OR_OTP`.
- **Failed delivery:** job `FAILED` with reason → rider returns the package → staff confirms receipt → order back to `PACKED`. Because stock was committed at `DISPATCHED`, the return posts a `DELIVERY_RETURNED` movement and re-reserves in one transaction (`on_hand +qty`, `reserved +qty`, new `ACTIVE` reservation) → a new delivery job can be created.
- **COD:** on `DELIVERED` with COD → `CodCollection(OUTSTANDING, expected)`, rider reports amount. Rider hands cash to staff at the shop → staff counts → `handedOverCents` → `RECONCILED` (match) or `DISCREPANCY` (alert finance, can create a rider deduction). Hourly job alerts on any `OUTSTANDING` older than 24 h (**BR-006**). The handover is a `CashMovement(COD_HANDOVER)` in the receiving staff member's open shift.
- **Earnings:** job completion creates `RiderEarning(TRIP, riderFeeCents)` (unique per job). Deductions (lost/damaged, COD shortfall) are `RiderEarning(DEDUCTION, negative)` with reason and approval. Payout batches (daily/weekly per `settings.logistics.payoutSchedule`) sum unpaid earnings per rider → `Payout` (M-Pesa B2C) after finance approval; idempotency key `payout:rider:<riderId>:<periodEnd>`.
- **KPIs:** trips, average delivery time (assignedAt → completedAt), on-time rate (`completedAt ≤ etaAt`), incidents, rating average. Riders below `settings.logistics.minOnTimeRateBps` / rating thresholds are flagged for review (not auto-suspended).

**Delivery zones:** admin-defined areas with customer fee (flat or per-km), rider fee, express surcharge; address → zone by explicit selection, area name match, or point-in-polygon when a polygon exists. Free delivery above `settings.delivery.freeThresholdCents` (customer fee waived; rider still paid).

### 8.8 POS — walk-in sales (SRS §2.9, §4.7)

- **Shift required.** `POST /pos/shifts/open { registerId, openingFloatCents }` — one open shift per register (DB partial unique index). All POS sales and cash movements link to the shift and the logged-in staff member.
- **Product lookup:** name, part number (normalized), barcode, YMM — same search service as the storefront with `audience=staff` (shows bin location, available qty, and — with permission — cost).
- **In-stock sale** (`POST /pos/sales`), one transaction: price check (server-side) → discount check → create `Order(channel=WALK_IN, deliveryMethod=COUNTER)` → reserve+commit stock → record payment(s) → `COMPLETED` → receipt number → outbox `pos.sale_completed` (receipt SMS/email, websocket stock update). Target < 3 s.
  - **Cash / card terminal / trade credit:** recorded synchronously (card terminal requires the terminal reference).
  - **M-Pesa STK at POS:** order created `PENDING_PAYMENT` with reservation → STK push → POS listens on websocket `payment.updated` (fallback poll `GET /pos/sales/:id`) → callback completes the sale.
  - Split tender allowed (e.g., part cash + part M-Pesa).
- **Discounts:** percentage or fixed per line or per sale. Above `settings.pos.discountApprovalThresholdBps` (default 1000 = 10%) requires a **manager override**: `POST /pos/approvals { type, context, managerEmail|managerId, managerPin|totp }` → returns a single-use `approvalToken` (5-minute TTL, bound to a hash of the context). Approver must hold `pos:approve_override` and must not be the requester. Margin floor rules (§8.3) still apply.
- **Out of stock at POS:** the response includes `sourcingOption { leadTimeMins, readyBy, priceCents, depositRequiredCents }` ("Source from supplier?"). Confirming creates a walk-in sourcing order (`hasSourcedItems`, deposit or full payment) → normal sourcing flow → `READY_FOR_COLLECTION` + SMS when packed → `COMPLETED` on collection (balance collected at counter) or delivery arranged.
- **Void** (same shift, not yet closed) and **refund** (later; walk-in returns need an RMA in Phase 2, BR-009) require manager override + reason; restockable items post `CUSTOMER_RETURN` movements.
- **Receipts:** printable payload (ESC/POS-friendly JSON + PDF) and SMS/email. eTIMS fiscal receipt in Phase 2.
- **Close shift:** `expectedCash = openingFloat + cashSales − cashRefunds + payIns − payOuts + codHandovers`; staff enters counted cash → variance stored; variance beyond `settings.pos.varianceAlertCents` → alert. End-of-day till report: totals by payment method, number of sales, voids, discounts, overrides.

### 8.9 Finance ledger (SRS §4.9)

A small **double-entry** ledger gives trustworthy revenue, COGS, VAT, payables, and cash numbers. The `finance` module posts journal entries by consuming domain events (idempotency key = `<event type>:<aggregate id>[:<suffix>]`). Every entry must balance (deferred DB trigger + domain assertion).

**Chart of accounts (seeded):**

| Code | Account | Type |
|---|---|---|
| 1000 | Cash — Till | Asset |
| 1010 | M-Pesa Clearing | Asset |
| 1020 | Card Clearing (Stripe / terminal) | Asset |
| 1030 | Bank | Asset |
| 1040 | COD Cash in Transit (with riders) | Asset |
| 1100 | Accounts Receivable (trade credit) | Asset |
| 1200 | Inventory | Asset |
| 2000 | Supplier Payables | Liability |
| 2010 | Rider Payables | Liability |
| 2100 | VAT Output | Liability |
| 2200 | Customer Deposits / Unearned Revenue | Liability |
| 4000 | Sales Revenue — Parts | Revenue |
| 4010 | Delivery Revenue | Revenue |
| 5000 | Cost of Goods Sold | Expense |
| 5100 | Delivery Logistics Cost | Expense |
| 5200 | Inventory Write-offs | Expense |

**Postings:**

| Event | Debit | Credit |
|---|---|---|
| Payment captured (before delivery) | M-Pesa/Card/Cash/Bank | Customer Deposits |
| Order delivered / completed (revenue recognition) | Customer Deposits (paid part) + COD in Transit (COD part) or AR (trade credit) | Sales Revenue (net) + Delivery Revenue (net) + VAT Output |
| Same moment — COGS | COGS | Inventory (Σ unit cost × qty) |
| GRN passed | Inventory (landed cost) | Supplier Payables (cost) + Rider Payables (collection fee) |
| Delivery trip completed | Delivery Logistics Cost | Rider Payables |
| COD handed over at shop | Cash — Till | COD in Transit |
| Rider payout | Rider Payables | M-Pesa Clearing / Bank |
| Supplier payment | Supplier Payables | M-Pesa / Bank / Cash |
| Stock write-off | Inventory Write-offs | Inventory |
| Refund | reverse the relevant entries | |

Reports (revenue by channel, gross margin by product/category/channel/supplier, VAT by period, payables aging, rider payables, COD status) query the ledger and order tables. All reports exportable as CSV/XLSX/PDF (generated by a worker, delivered via a signed download URL).

### 8.10 Notifications

`notifications` consumes outbox events and maps them to templates per channel (SMS via Africa's Talking, email via SendGrid; WhatsApp from Milestone 12). Rules:
- One `NotificationLog` per `(eventId, channel, recipient)` — unique index makes sends idempotent.
- Templates are versioned files in `src/modules/notifications/templates/` (SMS ≤ 160 chars where possible). **Templates may only use DTO fields from the customer serializer** — so supplier data can't leak into a customer SMS.
- Retries: exponential backoff (5 attempts), then `FAILED` + admin alert. Never block a business flow on a notification.
- Quiet hours for marketing only (transactional always sends).

Key templates: OTP, order placed, sourcing update, order packed, out for delivery (rider name + phone), delivered + review request, ready for collection, part-request quote, payment link, payment failed, PO to supplier, PO reminder, collection job to rider, rider-on-the-way to supplier, delivery job to rider, low stock alert (staff), overdue PO / delivery / COD alerts (staff).

### 8.11 Search & fitment (SRS §3.2, §3.4)

- `SearchProvider` interface: `search(query, filters, sort, page, audience)`, `suggest(prefix)`, `index(productIds)`, `remove(productIds)`.
- **PostgresSearchProvider** (Milestone 3): `tsvector` (name A, part numbers/SKU A, brand B, category B, description C) + `pg_trgm` similarity for typos; part-number queries detected by regex and matched on `part_numbers.normalized` exactly first.
- **OpenSearchProvider** (Milestone 7): synonyms (e.g., "brake pads" ↔ "brake pad set", "shocks" ↔ "shock absorber"), fuzziness, facets (brand, category, origin OEM/OES/aftermarket, condition, quality grade, price range, availability, rating), and vehicle filter via `vehicleIds` field. Indexed by an outbox consumer on `product.*` / `inventory.changed`.
- **Graceful degradation:** a circuit breaker around OpenSearch; when open, the facade falls back to Postgres (SRS §7.3) and logs a warning metric.
- **Natural language** ("Corolla 2015 front brake pads"): a lightweight parser extracts year (4 digits 1980–current+1), make/model (dictionary match against vehicle tables), position words (front/rear/left/right) → becomes filters + remaining text query.
- **YMM cascade** endpoints: years → makes (for year) → models (for make+year) → engines/variants. Heavily cached (Redis, 24 h; busted on vehicle import).
- **VIN decode:** validate (17 chars, check digit for North American VINs only — many Kenyan imports are Japanese chassis numbers, so also accept chassis/frame numbers as a separate input), decode via provider (TecDoc/AutoSync adapter), cache results.
- **My Garage:** max 10 vehicles; one active; "fits my vehicle" = exists `ProductFitment(productId, vehicleId)`.
- **Cross-reference search:** any OEM/aftermarket number → all products sharing that normalized number.
- Zero results → response includes `suggestPartRequest: true` so the client can show the "Submit a Part Request" CTA.

### 8.12 Part requests (Phase 2, SRS §3.6, §4.3.1)

`RECEIVED → SEARCHING → QUOTED → ACCEPTED → SOURCING → FULFILLED | DECLINED | CLOSED`.
- Customer (or guest with phone/email) submits; confirmation SMS/email.
- Staff takes ownership → searches supplier network → creates a quote (price must pass margin floor; internal cost/supplier stored, never exposed) → customer gets SMS/email with a secure **pay link** (`/q/<token>`, token random 32 bytes, hashed in DB, expires `settings.partRequest.quoteValidityHours`).
- Accept + pay → creates an order (custom item, `source=SOURCED`) and a **reactive PO automatically** (draft for staff to send).
- No supplier found within `settings.partRequest.searchTimeoutHours` → auto-alert staff; staff closes with apology/alternatives template.

### 8.13 Returns / RMA (Phase 2, BR-009)

`REQUESTED → APPROVED → RECEIVED → INSPECTED → REFUNDED | REPLACED | CREDITED | REJECTED`. No refund without an approved RMA number. Restockable items return to stock (`CUSTOMER_RETURN`); faulty supplier parts can trigger a return-to-supplier and supplier credit.

### 8.14 Business settings (seeded defaults, editable by `settings:manage`)

| Key | Default | Used by |
|---|---|---|
| `reservation.ttlMins` | 30 | checkout |
| `inventory.lowStockThresholdDefault` | 3 | availability |
| `inventory.daysOfCover` | 14 | reorder report |
| `inventory.adjustmentApprovalCents` | 500000 (KES 5,000) | adjustments |
| `pricing.minMarginBps` | 1500 | margin floor |
| `sourcing.sameDayCutoff` | "14:00" | lead time |
| `sourcing.hubProcessingMins` | 45 | lead time |
| `business.openTime` / `closeTime` / `workingDays` | "08:00" / "18:00" / Mon–Sat | lead time, SLAs |
| `delivery.freeThresholdCents` | configurable | delivery fee |
| `delivery.proofMode` | PHOTO | logistics |
| `deposit.percentBps` / `walkInPercentBps` / `minSourcedValueCents` | 3000 / 3000 / 500000 | checkout, POS |
| `cod.maxOrderCents` | 2000000 | checkout |
| `procurement.confirmTimeoutMins` | 30 | PO alerts |
| `procurement.collectionTimeoutMins` | 90 | job alerts |
| `logistics.maxConcurrentJobs` | 3 | assignment |
| `logistics.payoutSchedule` | DAILY | payouts |
| `logistics.defaultCollectionFeeCents` | 20000 | jobs |
| `pos.discountApprovalThresholdBps` | 1000 | POS |
| `pos.varianceAlertCents` | 50000 | shift close |
| `cancellation.sourcedRestockingFeeBps` | 0 | cancellations |
| `partRequest.quoteValidityHours` / `searchTimeoutHours` | 48 / 24 | part requests |

Settings are cached in Redis (60 s) and validated by a Zod schema per key.

---

## 9. State machines

Implement with a tiny generic helper in `src/shared/state-machine`:

```ts
export function defineMachine<S extends string, C = unknown>(def: {
  name: string;
  transitions: Record<S, readonly S[]>;
  guards?: Partial<Record<`${S}->${S}`, (ctx: C) => string | null>>; // return error message or null
}) {
  return {
    assertTransition(from: S, to: S, ctx: C) {
      if (!def.transitions[from]?.includes(to))
        throw new AppError('INVALID_STATE_TRANSITION', `${def.name}: ${from} → ${to} not allowed`);
      const err = def.guards?.[`${from}->${to}`]?.(ctx);
      if (err) throw new AppError('INVALID_STATE_TRANSITION', err);
    },
  };
}
```

The repository's transition method uses **compare-and-set**: `UPDATE orders SET status=$to, version=version+1 WHERE id=$id AND status=$from AND version=$v` — 0 rows → reload and retry once, else `CONFLICT`. Each transition writes a history row (`order_status_events` / `logistics_job_events`) + audit + outbox event.

### 9.1 Order

```
PENDING_PAYMENT → PLACED | CANCELLED
PLACED          → CONFIRMED | CANCELLED | COMPLETED*         (*walk-in counter sale, all STOCK)
CONFIRMED       → SOURCING | PICKING | CANCELLED
SOURCING        → PICKING | CANCELLED
PICKING         → PACKED | CANCELLED
PACKED          → DISPATCHED | READY_FOR_COLLECTION | COMPLETED*   (*walk-in handover)
READY_FOR_COLLECTION → COMPLETED | DISPATCHED
DISPATCHED      → DELIVERED | PACKED (delivery failed, back at hub)
DELIVERED       → COMPLETED | RETURNED
COMPLETED       → RETURNED
```
Guards: `→ PLACED` requires `amountPaid ≥ depositRequired` or COD accepted (**BR-001**); `SOURCING → PICKING` requires every sourced item `RECEIVED` (**BR-012**); `PACKED → DISPATCHED` requires an assigned delivery job; `DELIVERED → COMPLETED` requires `amountPaid = total` (COD reconciled or balance paid); `→ CANCELLED` follows §8.5 cancellation rules.

**SRS walk-in status mapping:** In Progress = `PENDING_PAYMENT`; Paid/Fulfilled = `PLACED → COMPLETED`; Deposit Paid = `PLACED` + `paymentStatus=DEPOSIT_PAID`; Sourcing = `SOURCING`; Ready for Collection = `READY_FOR_COLLECTION`; Collected = `COMPLETED`; Delivery Arranged = `DISPATCHED`.

### 9.2 Purchase order
```
DRAFT → SENT | PENDING_APPROVAL | CANCELLED
PENDING_APPROVAL → DRAFT (rejected) | SENT (approved & sent) | CANCELLED
SENT → CONFIRMED_BY_SUPPLIER | PARTIALLY_CONFIRMED | REJECTED_BY_SUPPLIER | CANCELLED
CONFIRMED_BY_SUPPLIER | PARTIALLY_CONFIRMED → RIDER_ASSIGNED | CANCELLED
RIDER_ASSIGNED → COLLECTED | CONFIRMED_BY_SUPPLIER (rider unassigned)
COLLECTED → RECEIVED
RECEIVED → INVOICED
INVOICED → PAID
```
Guards: `→ SENT` for RESTOCK requires approval (**BR-003**); `→ RIDER_ASSIGNED` only from confirmed states (**BR-011**); `→ PAID` requires `INVOICED` and three-way match.

### 9.3 Logistics job
```
Collection: CREATED → ASSIGNED → EN_ROUTE → COLLECTED → DELIVERED_TO_HUB → CONFIRMED
Delivery:   CREATED → ASSIGNED → EN_ROUTE → DELIVERED → CUSTOMER_CONFIRMED
Any non-terminal → CANCELLED (reason) ; ASSIGNED/EN_ROUTE → FAILED (reason) ; ASSIGNED → CREATED (unassign/reassign)
```
Guards: `→ COLLECTED` requires a verified collection code (or staff override with reason); `→ CUSTOMER_CONFIRMED` requires OTP or photo per `delivery.proofMode`; `→ CONFIRMED` requires a GRN.

### 9.4 Others
- **Payment:** `INITIATED → PENDING → SUCCEEDED | FAILED | CANCELLED`; `SUCCEEDED → REFUNDED` (via Refund).
- **GRN:** `PENDING → PASSED | PARTIAL_PASS | FAILED` (terminal).
- **Part request:** `RECEIVED → SEARCHING → QUOTED → ACCEPTED → SOURCING → FULFILLED`; `QUOTED → DECLINED | SEARCHING (re-quote)`; any non-terminal → `CLOSED`.
- **Rider:** `PENDING_APPROVAL → ACTIVE | REMOVED`; `ACTIVE ↔ SUSPENDED`; `→ REMOVED`.
- **Supplier:** `ACTIVE ↔ SUSPENDED`; `→ BLACKLISTED` (removed from candidate lists and PO dropdowns).

---

## 10. Business rules → enforcement map

Every rule has (a) a code location and (b) at least one test that tries to break it.

| Rule | Enforcement | Test |
|---|---|---|
| **BR-001** Sale confirmed only after payment or logged deposit | Order machine guard `→ PLACED`; POS sale TX records payment before `COMPLETED` | order not `PLACED` after STK failure; POS sale fails if payment step fails |
| **BR-002** No reservation on add-to-cart | Cart module has no inventory dependency; reservation only in `OrderService.create` | adding to cart leaves `reserved` unchanged |
| **BR-003** Every supplier purchase has an approved PO | PO machine guard; payouts require PO in `INVOICED`; restock approval | restock PO can't be sent unapproved; supplier payout w/o PO rejected |
| **BR-004** No sale below cost without Finance Manager approval | `checkPriceFloor` in product save, POS, promotions, quotes; `Approval(PRICE_BELOW_FLOOR)` with `finance:approve_below_cost` | POS discount below cost → 422 without approval |
| **BR-005** Every trip logged before departure | Rider earnings only from jobs; `EN_ROUTE` requires `ASSIGNED` job | earnings cannot be created without a job |
| **BR-006** COD reconciled within 24 h | `CodCollection` + hourly alert job; dashboard alert | job alerts on 25-hour-old outstanding COD |
| **BR-007** Supplier identity never disclosed | Audience serializers + response schemas + template restrictions + confidentiality crawler test | §6.6 crawler test |
| **BR-008** Walk-in sourcing deposit non-refundable once PO raised | Cancellation service checks linked PO `≥ SENT`; receipt text | cancel after PO sent → refund amount 0 for deposit |
| **BR-009** Returns need RMA before refund | `Refund` requires `rmaId` when reason is a return; refund service guard | refund without RMA → 422 |
| **BR-010** All admin actions logged | `audit.record` in services + `onResponse` hook; DB role can't modify audit rows | every staff mutation creates an audit row |
| **BR-011** Supplier confirms before rider dispatched | PO/job guards | create collection job for `SENT` PO → 409 |
| **BR-012** GRN must pass before sourced stock allocated | GRN completion allocates only accepted qty; order guard `SOURCING → PICKING` | failed GRN leaves item `FAILED`, order stays `SOURCING` |

---

## 11. Authentication, authorisation and security

### 11.1 Authentication

| Actor | Login | Second factor | Tokens |
|---|---|---|---|
| Customer (B2C/B2B) | email or phone + password; Google/Apple (Phase 2); guest checkout (no account) | optional TOTP | access + refresh |
| Staff | email + password | **mandatory TOTP** (SRS §7.2) | access + refresh; shorter refresh TTL |
| POS | staff login on the register (same as staff) + optional quick-switch **PIN** for an already-2FA'd device session | TOTP on first device login per shift | access bound to `registerId` |
| Supplier user | email + password | **mandatory TOTP** | access + refresh |
| Rider (Phase 3) | phone + SMS OTP (no password) | — | access + refresh, device-bound |

- **Passwords:** argon2id (memory ≥ 19 MiB, iterations ≥ 2). Minimum 10 chars, checked against a top-10k breached list. Lockout/backoff after 5 failures (per account and per IP, Redis counters).
- **Access token:** JWT (`EdDSA` or `RS256`), 15 min, claims `{ sub, typ (user type), roles, perms_v (permission version), sid }`. Sent as `Authorization: Bearer`.
- **Refresh token:** opaque 256-bit random, stored as SHA-256 hash, 30 days (customers) / 12 h (staff), **rotated on every use**; reuse of an old token revokes the whole family (theft detection). Web clients get it in an `httpOnly; Secure; SameSite=Strict` cookie scoped to `/api/v1/auth`.
- **OTP codes** (phone verification, rider login, delivery OTP, collection code): 6 digits from `crypto.randomInt`, hashed (HMAC-SHA256 with server secret), 5-minute TTL (collection codes: until job closes), max 5 attempts, rate-limited send (3 per 10 min per phone).
- Logout revokes the refresh family. Password change / role change revokes all sessions and bumps `perms_v`.

### 11.2 Authorisation (RBAC, permission-based)

Routes check **permissions**, never role names: `{ preHandler: [app.authenticate, app.requirePermission('orders:update_status')] }`. Roles are bundles of permissions defined in seed data (and editable later by `users:manage_roles`).

**Seeded roles:**

| Role | Intended for | Highlights |
|---|---|---|
| `SUPER_ADMIN` | owner | everything, incl. settings, roles |
| `OPERATIONS_MANAGER` | runs the hub | orders, fulfilment, logistics, inventory, procurement view, approvals |
| `FINANCE_MANAGER` | finance | `finance:*`, `pricing:view_cost`, `finance:approve_below_cost`, payouts, reports |
| `STORE_MANAGER` | shop floor lead | POS, `pos:approve_override`, shifts, inventory adjust, stocktake approve |
| `SALES_STAFF` | counter staff | POS sell, product lookup, create walk-in sourcing orders |
| `WAREHOUSE_STAFF` | pick/pack/receive | fulfilment queue, pick/pack, GRN create, stocktake count |
| `PROCUREMENT_OFFICER` | sourcing | suppliers, POs, sourcing queue, part requests, supplier prices (submit) |
| `DISPATCHER` | logistics | jobs, rider assignment, COD handover |
| `CUSTOMER`, `TRADE_CUSTOMER` | storefront | own orders, own profile |
| `SUPPLIER` | supplier portal | own POs, own catalogue, own payments |
| `RIDER` | rider app | own jobs, own earnings |

**Permission naming:** `<module>:<action>` — e.g. `catalog:write`, `pricing:view_cost`, `inventory:adjust`, `inventory:approve_stocktake`, `orders:read_all`, `orders:update_status`, `orders:cancel`, `orders:refund`, `procurement:create_po`, `procurement:send_po`, `procurement:approve_restock`, `procurement:approve_supplier_prices`, `logistics:assign`, `logistics:manage_riders`, `logistics:reconcile_cod`, `pos:sell`, `pos:approve_override`, `pos:manage_shift`, `finance:view`, `finance:approve_below_cost`, `finance:approve_payouts`, `reports:export`, `users:manage`, `users:manage_roles`, `settings:manage`, `audit:view`.

**Ownership checks** (row-level) live in services: customers only see their own orders/addresses/garage; supplier users only POs where `supplierId = user.supplierId`; riders only jobs where `riderId = user.riderId`. Return **404** (not 403) for other people's resources.

### 11.3 Security checklist (OWASP Top 10, SRS §7.2)

- [ ] HTTPS only (TLS 1.2+ at the load balancer, 1.3 preferred), HSTS via helmet.
- [ ] Helmet defaults; CORS allow-list per environment (storefront, admin, POS, supplier, rider origins only); `credentials: true` only for allowed origins.
- [ ] Rate limits (Redis): global 300 req/min/IP; auth endpoints 10/min/IP + per-account; OTP send 3/10 min/phone; search 60/min/IP; checkout 20/min/user.
- [ ] Zod validation on every input; body size limit 1 MB (uploads go direct to S3 via presigned URL, max 10 MB images / 20 MB PDFs, content-type allow-list, re-encoded by sharp).
- [ ] No raw SQL string concatenation — Prisma tagged templates / TypedSQL only.
- [ ] **Admin IP allow-listing** (SRS): `ADMIN_IP_ALLOWLIST` env (CIDRs); applied to `/api/v1/admin/*` and `/api/v1/pos/*` when set. Behind a proxy, trust only the configured proxy hops for `X-Forwarded-For`.
- [ ] **Field-level encryption (AES-256-GCM)** for: rider national ID, payout details (supplier/rider), TOTP secrets, KRA PIN. Key from `FIELD_ENCRYPTION_KEY` (32 bytes, base64), key-id prefix on ciphertext to allow rotation. Database disk encryption at rest at the provider level as well.
- [ ] **PCI:** card data never touches our servers — Stripe Elements/PaymentIntents only; POS card terminal is external (we store only the terminal reference). This keeps us in PCI SAQ-A scope.
- [ ] **Webhooks:** Stripe signature verified on raw body; M-Pesa callbacks: secret path token + IP allow-list (Safaricom ranges, configurable) + **always re-verify via STK Query** before marking paid; amount and phone must match the attempt.
- [ ] Secrets only from env/secret manager; `.env` never committed; config validated at boot.
- [ ] Audit log for all staff/supplier mutations (BR-010), append-only at DB-permission level.
- [ ] Dependency scanning (`pnpm audit` / Dependabot) in CI; Docker image runs as non-root, minimal base (`node:24-alpine` or distroless).
- [ ] Error responses never include stack traces or internal data in production.
- [ ] Data protection (Kenya DPA 2019): customer data export endpoint and anonymisation on deletion (orders kept for 7 years per KRA, but PII replaced with tokens) — see §16.5.

---

## 12. API design and endpoint catalogue

### 12.1 Conventions
- Base path `/api/v1`. Audience-prefixed groups: storefront (no prefix), `/admin`, `/pos`, `/supplier`, `/rider`, `/webhooks`.
- JSON, camelCase. Plural resource nouns. Actions that aren't CRUD are sub-resources with verbs: `POST /admin/orders/:id/cancel`.
- `Idempotency-Key` header **required** on: `POST /orders`, `POST /orders/:id/payments`, `POST /pos/sales`, `POST /admin/payouts`, refunds. Stored in Redis (24 h) with request hash + response.
- Optimistic concurrency on staff edits of products, POs, and settings: `If-Match: <version>` → `409 CONFLICT` if stale.
- OpenAPI at `/docs` (disabled in production unless `DOCS_ENABLED=true`).

### 12.2 Endpoint catalogue

Legend: 🌐 public · 👤 customer · 🛠 staff (permission) · 🏭 supplier · 🏍 rider · 🔔 webhook. **M#** = milestone that delivers it.

**Auth** (M1)
| Method & path | Who | Purpose |
|---|---|---|
| `POST /auth/register` | 🌐 | customer sign-up (email/phone + password) |
| `POST /auth/login` | 🌐 | password login → tokens, or `{ twoFactorRequired, challengeId }` |
| `POST /auth/2fa/verify` | 🌐 | complete 2FA challenge |
| `POST /auth/refresh` · `POST /auth/logout` | 👤🛠🏭🏍 | rotate / revoke |
| `POST /auth/otp/request` · `POST /auth/otp/verify` | 🌐 | phone verification, rider login (M14) |
| `POST /auth/password/forgot` · `POST /auth/password/reset` | 🌐 | reset flow |
| `POST /auth/2fa/setup` · `POST /auth/2fa/enable` · `POST /auth/2fa/disable` | 👤🛠🏭 | TOTP management |
| `GET /me` · `PATCH /me` | all | profile |

**Vehicles & fitment** (M2)
| | | |
|---|---|---|
| `GET /vehicles/years` · `/vehicles/makes?year=` · `/vehicles/models?makeId=&year=` · `/vehicles/variants?modelId=&year=` | 🌐 | YMM cascade |
| `GET /vehicles/vin/:vin` | 🌐 | VIN/chassis decode → vehicle(s) |
| `GET/POST/PATCH/DELETE /me/garage[/:id]` · `POST /me/garage/:id/activate` | 👤 | My Garage (max 10) |

**Catalogue & search** (M2–M3, M7)
| | | |
|---|---|---|
| `GET /categories` · `GET /brands` | 🌐 | navigation |
| `GET /products?q=&category=&brand=&vehicleId=&origin=&grade=&priceMin=&priceMax=&availability=&sort=&cursor=` | 🌐 | search & browse with facets |
| `GET /search/suggest?q=` | 🌐 | autocomplete (≥ 2 chars) |
| `GET /products/:slug` | 🌐 | PDP: details, availability, price for the caller's tier, fitment check for `?vehicleId=`, cross-refs |
| `GET /products/:slug/availability?qty=&zoneId=` | 🌐 | live availability + lead time |
| `GET /part-numbers/:number` | 🌐 | cross-reference lookup |
| `GET/POST/PATCH /admin/products[/:id]`, `POST /admin/products/:id/archive` | 🛠 `catalog:write` | CRUD (cost fields need `pricing:view_cost`) |
| `POST /admin/products/import` (CSV) · `POST /admin/fitments/import` (CSV/ACES) | 🛠 | bulk import (async job → result report) |
| `POST /admin/products/:id/media/presign` · `POST /admin/products/:id/media` · `PATCH .../media/order` | 🛠 | images & PDFs |
| `GET/POST/PATCH /admin/categories`, `/admin/brands`, `/admin/vehicles` | 🛠 | taxonomy |
| `GET /admin/products/:id/audit` | 🛠 `audit:view` | change history |

**Cart & checkout & orders (customer)** (M5)
| | | |
|---|---|---|
| `GET /cart` · `POST /cart/items` · `PATCH /cart/items/:id` · `DELETE /cart/items/:id` · `POST /cart/merge` | 🌐👤 | cart (guest token or user) |
| `GET /delivery-zones` · `POST /delivery/quote` | 🌐 | zones & fee |
| `POST /checkout/quote` | 🌐👤 | full priced quote, no side effects |
| `POST /orders` (Idempotency-Key) | 🌐👤 | create order (`PENDING_PAYMENT`) |
| `POST /orders/:id/payments` (Idempotency-Key) | 🌐👤 | initiate M-Pesa STK / Stripe PI |
| `GET /orders/:id/payments/:paymentId` | 🌐👤 | poll payment state |
| `GET /me/orders` · `GET /me/orders/:number` | 👤 | history, timeline (customer-visible texts only) |
| `GET /orders/track/:number?phone=` | 🌐 | guest tracking (phone must match) |
| `POST /me/orders/:number/cancel` | 👤 | per §8.5 rules |
| `POST /me/orders/:number/reorder` | 👤 | copy into cart |
| `GET/POST/PATCH/DELETE /me/addresses` | 👤 | address book |

**Admin — orders & fulfilment** (M6)
| | | |
|---|---|---|
| `GET /admin/orders` (filters: channel, status, paymentStatus, method, date range, rider, source) | 🛠 `orders:read_all` | orders table |
| `GET /admin/orders/:id` | 🛠 | full detail incl. timeline, sourcing, packing, delivery, margin (perm) |
| `POST /admin/orders/:id/confirm` · `/cancel` · `/notes` | 🛠 | actions |
| `GET /admin/fulfilment/queue` | 🛠 | picking queue |
| `POST /admin/orders/:id/pick` · `/pack` · `/ready-for-collection` · `/handover` | 🛠 | fulfilment steps |
| `GET /admin/orders/:id/packing-slip.pdf` · `/label.pdf` · `/invoice.pdf` | 🛠 | documents |
| `POST /admin/orders/bulk/{print-slips,assign-rider,export}` | 🛠 | bulk actions |
| `POST /admin/orders/:id/refunds` (Idempotency-Key) | 🛠 `orders:refund` | refund (RMA rules) |

**Admin — inventory** (M4)
| | | |
|---|---|---|
| `GET /admin/inventory` (dashboard KPIs) · `GET /admin/inventory/products/:id` (levels, reservations, movements) | 🛠 | stock views |
| `POST /admin/inventory/adjustments` | 🛠 `inventory:adjust` | manual in/out with reason |
| `GET/POST /admin/locations`, `/admin/bins`, `PATCH /admin/inventory/products/:id/bin` | 🛠 | bins |
| `GET /admin/inventory/low-stock` · `GET /admin/inventory/reorder-report` | 🛠 | alerts, reorder |
| `POST /admin/labels/barcodes` (productIds → PDF) | 🛠 | label printing |
| `POST /admin/stocktakes` · `POST /admin/stocktakes/:id/counts` · `POST .../submit` · `POST .../approve` · `GET .../discrepancies` | 🛠 | stocktake |

**Admin — procurement** (M8)
| | | |
|---|---|---|
| `GET/POST/PATCH /admin/suppliers[/:id]` · `POST /admin/suppliers/:id/{suspend,blacklist,reactivate}` | 🛠 | supplier directory |
| `GET /admin/suppliers/:id/performance` · `GET /admin/suppliers/:id/payables` | 🛠 | dashboards |
| `GET/POST /admin/suppliers/:id/catalog` · `POST /admin/suppliers/:id/catalog/import` · `POST /admin/supplier-prices/:itemId/approve` | 🛠 | price lists |
| `GET /admin/sourcing/queue` · `GET /admin/sourcing/candidates?orderItemId=` | 🛠 | sourcing queue + ranked suppliers |
| `GET/POST/PATCH /admin/purchase-orders[/:id]` | 🛠 `procurement:create_po` | POs |
| `POST /admin/purchase-orders/:id/{submit-for-approval,approve,send,log-supplier-response,cancel}` | 🛠 | PO actions |
| `GET /admin/purchase-orders/:id/pdf` | 🛠 | PO PDF |
| `POST /admin/purchase-orders/:id/invoice` · `POST /admin/purchase-orders/:id/pay` | 🛠 `finance:*` | invoice match & pay |
| `POST /admin/grns` · `PATCH /admin/grns/:id/lines/:lineId` · `POST /admin/grns/:id/complete` · `GET /admin/grns` | 🛠 | goods received |

**Admin — logistics** (M9)
| | | |
|---|---|---|
| `GET/POST/PATCH /admin/riders[/:id]` · `POST /admin/riders/:id/{approve,suspend,reactivate,duty}` | 🛠 `logistics:manage_riders` | rider directory |
| `GET /admin/riders/:id/performance` · `GET /admin/riders/:id/earnings` | 🛠 | KPIs, earnings |
| `GET /admin/logistics/jobs` · `POST /admin/logistics/jobs` (collection from PO / delivery from order) | 🛠 | jobs |
| `POST /admin/logistics/jobs/:id/{assign,unassign,start,collected,arrived-hub,delivered,confirm,fail,cancel}` · `POST .../proof/presign` | 🛠 `logistics:assign` | status updates on behalf of riders (Phase 1) |
| `GET/POST/PATCH /admin/delivery-zones` | 🛠 | zones & fees |
| `GET /admin/cod` (outstanding / by rider / day) · `POST /admin/cod/:id/handover` | 🛠 `logistics:reconcile_cod` | COD reconciliation |
| `POST /admin/riders/:id/deductions` | 🛠 | deductions (approval) |

**POS** (M10)
| | | |
|---|---|---|
| `POST /pos/shifts/open` · `GET /pos/shifts/current` · `POST /pos/shifts/:id/close` · `POST /pos/shifts/:id/cash-movements` | 🛠 `pos:manage_shift` | shifts, pay-in/out |
| `GET /pos/products/lookup?q=|barcode=|vehicleId=` | 🛠 `pos:sell` | fast lookup with bin + availability |
| `POST /pos/quote` | 🛠 | price a basket, returns sourcing options for OOS lines |
| `POST /pos/sales` (Idempotency-Key) · `GET /pos/sales/:id` | 🛠 | complete sale / poll |
| `POST /pos/approvals` | 🛠 (manager creds) | manager override token |
| `POST /pos/sales/:id/void` · `POST /pos/sales/:id/refund` | 🛠 + approval | void / refund |
| `GET /pos/sales/:id/receipt` · `POST /pos/sales/:id/receipt/send` | 🛠 | receipt print / SMS / email |
| `GET /pos/reports/end-of-day?registerId=&date=` | 🛠 | till report |

**Finance & reports** (M11)
| | | |
|---|---|---|
| `GET /admin/finance/revenue` · `/margin` · `/vat?period=` · `/payables` · `/rider-payables` · `/cod` | 🛠 `finance:view` | dashboards |
| `POST /admin/payouts/riders` (batch preview) · `POST /admin/payouts/:id/approve` | 🛠 `finance:approve_payouts` | payouts |
| `GET /admin/dashboard/kpis` · `GET /admin/dashboard/pipelines` · `GET /admin/alerts` | 🛠 | live dashboard (SRS §4.1) |
| `POST /admin/reports/:reportKey/export { format, filters }` · `GET /admin/exports/:id` | 🛠 `reports:export` | async CSV/XLSX/PDF |
| `GET/PATCH /admin/settings[/:key]` · `GET /admin/audit-logs` | 🛠 | settings, audit |
| `GET/POST/PATCH /admin/users` · `/admin/roles` | 🛠 | staff & roles |
| `GET /admin/customers` · `GET /admin/customers/:id` · `POST /admin/customers/:id/message` | 🛠 | CRM |

**Supplier portal** (M13)
| | | |
|---|---|---|
| `GET /supplier/dashboard` | 🏭 | open/confirmed/completed POs, outstanding payments |
| `GET /supplier/purchase-orders` · `GET /supplier/purchase-orders/:id` | 🏭 | own POs only (no customer data!) |
| `POST /supplier/purchase-orders/:id/{confirm,partial,reject,handover}` | 🏭 | respond, verify collection code |
| `GET /supplier/catalog` · `POST /supplier/catalog/import` · `GET /supplier/catalog/template.xlsx` | 🏭 | price lists (pending approval) |
| `GET /supplier/payments` · `GET /supplier/payments/:id/remittance.pdf` | 🏭 | payments |

> Supplier-facing DTOs must not expose customer names, phones, addresses, or selling prices — confidentiality goes both ways.

**Part requests** (M12)
| | | |
|---|---|---|
| `POST /part-requests` | 🌐👤 | submit (rate-limited, photo upload via presign) |
| `GET /me/part-requests` · `GET /me/part-requests/:number` | 👤 | track |
| `GET /quotes/:token` · `POST /quotes/:token/accept` · `POST /quotes/:token/decline` | 🌐 | quote page + pay |
| `GET /admin/part-requests` · `POST /admin/part-requests/:id/{claim,quote,close}` | 🛠 | queue |

**Rider app** (M14)
| | | |
|---|---|---|
| `GET /rider/jobs?status=available|mine` · `GET /rider/jobs/:id` | 🏍 | inbox & detail |
| `POST /rider/jobs/:id/{accept,start,collected,arrived-hub,delivered,fail}` | 🏍 | status updates (OTP / photo, COD amount) |
| `POST /rider/location` | 🏍 | GPS ping (rate-limited, Redis geo; persisted sampled) |
| `GET /rider/earnings` · `POST /rider/duty` | 🏍 | earnings, on/off duty |

**Webhooks** (M5)
| | | |
|---|---|---|
| `POST /webhooks/mpesa/stk/:secret` · `POST /webhooks/mpesa/b2c/result/:secret` · `/b2c/timeout/:secret` | 🔔 | Daraja callbacks |
| `POST /webhooks/stripe` | 🔔 | Stripe events (raw body) |
| `POST /webhooks/africastalking/delivery` · `POST /webhooks/sendgrid/events` | 🔔 | delivery reports |

**System**
| | | |
|---|---|---|
| `GET /health` (liveness) · `GET /ready` (DB + Redis reachable) · `GET /metrics` (Prometheus, internal only) | infra | |

### 12.3 Real-time channels (Socket.IO)

Namespace `/rt`, JWT auth on connect, rooms joined server-side by permission:
- `staff:orders` — `order.created`, `order.status_changed` (live order feed).
- `staff:inventory` — `inventory.changed { productId, available }` (POS + admin, must arrive < 5 s after commit).
- `staff:alerts` — overdue PO, overdue delivery, COD pending, failed GRN, payment anomalies.
- `pos:<registerId>` — `payment.updated` for STK at the counter.
- `customer:<userId>` — own order status updates.
- `rider:<riderId>` (Phase 3) — job offers/assignments.

Websocket messages are **notifications to refetch or patch**, not the source of truth.

---

## 13. Background jobs, events and real-time

### 13.1 Queues (`src/shared/queue/queues.ts`)

| Queue | Producer | Consumer does | Retry |
|---|---|---|---|
| `outbox` | outbox relay | fan out events to the queues below | n/a |
| `notifications` | events | render template, send SMS/email/WhatsApp, log | 5×, exponential |
| `search-index` | product/inventory events | upsert docs in OpenSearch | 10× |
| `realtime` | events | emit Socket.IO messages | 3× |
| `finance` | order/payment/GRN/job/payout events | post journal entries (idempotent) | 10× then alert |
| `payments` | payment initiation | STK status query after 60 s/120 s/300 s if no callback; Stripe reconciliation | 5× |
| `payouts` | approved payouts | M-Pesa B2C, poll results | 5× then manual |
| `imports` | admin uploads | product/fitment/supplier price CSV/XLSX parsing → result report | 1× |
| `exports` | report requests | generate CSV/XLSX/PDF → S3 → signed URL | 3× |
| `documents` | events | PO PDF, invoices, packing slips, receipts | 3× |

Every processor: idempotent, logs with `jobId` + `eventId`, has a timeout, and sends to a **dead-letter** (failed set) with an admin alert after final failure.

### 13.2 Scheduled (repeatable) jobs

| Job | Schedule | Purpose |
|---|---|---|
| `reservations.expire` | every 1 min | release expired reservations, cancel unpaid orders |
| `payments.reconcile-pending` | every 2 min | STK query for `PENDING` payments older than 2 min |
| `procurement.overdue-confirmations` | every 5 min | POs `SENT` past `confirmTimeoutMins` → alert |
| `logistics.overdue-collections` | every 5 min | jobs past ETA / collection timeout → alert |
| `logistics.overdue-deliveries` | every 5 min | deliveries past promise → alert |
| `cod.reconciliation-alerts` | hourly | outstanding COD > 24 h (BR-006) |
| `finance.supplier-payables-due` | daily 07:00 EAT | due/overdue supplier payments |
| `payouts.rider-batch` | daily 19:00 EAT (or weekly) | prepare rider payout batch for approval |
| `suppliers.performance` · `riders.performance` | nightly 02:00 | recompute scores |
| `inventory.low-stock-digest` | daily 07:30 | low stock + reorder report email |
| `partRequests.search-timeout` | every 15 min | requests in `SEARCHING` past timeout → alert |
| `retention.purge` | weekly | enforce §16.5 retention |
| `outbox.cleanup` | daily | delete published outbox rows > 7 days |

Use BullMQ repeatable jobs with `Africa/Nairobi` timezone; guard each with a Redis lock so only one worker runs it.

### 13.3 Domain event catalogue (`src/shared/events/event-types.ts`)

`order.created`, `order.placed`, `order.status_changed`, `order.cancelled`, `order.delivered`, `order.completed`, `payment.initiated`, `payment.succeeded`, `payment.failed`, `refund.succeeded`, `inventory.changed`, `inventory.low_stock`, `product.created`, `product.updated`, `product.price_changed`, `po.created`, `po.sent`, `po.confirmed`, `po.rejected`, `po.received`, `po.paid`, `grn.completed`, `grn.failed`, `job.created`, `job.assigned`, `job.status_changed`, `job.completed`, `cod.collected`, `cod.reconciled`, `cod.discrepancy`, `rider.approved`, `payout.succeeded`, `pos.sale_completed`, `pos.shift_closed`, `part_request.created`, `part_request.quoted`, `part_request.accepted`, `user.registered`, `alert.raised`.

Payloads carry IDs + the minimum needed fields; consumers reload what they need.

---

## 14. Integrations

Each lives in `src/integrations/<provider>/` behind an interface, with a `fake.ts`. HTTP calls use `undici`/`fetch` with timeouts (5 s default), retries only on idempotent operations, and a circuit breaker. All credentials via env.

| Integration | Interface | Notes | Milestone |
|---|---|---|---|
| **M-Pesa Daraja** | `MpesaClient.stkPush`, `stkQuery`, `b2cPayment`, `registerC2BUrls` | OAuth token cached in Redis (expires ~1 h). STK: `AccountReference = order number`, `TransactionDesc` short. Callback: dedupe via `webhook_events(MPESA, CheckoutRequestID)`; `ResultCode 0` → re-verify with `stkQuery`, check amount ≥ expected and match `CheckoutRequestID` → payment `SUCCEEDED` with `MpesaReceiptNumber` as `providerRef`. Non-zero → `FAILED` with mapped reason (cancelled by user, insufficient funds, timeout). B2C for rider/supplier payouts with result + timeout URLs. Sandbox vs production via env. | M5, M11 |
| **Stripe** | `StripeClient.createPaymentIntent`, `refund`, `constructEvent` | PaymentIntents (KES), `metadata.orderId`, idempotency key = payment id. Webhooks: `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded`. Raw body route. | M5 |
| **Africa's Talking** | `SmsClient.send(to, text)` | Sender ID from env; delivery reports webhook updates `NotificationLog`. | M1 (OTP), M5 |
| **SendGrid** | `EmailClient.send(template, to, data, attachments?)` | Dynamic templates or local MJML → HTML; PO/invoice PDFs as attachments. Mailpit locally. | M5 |
| **Twilio WhatsApp** | `WhatsAppClient.sendTemplate` | Approved templates only; PO notification, rider jobs, customer updates. | M12 |
| **Google Maps** | `MapsClient.geocode`, `distanceMatrix` | Server-side for zone matching and per-km fees; client does autocomplete. Cache results. | M9 |
| **TecDoc / AutoSync** | `VehicleDataProvider.importVehicles`, `decodeVin`, `fitmentsForPart` | Batch import into our tables (we never query the provider on the hot path). | M2/M7 |
| **OpenSearch / Elasticsearch** | `SearchProvider` | §8.11 | M7 |
| **S3 / R2** | `Storage.presignPut`, `presignGet`, `delete` | Public bucket (product images via CDN) vs private bucket (proofs, invoices, exports). | M2 |
| **KRA eTIMS** | `FiscalClient.issueInvoice` | Fiscal invoice per completed sale; QR on receipt; queue + retry; never blocks a sale (store-and-forward). | M12 |
| **Sendy / DHL Kenya** | `CourierClient.createShipment`, `track` | For orders outside boda boda zones (`deliveryMethod = COURIER`). | M12 |
| **NTSA, QuickBooks/Xero, Firebase** | — | Phase 2+ (M15+). Interfaces only when started. | later |

---

## 15. Testing strategy

### 15.1 Layers and targets

| Layer | Tool | What | Target |
|---|---|---|---|
| Unit | Vitest | domain functions: availability, pricing/VAT/margin, landed cost, lead time & cut-off, state machines, order status aggregation, COD reconciliation math, shift expected cash | ≥ 95% branch coverage on `*.domain.ts` / `*.machine.ts` |
| Integration | Vitest + Testcontainers (Postgres, Redis) + `app.inject()` | every route: happy path, validation error, auth/permission failure, state-conflict | every endpoint |
| Concurrency | Integration | parallel operations against the real DB | see 15.2 |
| E2E journeys | Vitest + fakes for integrations | full business flows | see 15.3 |
| Contract | Zod response schemas | responses match documented schema | automatic |
| Load | k6 (`/test/load`) | search, PDP, checkout, POS sale | p95 < 300 ms API, search < 500 ms at target RPS |

Test data via **factories** (`test/setup/factories.ts`) — never rely on seed data order. Each integration test file gets a clean schema (truncate between tests or transactional rollback).

### 15.2 Must-have concurrency tests
1. **Last unit race:** product with `on_hand=1`; 20 parallel `POST /orders` → exactly 1 succeeds, 19 get `INSUFFICIENT_STOCK`; `reserved=1`.
2. **Online vs POS race:** 1 unit; simultaneous online order and POS sale → exactly one wins.
3. **Duplicate M-Pesa callbacks:** same callback delivered 5× concurrently → one `SUCCEEDED` payment, one journal entry, order `PLACED` once, one SMS.
4. **Idempotent checkout:** same `Idempotency-Key` 5× in parallel → one order.
5. **Double status transition:** two staff mark the same order `PACKED` at once → one succeeds, other `CONFLICT`.
6. **Reservation expiry vs late payment:** expiry job and callback race → no negative stock, payment never lost.

### 15.3 E2E journeys (each one a test file)
1. Online in-stock: browse → quote → order → STK success → confirm → pick → pack → delivery job → dispatched → delivered (photo) → completed; ledger balances; stock correct.
2. Online sourced: order with lead time acceptance → deposit → PO → supplier confirm → collection job → collected (code) → GRN pass → allocated → pack → deliver → COD balance → COD reconciled → completed.
3. GRN fail: QC fails → item FAILED → re-source with second supplier → completes.
4. Supplier rejects PO → alert → new PO → completes.
5. Walk-in in-stock POS sale (cash) + shift close with correct expected cash.
6. Walk-in sourced with deposit → customer cancels after PO sent → deposit retained (BR-008).
7. Unpaid order expires after 30 min → stock released.
8. Price below cost at POS → blocked → manager+finance approval → allowed and audited.
9. COD not reconciled for 25 h → alert raised.
10. Confidentiality crawler (§6.6) across all customer endpoints and notification templates.

### 15.4 CI gates
`pnpm lint` → `pnpm typecheck` → `pnpm test:unit` → `pnpm test:int` → `pnpm build` → `prisma migrate diff` (schema and migrations in sync). A PR cannot merge red.

---

## 16. Operations: config, logging, observability, deployment

### 16.1 Environment variables (validated by Zod at boot — the process exits on invalid config)

```bash
NODE_ENV=development|test|production
PORT=4000
APP_BASE_URL=https://api.myspares.co.ke
STOREFRONT_URL=… ADMIN_URL=… POS_URL=… SUPPLIER_PORTAL_URL=…
CORS_ORIGINS=https://myspares.co.ke,https://admin.myspares.co.ke
TRUST_PROXY_HOPS=1
ADMIN_IP_ALLOWLIST=            # comma-separated CIDRs; empty = disabled

DATABASE_URL=postgresql://myspares_app:…@host:5432/myspares
DATABASE_MIGRATION_URL=        # privileged role for migrations only
REDIS_URL=redis://…

JWT_PRIVATE_KEY=… JWT_PUBLIC_KEY=…  JWT_ACCESS_TTL=15m
REFRESH_TTL_CUSTOMER_DAYS=30   REFRESH_TTL_STAFF_HOURS=12
FIELD_ENCRYPTION_KEY=base64:…  OTP_HMAC_SECRET=…

INTEGRATIONS_MODE=live|fake
MPESA_ENV=sandbox|production MPESA_CONSUMER_KEY=… MPESA_CONSUMER_SECRET=… MPESA_SHORTCODE=… MPESA_PASSKEY=…
MPESA_CALLBACK_SECRET=… MPESA_B2C_INITIATOR=… MPESA_B2C_SECURITY_CREDENTIAL=… MPESA_ALLOWED_IPS=…
STRIPE_SECRET_KEY=… STRIPE_WEBHOOK_SECRET=…
AT_USERNAME=… AT_API_KEY=… AT_SENDER_ID=MYSPARES
SENDGRID_API_KEY=… EMAIL_FROM="MySpares <orders@myspares.co.ke>"
TWILIO_ACCOUNT_SID=… TWILIO_AUTH_TOKEN=… TWILIO_WHATSAPP_FROM=…
GOOGLE_MAPS_API_KEY=…
S3_ENDPOINT=… S3_REGION=… S3_ACCESS_KEY=… S3_SECRET_KEY=… S3_PUBLIC_BUCKET=… S3_PRIVATE_BUCKET=… CDN_BASE_URL=…
SEARCH_PROVIDER=postgres|opensearch  OPENSEARCH_URL=…
TECDOC_API_KEY=…
ETIMS_…=…
LOG_LEVEL=info  DOCS_ENABLED=false  SENTRY_DSN=…  OTEL_EXPORTER_OTLP_ENDPOINT=…
```

`.env.example` documents every variable with a comment.

### 16.2 Logging
- pino JSON; every log line has `requestId` (from `x-request-id` or generated), `userId` when known, `module`.
- **Redact:** `authorization`, `cookie`, `password`, `otp`, `code`, `token`, `nationalId`, `mpesaNumber`, card data, full phone numbers (mask middle digits).
- Log every state transition at `info`, every integration call at `debug` (with duration), every failure at `warn`/`error`.

### 16.3 Observability
- `/health`, `/ready`, `/metrics` (prom-client): HTTP latency histograms by route, queue depth & failures per queue, outbox lag (oldest unpublished event age), payment callback latency, reservation expiries, websocket connections.
- OpenTelemetry tracing (HTTP → Prisma → Redis → outbound fetch) to any OTLP backend (Datadog per SRS, or Grafana).
- Error tracking: Sentry.
- **Alerts:** outbox lag > 60 s, any DLQ entry, payment `PENDING` > 10 min, p95 > 300 ms for 5 min, DB connections > 80%, failed payouts.

### 16.4 Deployment
- Docker multi-stage build; `node dist/server.js` and `node dist/worker.js` as separate services (same image).
- Migrations run as a one-off release step (`prisma migrate deploy`) with the migration role — **never at app boot**.
- Managed Postgres (Multi-AZ, PITR; hourly incremental/daily full backups, 30-day retention, RPO < 1 h, RTO < 4 h), managed Redis with persistence, S3/R2 + CDN.
- Horizontal autoscaling for API (CPU/latency) and workers (queue depth). Graceful shutdown: stop accepting, finish in-flight requests/jobs (30 s), close Prisma/Redis.
- Environments: `local` (docker-compose), `staging` (sandbox integrations, anonymised data), `production`.
- Zero-downtime migrations: expand → migrate data → contract, across separate releases.

### 16.5 Data retention & privacy (SRS §10.2, Kenya DPA 2019)

| Data | Retention | Mechanism |
|---|---|---|
| Orders, payments, journal entries | 7 years | never deleted; PII anonymised on account deletion |
| Supplier & PO records | 7 years | — |
| GRNs, logistics jobs | 3 years | purge job |
| Audit logs | 2 years | purge job (partition by month for cheap drops) |
| Part requests, support | 3 years | purge job |
| Customer PII | active + 2 years after deletion request | anonymise (name → "Deleted user", phone/email → hashed tokens) |

Endpoints: `GET /me/data-export` (async JSON/ZIP), `POST /me/delete-account` (verification + anonymisation job).

---

## 17. Decisions the SRS leaves open

These are this guide's decisions. Record any further ones in `docs/DECISIONS.md`.

| # | Topic | Decision | Reason |
|---|---|---|---|
| D1 | Framework | Fastify 5 modular monolith, not microservices | Team size & phase; strong boundaries keep later extraction possible |
| D2 | Stock reservation timing | SRS says "reservation on confirmed order" **and** "held 30 min for online orders" → reserve at order creation (`PENDING_PAYMENT`) with a 30-min TTL; never at add-to-cart | Satisfies BR-002 and prevents overselling during STK push |
| D3 | When `on_hand` decrements | At dispatch/handover (`commit`); `available` drops at reservation | Physical stock stays accurate for stocktakes; customers still see availability drop instantly |
| D4 | Low-stock threshold | `1 ≤ available ≤ product.lowStockThreshold (default 3)` | SRS "1–3 units" |
| D5 | Price VAT treatment | Retail/trade prices VAT-inclusive; costs VAT-exclusive; VAT 16% default per product | Kenyan B2C norm; margins computed net |
| D6 | Money type | Integer cents (`Int`), bps for percentages | No float errors; values fit comfortably |
| D7 | Partial shipments | Not in Phase 1 — one consignment per order; customer still sees per-group timelines at checkout | Simpler logistics; revisit Phase 2 |
| D8 | COD | Allowed only for all-in-stock orders under `cod.maxOrderCents`; COD orders count as "confirmed" (BR-001 exception explicitly via COD acceptance) | Limits cash risk |
| D9 | Online sourced cancellation | Free before PO sent; after that staff-only with configurable restocking fee (default 0) | BR-008 covers walk-in only; keeps goodwill while protecting cash |
| D10 | Collection code | 6-digit, hashed, sent to rider and supplier; verified by supplier (portal) or staff (phone); rotated on reassignment | SRS §2.7.2 and §5.2 combined |
| D11 | Delivery proof | Phase 1 photo; OTP from rider-app milestone; configurable | SRS phases |
| D12 | Search | Postgres FTS first, OpenSearch in M7, Postgres stays as fallback | Ships search early and satisfies fallback requirement |
| D13 | Ledger | Lightweight double-entry inside the app; QuickBooks/Xero export later | Trustworthy margin/VAT numbers from day one |
| D14 | Multi-location | Schema supports multiple locations; Phase 1 runs one default hub | SRS "same inventory unless separate warehouse configured" |
| D15 | Vehicle identification in Kenya | Accept both 17-char VINs and Japanese chassis/frame numbers | Most imports are Japanese used vehicles without 17-char VINs |
| D16 | Multi-vendor marketplace (SRS §1.3) | Deferred — not designed in this guide; do not build until explicitly requested | Conflicts with "customer always buys from MySpares"; needs its own design |

---

## 18. Build order (milestones with Definition of Done)

**Every milestone's DoD also includes:** lint + typecheck clean, tests for new code (§15), OpenAPI updated, audit + outbox events wired for new mutations, `docs/DECISIONS.md` updated if anything was decided.

| # | Milestone | Scope | Definition of Done |
|---|---|---|---|
| **M0** | Skeleton | pnpm + TS strict + ESLint/Prettier; Fastify app with error handler, request ID, pino, helmet, CORS, rate limit, swagger; Zod config; Prisma + docker-compose (Postgres, Redis, MinIO, Mailpit, OpenSearch); `/health` `/ready`; worker entry with BullMQ + outbox relay; Testcontainers harness; GitHub Actions CI; Dockerfile | `docker compose up` + `pnpm dev` works; CI green; a sample route has unit + integration tests |
| **M1** | Identity & access | users, roles, permissions (seeded), register/login/refresh/logout, TOTP 2FA (mandatory for staff/supplier), OTP via SMS (fake), password reset, RBAC plugin, ownership helpers, audit module, settings module, field encryption util | Token rotation & reuse detection tested; staff without 2FA can't reach admin routes; every staff mutation writes audit |
| **M2** | Catalogue & vehicles | categories, brands, products (all fields), part numbers & cross-refs, vehicles + YMM cascade + VIN decode (fake provider), fitment + CSV import, garage, media via presigned S3, audience serializers | Public product DTO contains no cost fields (test); fitment check works; imports report row errors |
| **M3** | Search v1 | `SearchProvider` + Postgres implementation, filters/facets/sort, suggest, part-number exact match, NL parser, zero-result CTA flag | Typo query finds product; part-number search ranks exact first; p95 < 500 ms on 50k seeded products |
| **M4** | Inventory | locations/bins, inventory levels with DB CHECKs, atomic reserve/release/commit/receive, movements, adjustments with reasons/approvals, low-stock & reorder report, barcode labels, stocktake | Concurrency tests 15.2 #1 passes at repository level; stocktake variance → adjustments |
| **M5** | Availability, pricing, cart, checkout, payments | availability engine + lead time/cut-off, pricing & VAT & margin domain, cart (guest/user/merge), delivery zones & fees, checkout quote, order creation with idempotency + reservations, M-Pesa STK (+ callback + query reconciliation), Stripe, COD, deposits, reservation expiry job, notifications (SMS/email) for order events | Journeys 15.3 #1 (up to PLACED) and #7 pass; 15.2 #1, #3, #4, #6 pass |
| **M6** | Orders & fulfilment | order machine + aggregate status, admin order list/detail, fulfilment queue, pick/pack with QC, packing slip + label + invoice PDFs, click & collect, cancellation rules + refunds (Stripe/M-Pesa reversal handled manually + logged), customer order history & timeline, guest tracking, Socket.IO live feed | Journey 15.3 #1 passes end-to-end except delivery job (stubbed); 15.2 #5 passes |
| **M7** | Search v2 + vehicle data | OpenSearch provider, indexer consumer, synonyms, circuit-breaker fallback, TecDoc/AutoSync importer | Killing OpenSearch falls back to Postgres without errors |
| **M8** | Procurement | suppliers + contacts + catalogue + price import/approval, sourcing queue + candidate ranking, POs (reactive + restock approval), send via channels + PDFs, supplier response logging, collection codes, GRN with QC + allocation + landed cost/avg cost, supplier invoicing & three-way match, payables, performance job | Journeys 15.3 #3, #4 pass up to GRN; BR-003/011/012 tests pass |
| **M9** | Logistics | riders (encrypted PII), zones + Maps geocoding, collection & delivery jobs, assignment rules + notifications, status updates on behalf of riders, photo proof, failed delivery, COD collections + handover + alerts, rider earnings & deductions, KPIs | Journeys 15.3 #1 and #2 pass fully; BR-005/006 tests pass |
| **M10** | POS | registers, shifts (one open per register), lookup, POS quote incl. sourcing option, sales with split tender, STK at counter via websocket, manager overrides, void/refund, receipts, end-of-day report, walk-in sourcing orders | Journeys 15.3 #5, #6, #8 pass; 15.2 #2 passes; POS sale p95 < 3 s |
| **M11** | Finance & dashboard | ledger accounts, posting consumers for all events, revenue/margin/VAT/payables/COD reports, rider + supplier payouts via M-Pesa B2C with approval, admin dashboard KPIs/pipelines/alerts, async exports (CSV/XLSX/PDF), CRM basics | Every E2E journey ends with a balanced ledger whose totals match orders; VAT report matches order VAT |
| **M12** | Phase 2 commerce | part requests + quotes + pay links, RMA/returns, promotions, loyalty, reviews, B2B trade tiers/bulk pricing, wishlist & alerts, WhatsApp, eTIMS, courier | Each feature's flows tested; BR-009 enforced |
| **M13** | Supplier portal | supplier auth (2FA), dashboard, PO confirm/partial/reject/handover, catalogue upload (pending approval), payments & remittance PDFs | Supplier sees only own POs and no customer PII (test) |
| **M14** | Rider app API | OTP login, job inbox/accept (atomic claim), status updates, delivery OTP, COD entry, GPS pings (Redis GEO), earnings, duty toggle | Two riders accepting the same job → one wins (test) |
| **M15+** | Phase 4 | AI restock, image part ID, fleet portal, authenticity QR, NTSA, accounting sync | Only when requested |

---

## 19. Glossary

| Term | Meaning in this codebase |
|---|---|
| **Available** | `on_hand − reserved` at sellable locations |
| **Reservation** | stock held for an order item (`stock_reservations`), `ACTIVE → COMMITTED | RELEASED` |
| **Commit** | stock physically leaves (dispatch/handover): `on_hand −q`, `reserved −q`, `SALE` movement |
| **Sourced item** | order item fulfilled by buying from a supplier after the order (reactive purchasing) |
| **Reactive PO** | PO linked to a customer order or accepted quote |
| **Restock PO** | proactive PO, requires approval |
| **Landed cost** | supplier cost + allocated collection fee + other costs, per unit |
| **GRN** | goods received note: receipt + quality check of a PO delivery at the hub |
| **Collection job** | boda boda trip supplier → hub |
| **Delivery job** | boda boda trip hub → customer |
| **Collection code** | 6-digit code proving a rider is authorised to collect a PO |
| **COD** | cash on delivery; cash sits in "COD in transit" until handed over at the shop |
| **Shift** | a POS register session with opening float and closing count |
| **Approval** | a recorded manager/finance authorisation for an action above a threshold |
| **Outbox** | table of domain events written in the same transaction as the change, relayed to queues by the worker |
| **Audience serializer** | function producing a DTO for one audience (public/customer/staff/supplier/rider) from an allow-list |
| **bps** | basis points: 100 bps = 1% |
| **EAT** | East Africa Time (UTC+3), `Africa/Nairobi` |

---

*MySpares — built to underpromise, engineered to overdeliver. If you are the agent: start at §18 M0, and keep §2 and §10 open while you work.*
