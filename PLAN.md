# Instantly Clone — Master Development Plan

## Architecture
```
Frontend (Lovable/React)  <->  Backend API (Node.js/Express/TS)  <->  PostgreSQL + Redis
                                        |
                              Worker Services (BullMQ)
                              - Email Sender Worker
                              - Warmup Worker
                              - Reply Processor Worker
                              - Analytics Aggregator
```

## Tech Stack
- **Backend**: Node.js + Express + TypeScript
- **ORM**: Prisma
- **Database**: PostgreSQL (Supabase)
- **Cache/Queue**: Redis (Upstash) + BullMQ
- **Auth**: JWT + Supabase Auth (OAuth)
- **Email Sending**: Nodemailer (SMTP)
- **Email Reading**: ImapFlow (IMAP)
- **AI Features**: OpenAI API (GPT-4)
- **Tracking**: Custom pixel + redirect endpoints
- **Deployment**: Railway / Render
- **Frontend**: Lovable (React + Tailwind + shadcn/ui)

## Phases
1. **Setup & Schema** (2h) — Project init, DB schema, base config
2. **Email Infrastructure** (5h) — Accounts, Campaigns, Sending, Warmup
3. **Leads & CRM** (3h) — Import, Verification, Pipeline, AI classification
4. **Inbox & Analytics** (3h) — Unibox, Tracking, Webhooks, API
5. **Frontend** (5h) — All pages in Lovable
6. **Testing & Deploy** (2h) — E2E tests, production deployment

## API Endpoints (Target)
### Email Accounts
- POST /api/accounts — Connect email account
- GET /api/accounts — List all accounts
- PATCH /api/accounts/:id — Update account
- DELETE /api/accounts/:id — Remove account
- POST /api/accounts/:id/warmup — Toggle warmup
- GET /api/accounts/:id/health — Health check

### Campaigns
- POST /api/campaigns — Create campaign
- GET /api/campaigns — List campaigns
- GET /api/campaigns/:id — Campaign detail
- PATCH /api/campaigns/:id — Update campaign
- DELETE /api/campaigns/:id — Delete campaign
- POST /api/campaigns/:id/start — Start campaign
- POST /api/campaigns/:id/pause — Pause campaign
- GET /api/campaigns/:id/analytics — Campaign analytics

### Sequences (Campaign Steps)
- POST /api/campaigns/:id/steps — Add step
- PATCH /api/campaigns/:id/steps/:stepId — Update step
- DELETE /api/campaigns/:id/steps/:stepId — Delete step
- POST /api/campaigns/:id/steps/:stepId/variants — Add A/Z variant

### Leads
- POST /api/leads/upload — CSV upload
- POST /api/leads — Create lead
- GET /api/leads — List/search leads
- PATCH /api/leads/:id — Update lead
- DELETE /api/leads/:id — Delete lead
- POST /api/leads/verify — Verify emails
- GET /api/lead-lists — List lead lists
- POST /api/lead-lists — Create lead list

### Blocklist
- GET /api/blocklist — List blocked
- POST /api/blocklist — Add to blocklist
- POST /api/blocklist/import — Import CSV
- DELETE /api/blocklist/:id — Remove

### Unibox
- GET /api/unibox/threads — List threads
- GET /api/unibox/threads/:id — Thread detail
- POST /api/unibox/threads/:id/reply — Send reply
- PATCH /api/unibox/threads/:id/tag — Tag thread
- POST /api/unibox/threads/:id/notes — Add team note

### Analytics
- GET /api/analytics/overview — Dashboard stats
- GET /api/analytics/campaigns/:id — Campaign stats
- GET /api/analytics/accounts — Account performance
- GET /api/analytics/export — Export data

### Webhooks
- POST /api/webhooks — Create webhook
- GET /api/webhooks — List webhooks
- DELETE /api/webhooks/:id — Delete webhook

### CRM
- GET /api/crm/pipelines — List pipelines
- POST /api/crm/pipelines — Create pipeline
- GET /api/crm/deals — List deals
- POST /api/crm/deals — Create deal
- PATCH /api/crm/deals/:id — Update deal (stage, value)
- GET /api/crm/deals/:id — Deal detail

### Workspace & Team
- GET /api/workspace — Current workspace
- PATCH /api/workspace — Update workspace
- GET /api/workspace/members — List members
- POST /api/workspace/members — Invite member
- PATCH /api/workspace/members/:id — Update role

### Templates
- GET /api/templates — List templates
- POST /api/templates — Create template
- PATCH /api/templates/:id — Update template
- DELETE /api/templates/:id — Delete template
