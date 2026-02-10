# HANDOFF — Sync Context between Claude Code & Antigravity

## Last Editor: Claude Code (Opus)
## Timestamp: 2026-02-11T10:00:00Z
## Current Phase: Phase 5 COMPLETE — Backend fully functional, ready for Frontend

## What was just completed:
- Full project structure created
- Complete Prisma schema with ALL 20+ tables
- Express + TypeScript backend with all middleware (auth, error handling, rate limiting)
- JWT auth + API key auth + workspace-scoped RBAC
- ALL route files implemented (auth, accounts, campaigns, leads, unibox, analytics, crm, webhooks, templates, workspace, tracking)
- ALL workers implemented (emailSender, warmup, replyProcessor, webhookDelivery)
- Utility modules: Spintax parser, DNS checker, encryption, HMAC
- TypeScript compiles with zero errors
- **Supabase connected** — 24 tables + 14 enums created via raw SQL migration
- **Upstash Redis connected** — BullMQ queues initialized (graceful fallback if unavailable)
- **Server tested** — Register, Login, Me, Analytics, Campaign CRUD all working on port 3001
- **Pushed to GitHub** — https://github.com/SelimcDisli/MarketingTool.git

## Infrastructure Details:
- **Supabase**: Project `fbzfamgutqzfoqbgersa` on `aws-1-us-east-1` (NOT eu-central-1!)
- **Connection**: Must use pooler URL (IPv6-only project), Transaction Mode port 6543
- **Prisma**: Interactive transactions need 30s timeout due to pooler latency
- **Redis**: Upstash at `prompt-eel-52736.upstash.io`, TLS on port 6379
- **Migration**: `prisma db push` doesn't work through pgbouncer Transaction Mode — use `prisma/migration.sql` directly

## What needs to be done next:
1. **Frontend (Lovable)** — Use prompt in `docs/LOVABLE_PROMPT.md` to build all 11 pages
2. **Test remaining endpoints** — accounts, leads CSV upload, CRM, webhooks, templates, workspace
3. **Production deployment** — Railway/Render for backend
4. **Domain setup** — Custom tracking domain for open/click tracking

## API Endpoints Tested & Working:
- POST /api/auth/register ✅
- POST /api/auth/login ✅
- GET /api/auth/me ✅
- GET /api/analytics/overview ✅
- POST /api/campaigns ✅
- GET /api/campaigns ✅

## Architecture Decisions Made:
- Prisma ORM with PostgreSQL (Supabase)
- BullMQ for all background job processing
- JWT auth with workspace-scoped access + API key support
- IMAP polling every 60s for reply processing
- Spintax parsed server-side before sending
- Tracking via custom pixel endpoint + link redirect
- A/Z testing with weighted random variant selection
- Inbox rotation with 5-minute gap per account
- Slow ramp for both campaigns and warmup
- AI classification via keyword matching (OpenAI optional)
- Webhook delivery with HMAC signing + exponential backoff retry

## File Structure:
```
backend/
├── prisma/
│   ├── schema.prisma          # Full DB schema (20+ models)
│   └── migration.sql          # Raw SQL migration (use this instead of prisma db push)
├── src/
│   ├── index.ts               # Express server entry point
│   ├── config/
│   │   ├── index.ts           # Environment config
│   │   ├── prisma.ts          # Prisma client (30s transaction timeout)
│   │   ├── redis.ts           # Redis connection (graceful fallback)
│   │   └── queue.ts           # BullMQ queues (safeQueueAdd helper)
│   ├── middleware/
│   │   ├── auth.ts            # JWT + API key auth, RBAC
│   │   └── errorHandler.ts    # Global error handler
│   ├── routes/
│   │   ├── auth.ts            # Register, login, me
│   │   ├── accounts.ts        # Email account management
│   │   ├── campaigns.ts       # Campaign CRUD + steps + variants
│   │   ├── leads.ts           # Lead management + CSV upload + blocklist
│   │   ├── unibox.ts          # Unified inbox
│   │   ├── analytics.ts       # Dashboard + daily + account stats
│   │   ├── crm.ts             # Pipeline + deals
│   │   ├── webhooks.ts        # Webhook management + dispatcher
│   │   ├── templates.ts       # Email templates
│   │   ├── workspace.ts       # Workspace + team management
│   │   └── tracking.ts        # Open pixel + click redirect + unsubscribe
│   ├── workers/
│   │   ├── emailSender.ts     # Campaign email sending
│   │   ├── warmup.ts          # Email warmup
│   │   ├── replyProcessor.ts  # IMAP reply polling + AI classification
│   │   └── webhookDelivery.ts # Webhook delivery with retry
│   ├── utils/
│   │   ├── spintax.ts         # Spintax + merge tag parser
│   │   ├── dns.ts             # SPF/DKIM/DMARC/MX checker
│   │   └── crypto.ts          # AES encryption + HMAC
│   └── types/
│       └── express.d.ts       # Express type augmentation
├── package.json
├── tsconfig.json
└── .env.example
```

## How to Start:
```bash
# 1. Install deps
cd backend && npm install

# 2. Copy env and fill credentials
cp .env.example .env

# 3. Create tables (use raw SQL, NOT prisma db push)
# Execute prisma/migration.sql against your Supabase

# 4. Generate Prisma client
npx prisma generate

# 5. Start dev server
npm run dev    # Server on port 3001

# 6. Start workers (separate terminals, requires Redis)
npm run worker:email
npm run worker:warmup
npm run worker:reply
```
