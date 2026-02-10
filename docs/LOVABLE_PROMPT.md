# Lovable Frontend Prompt — Cold Email Outreach Platform

Build a complete cold email outreach platform frontend with React + TypeScript + Tailwind CSS + shadcn/ui. The backend API is already built and running at `http://localhost:3001/api`. Use axios for all API calls. Include JWT authentication with token stored in localStorage.

## IMPORTANT: API Connection Setup
Create an `api.ts` utility file:
```typescript
import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

const api = axios.create({ baseURL: API_BASE });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  const workspaceId = localStorage.getItem('workspaceId');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  if (workspaceId) config.headers['x-workspace-id'] = workspaceId;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default api;
```

## Pages to Build:

### 1. Auth Pages (/login, /register)
- Login form: email + password → `POST /api/auth/login`
- Register form: email, password, firstName, lastName, workspaceName → `POST /api/auth/register`
- Response contains `{ token, user, workspaces }` — store token + first workspace ID
- After login, redirect to /dashboard
- Clean minimal design with centered card

### 2. Dashboard (/dashboard)
- `GET /api/analytics/overview?days=30`
- Stat cards row: Emails Sent, Open Rate (%), Reply Rate (%), Bounce Rate (%), Active Campaigns, Total Leads
- Line chart (Recharts): daily sent/opened/replied over last 30 days → `GET /api/analytics/daily?days=30`
- Quick action buttons: "New Campaign", "Import Leads", "Connect Account"
- Recent campaigns table (top 5)

### 3. Campaigns List (/campaigns)
- Table view: `GET /api/campaigns`
- Columns: Name, Status (colored badge), Steps, Leads, Sent, Opens, Replies, Created
- Status filter tabs: All, Active, Paused, Draft, Completed
- "New Campaign" button → opens creation dialog
- Create: `POST /api/campaigns` with body `{ name, workspaceId }`

### 4. Campaign Builder (/campaigns/:id)
- Header: Campaign name (editable), Status badge, Start/Pause buttons
- Start: `POST /api/campaigns/:id/start`
- Pause: `POST /api/campaigns/:id/pause`
- Tabs: **Sequences**, Leads, Accounts, Options, Analytics

**Sequences Tab** (most important):
- Visual step editor — vertical timeline layout
- Each step card: Step number circle, delay display, subject line preview, variant count
- Click step to expand/edit: Subject input, Body textarea (with merge tag buttons), Delay selector (days + hours)
- Merge tag buttons above body: `{{firstName}}`, `{{lastName}}`, `{{company}}`, `{{email}}`
- "Add Variant" button per step for A/Z testing (shows tabs: A, B, C...)
- "Add Step" button at bottom of timeline
- API: `POST /api/campaigns/:id/steps`, `PATCH /api/campaigns/:id/steps/:stepId`
- Variants: `POST /api/campaigns/:id/steps/:stepId/variants`

**Leads Tab**:
- Table of assigned leads with status
- "Add Leads" button → modal to select lead lists
- API: `POST /api/campaigns/:id/leads`, `GET /api/campaigns/:id/leads`

**Accounts Tab**:
- Checkboxes for selecting sender accounts → inbox rotation
- Shows each account's daily limit and warmup status

**Options Tab**:
- Form: Schedule (timezone, days of week, start/end time), Daily limit per account, Stop on reply toggle, Slow ramp toggle
- `PATCH /api/campaigns/:id`

**Analytics Tab**:
- Campaign-specific stats: `GET /api/campaigns/:id/analytics`
- Funnel: Sent → Opened → Replied → Interested

### 5. Email Accounts (/accounts)
- Card grid: `GET /api/accounts`
- Each card: Email address, Provider icon, Health score bar, DNS badges (SPF ✓/✗, DKIM ✓/✗, DMARC ✓/✗), Warmup toggle switch, Daily sent/limit counter
- "Connect Account" dialog: SMTP host, port, user, pass + IMAP host, port, user, pass → `POST /api/accounts`
- Warmup toggle: `POST /api/accounts/:id/warmup`
- Health check button: `GET /api/accounts/:id/health`
- Delete: `DELETE /api/accounts/:id` with confirmation

### 6. Leads (/leads)
- Split layout: Lead lists sidebar + leads table main area
- **Lead Lists Sidebar**: `GET /api/leads/lists/all` — list names with count, click to filter
- **Leads Table**: `GET /api/leads?page=1&limit=50&listId=X`
  - Columns: Email, First Name, Last Name, Company, Status (badge), List, Verified ✓/✗
  - Pagination controls
  - Search input for filtering
- **Import CSV**: Button → modal with file upload zone, shows preview table with column mapping dropdowns, confirm to import → `POST /api/leads/upload` (multipart/form-data)
- **New Lead**: Form dialog → `POST /api/leads`
- **Blocklist Tab**: `GET /api/leads/blocklist` — table of blocked emails/domains + add form

### 7. Unibox (/unibox) — Most Complex Page
- **Two-panel layout** (like email client):
- **Left Panel** — Thread list:
  - Filter pills: All, Interested, Meeting Booked, Not Interested, Out of Office, Unread
  - `GET /api/unibox/threads?filter=X`
  - Each thread row: Lead avatar circle, lead name, subject, message snippet (truncated), time ago, tag badge, unread dot
  - Click to select thread
- **Right Panel** — Thread detail:
  - `GET /api/unibox/threads/:id`
  - Message bubbles: inbound (left, gray bg), outbound (right, indigo bg)
  - Timestamp under each message
  - Reply composer at bottom: textarea + "Send" button + account selector dropdown
  - Send reply: `POST /api/unibox/threads/:id/reply`
  - Tag dropdown: `PATCH /api/unibox/threads/:id/tag` (Interested, Not Interested, Meeting Booked, Out of Office, Closed, Objection)
  - Team notes section (collapsible): `POST /api/unibox/threads/:id/notes`
- **Stats bar** at top: `GET /api/unibox/stats` — Total, Unread, Interested, Meeting Booked

### 8. Analytics (/analytics)
- Date range picker (last 7/30/90 days)
- Overview stat cards: `GET /api/analytics/overview?days=X`
- Daily trends chart (Recharts LineChart): `GET /api/analytics/daily?days=X`
  - Toggleable series: Sent, Opened, Replied, Bounced
- Account performance table: `GET /api/analytics/accounts`
  - Columns: Account email, Sent, Opens, Open Rate, Replies, Reply Rate, Bounces, Health Score

### 9. CRM Pipeline (/crm)
- Pipeline selector: `GET /api/crm/pipelines`
- **Kanban board**: `GET /api/crm/deals?pipelineId=X`
  - Columns = Pipeline stages (from `GET /api/crm/pipelines/:id`)
  - Cards = Deals in each stage
  - Deal card: Title, lead email, value (currency), days in stage
  - Drag & drop between columns: `PATCH /api/crm/deals/:id` with `{ stageId: newStageId }`
  - Use @dnd-kit/core + @dnd-kit/sortable
- "New Deal" button → dialog: title, lead selection, value, pipeline, stage
- Metrics bar: Total pipeline value, Number of deals, Average deal value

### 10. Settings (/settings)
- Tabs: Workspace, Team, API Keys

**Workspace Tab**:
- Workspace name input → `PATCH /api/workspace`

**Team Tab**:
- Members table: `GET /api/workspace/members`
  - Columns: Name, Email, Role (dropdown: Owner/Admin/Editor/Viewer), Actions
  - Role change: `PATCH /api/workspace/members/:id`
  - Remove: `DELETE /api/workspace/members/:id`
- Invite form: email + role → `POST /api/workspace/members`

**API Keys Tab**:
- Table of API keys with created date
- "Create API Key" → shows key once (copy to clipboard)

### 11. Templates (/templates)
- Card grid: `GET /api/templates`
- Each card: Template name, category badge, subject preview, "Use in Campaign" button
- Search input + category filter
- "New Template" button → form: name, category, subject, body (textarea)
- `POST /api/templates`, `PATCH /api/templates/:id`, `DELETE /api/templates/:id`

## Navigation (Dark Sidebar):
```
┌─────────────────────┐
│  Logo / Brand Name  │
│─────────────────────│
│ 📊 Dashboard        │
│ 📧 Campaigns        │
│ 👥 Leads            │
│ 📬 Email Accounts   │
│ 📥 Unibox     [3]   │ ← unread badge
│ 📈 Analytics        │
│ 🗂️ CRM Pipeline     │
│ 📄 Templates        │
│─────────────────────│
│ ⚙️ Settings          │
│ User Avatar + Name  │
│ Workspace Name      │
└─────────────────────┘
```

## Design System:
- **Sidebar**: Dark navy (#0f172a), white text, active item has indigo-600 bg
- **Content area**: White background, slate-50 for section backgrounds
- **Primary color**: Indigo-600 (#4f46e5) — buttons, links, active states
- **Status badges**: Active=green-500, Paused=yellow-500, Draft=slate-400, Completed=blue-500, Error=red-500
- **Typography**: Inter font family, headings slate-900, body text slate-600
- **Cards**: White bg, subtle border (slate-200), rounded-lg, shadow-sm
- **Tables**: Alternating row colors, hover state, sticky header
- **Loading**: Skeleton components while data loads
- **Empty states**: Centered icon + message + CTA button
- **Toasts**: Use sonner for success/error notifications
- **Responsive**: Sidebar collapses to icon-only on tablet, hamburger on mobile

## Key Dependencies:
```
react-router-dom, axios, recharts, @dnd-kit/core, @dnd-kit/sortable,
date-fns, lucide-react, sonner
```

## Data Types Reference:
```typescript
// Campaign statuses: DRAFT, ACTIVE, PAUSED, COMPLETED, ERROR
// Lead statuses: ACTIVE, BOUNCED, UNSUBSCRIBED, REPLIED, COMPLETED
// Thread tags: INTERESTED, NOT_INTERESTED, MEETING_BOOKED, OUT_OF_OFFICE, CLOSED, OBJECTION
// Member roles: OWNER, ADMIN, EDITOR, VIEWER
```
