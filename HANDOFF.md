# HANDOFF — Sync Context between Claude Code & Antigravity

## Last Editor: Claude Code (Opus)
## Timestamp: 2026-02-10T14:30:00Z
## Current Phase: Phase 2 COMPLETE — Ready for Phase 3+

## What was just completed:
- Full project structure created
- Complete Prisma schema with ALL 20+ tables (Users, Workspaces, EmailAccounts, Campaigns, CampaignSteps, StepVariants, Leads, LeadLists, SentEmails, WarmupEmails, UniboxThreads, UniboxMessages, CRM Pipelines/Stages/Deals, Templates, Webhooks, Analytics, Blocklist, ApiKeys)
- Express + TypeScript backend with all middleware (auth, error handling, rate limiting)
- JWT auth + API key auth + workspace-scoped RBAC
- ALL route files implemented:
  - `/api/auth` — Register, Login, Get Me
  - `/api/accounts` — Full CRUD, SMTP test, DNS check, warmup toggle, bulk import
  - `/api/campaigns` — Full CRUD, start/pause, steps, A/Z variants, lead assignment, analytics
  - `/api/leads` — Full CRUD, CSV upload with auto-mapping, verification, lead lists, blocklist
  - `/api/unibox` — Thread list/detail, reply, tag, notes, bulk ops, stats
  - `/api/analytics` — Overview, daily stats, account performance
  - `/api/crm` — Pipelines, stages, deals (full CRUD)
  - `/api/webhooks` — CRUD, test delivery
  - `/api/templates` — CRUD with search
  - `/api/workspace` — Settings, members (invite/update/remove)
  - `/t/open/:id` — Open tracking pixel
  - `/t/click/:id` — Click tracking redirect
  - `/t/unsubscribe/:id` — Unsubscribe handler
- ALL workers implemented:
  - Email Sender Worker (BullMQ, inbox rotation, slow ramp, A/Z testing, bounce handling, auto-pause)
  - Warmup Worker (slow ramp, partner pool, read emulation, spam-to-inbox, reply generation)
  - Reply Processor Worker (IMAP polling, AI classification, OOO detection, auto-unsubscribe)
  - Webhook Delivery Worker (HMAC signing, retry with exponential backoff, auto-disable)
- Utility modules: Spintax parser, DNS checker, encryption, HMAC
- TypeScript compiles with zero errors
- npm dependencies installed

## What needs to be done next:
1. **Set up Supabase** — Create project, get DATABASE_URL, run `prisma db push`
2. **Set up Redis** — Upstash or local Redis, get REDIS_URL
3. **Create .env** — Copy .env.example, fill in credentials
4. **Test API** — Start server with `npm run dev`, test endpoints with curl/Postman
5. **Frontend (Lovable)** — Build all pages (see PLAN.md for page list)
6. **Deploy** — Railway/Render for backend, Lovable for frontend

## Open Issues / Blockers:
- Need Supabase project URL + service key for DATABASE_URL
- Need Redis/Upstash connection string for REDIS_URL
- Need OpenAI API key for AI features (optional, keyword fallback works)
- Need to run `npx prisma db push` once DB is configured

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
├── prisma/schema.prisma          # Full DB schema (20+ models)
├── src/
│   ├── index.ts                  # Express server entry point
│   ├── config/
│   │   ├── index.ts              # Environment config
│   │   ├── prisma.ts             # Prisma client
│   │   ├── redis.ts              # Redis connection
│   │   └── queue.ts              # BullMQ queues
│   ├── middleware/
│   │   ├── auth.ts               # JWT + API key auth, RBAC
│   │   └── errorHandler.ts       # Global error handler
│   ├── routes/
│   │   ├── auth.ts               # Register, login, me
│   │   ├── accounts.ts           # Email account management
│   │   ├── campaigns.ts          # Campaign CRUD + steps + variants
│   │   ├── leads.ts              # Lead management + CSV upload + blocklist
│   │   ├── unibox.ts             # Unified inbox
│   │   ├── analytics.ts          # Dashboard + daily + account stats
│   │   ├── crm.ts                # Pipeline + deals
│   │   ├── webhooks.ts           # Webhook management + dispatcher
│   │   ├── templates.ts          # Email templates
│   │   ├── workspace.ts          # Workspace + team management
│   │   └── tracking.ts           # Open pixel + click redirect + unsubscribe
│   ├── workers/
│   │   ├── emailSender.ts        # Campaign email sending
│   │   ├── warmup.ts             # Email warmup
│   │   ├── replyProcessor.ts     # IMAP reply polling + AI classification
│   │   └── webhookDelivery.ts    # Webhook delivery with retry
│   ├── utils/
│   │   ├── spintax.ts            # Spintax + merge tag parser
│   │   ├── dns.ts                # SPF/DKIM/DMARC/MX checker
│   │   └── crypto.ts             # AES encryption + HMAC
│   └── types/
│       └── express.d.ts          # Express type augmentation
├── package.json
├── tsconfig.json
└── .env.example
```

## How to Start:
```bash
# 1. Copy env
cp .env.example .env
# 2. Fill in DATABASE_URL, REDIS_URL, JWT_SECRET

# 3. Push schema to DB
npx prisma db push

# 4. Start dev server
npm run dev

# 5. Start workers (separate terminals)
npm run worker:email
npm run worker:warmup
npm run worker:reply
```
