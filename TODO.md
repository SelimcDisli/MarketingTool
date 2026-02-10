# TODO — Instantly Clone

## Phase 1: Setup & Schema ✅
- [x] Create repo + project structure
- [x] Define Prisma schema (20+ tables)
- [x] Backend setup: Express + TS + middleware
- [x] Configure auth (JWT + API key + RBAC)

## Phase 2: Email Infrastructure ✅
- [x] Email Account Management API (SMTP/IMAP connect, health check, DNS validation, bulk import)
- [x] Campaign Engine API (CRUD, sequences, scheduling, spintax parser, A/Z testing)
- [x] Email Sending Worker (BullMQ, rate limiting, inbox rotation, tracking, slow ramp)
- [x] Warmup System (pool, slow ramp, read emulation, AI conversations, spam-to-inbox)
- [x] Tracking System (open pixel, click redirect, unsubscribe)
- [x] Bounce handling + auto-pause

## Phase 3: Leads & CRM ✅
- [x] Lead Management API (CSV import with auto-mapping, verification, blocklist, custom vars)
- [x] CRM Pipeline API (stages, deals, metrics)
- [x] AI Reply Classification (keyword-based with OpenAI optional)
- [x] Lead Lists + Blocklist management

## Phase 4: Inbox & Analytics ✅
- [x] Unibox API (reply processing, thread view, team notes, bulk ops)
- [x] Reply Processor Worker (IMAP polling, AI classification, OOO detection)
- [x] Analytics System (overview, daily stats, account performance)
- [x] Webhook System (CRUD, HMAC signing, retry, auto-disable)
- [x] Template library

## Phase 5: Infrastructure ✅
- [x] Set up Supabase (24 tables + 14 enums created)
- [x] Set up Redis (Upstash, graceful fallback)
- [x] Create .env with all credentials
- [x] Run migration (raw SQL via pg client)
- [x] Test server starts (port 3001)
- [x] Test API endpoints (register, login, me, campaigns, analytics)
- [x] Push to GitHub

## Phase 6: Frontend (Lovable) ← CURRENT
- [ ] Dashboard page (overview stats, charts)
- [ ] Campaign builder + sequence editor
- [ ] Email accounts page (connect, warmup toggle, DNS status)
- [ ] Lead lists + CSV import
- [ ] Unibox (unified inbox with thread view)
- [ ] Analytics charts (Recharts)
- [ ] CRM pipeline (Kanban board)
- [ ] Settings + team management
- [ ] Template library
- [ ] Onboarding flow
- [ ] Auth pages (login + register)

## Phase 7: Testing & Deploy
- [ ] Test remaining API endpoints (accounts, leads, CRM, webhooks)
- [ ] End-to-end testing
- [ ] Production deployment (Railway/Render)
- [ ] Custom tracking domain setup
- [ ] Monitoring setup
