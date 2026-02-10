# Lovable Frontend Prompt — Instantly Clone

Build a complete cold email outreach platform (Instantly.ai clone) frontend with React + TypeScript + Tailwind CSS + shadcn/ui. The backend API is already built at `http://localhost:3001/api`. Use axios for API calls. Include JWT auth with token stored in localStorage.

## Auth Context
- Store JWT token in localStorage after login
- Send token as `Authorization: Bearer <token>` header
- Send workspace ID as `x-workspace-id` header
- Redirect to /login if 401

## Pages to Build:

### 1. Auth Pages (/login, /register)
- Login form: email + password → POST /api/auth/login
- Register form: email, password, firstName, lastName, workspaceName → POST /api/auth/register
- After login, redirect to /dashboard
- Show workspace selector if user has multiple workspaces

### 2. Dashboard (/dashboard)
- GET /api/analytics/overview?days=30
- Cards: Emails Sent, Open Rate, Reply Rate, Bounce Rate, Active Campaigns, Total Leads
- Line chart (Recharts): daily sent/opened/replied over last 30 days → GET /api/analytics/daily
- Recent activity feed
- Quick action buttons: New Campaign, Import Leads, Connect Account

### 3. Campaigns (/campaigns)
- List view: GET /api/campaigns
- Each row: Name, Status (badge), Steps count, Leads count, Sent, Opens, Replies, Created date
- Filter by status (All, Active, Paused, Draft, Completed)
- "New Campaign" button

### 4. Campaign Builder (/campaigns/:id)
- Tabs: Sequences, Leads, Accounts, Options, Analytics
- **Sequences Tab**: Visual step editor
  - Each step card shows: Step number, Delay, Subject preview
  - Click step to edit: Subject, Body (rich text), Delay (days/hours)
  - "Add Variant" button per step for A/Z testing (variant tabs A, B, C...)
  - Support for merge tags: {{firstName}}, {{company}}, etc. with autocomplete
  - Spintax preview: {{RANDOM | opt1 | opt2}} shows random preview
  - "Add Step" button at bottom
- **Leads Tab**: List of assigned leads + "Add Leads" button (select from lead lists)
- **Accounts Tab**: Select email accounts for inbox rotation
- **Options Tab**: Form with all campaign settings (schedule, limits, slow ramp, stop on reply)
- **Analytics Tab**: Campaign-specific stats → GET /api/campaigns/:id/analytics
- Start/Pause button in header

### 5. Email Accounts (/accounts)
- Grid/list of connected accounts: GET /api/accounts
- Each card shows: Email, Provider badge, DNS status (SPF ✓/✗, DKIM ✓/✗, DMARC ✓/✗), Health score, Warmup toggle, Sent today/limit
- "Connect Account" dialog: SMTP/IMAP fields form → POST /api/accounts
- Click account for detail: GET /api/accounts/:id
- DNS health check button → GET /api/accounts/:id/health
- Warmup toggle → POST /api/accounts/:id/warmup
- "Bulk Import" button for CSV

### 6. Leads (/leads)
- Table with pagination: GET /api/leads?page=1&limit=50
- Columns: Email, Name, Company, Job Title, Status, List, Verified, Last Contacted
- Search bar + filters (status, list, verified)
- "Import CSV" button → opens modal with file upload + column mapping preview
- "New Lead" button → form dialog
- Click lead for detail slideout panel: GET /api/leads/:id
- Lead Lists sidebar: GET /api/leads/lists/all
- Blocklist management: GET /api/leads/blocklist

### 7. Unibox (/unibox)
- Left panel: Thread list with filters → GET /api/unibox/threads
- Filter pills: All, New, Interested, Meeting Booked, Not Interested, Out of Office
- Thread preview: Lead name, subject, snippet, time, tag badge, read/unread state
- Right panel: Thread detail → GET /api/unibox/threads/:id
- Message bubbles (inbound left, outbound right)
- Reply composer at bottom with account selector
- Tag dropdown to classify thread
- Team notes section (collapsible)
- Bulk actions bar when selecting multiple threads
- Unread count badge in sidebar nav
- Stats bar: GET /api/unibox/stats

### 8. Analytics (/analytics)
- Overview cards: GET /api/analytics/overview
- Daily chart: GET /api/analytics/daily (line chart with toggleable series)
- Account performance table: GET /api/analytics/accounts
- Campaign comparison table
- Date range picker
- Export button

### 9. CRM Pipeline (/crm)
- Kanban board: GET /api/crm/deals?pipelineId=X
- Pipeline selector dropdown: GET /api/crm/pipelines
- Columns = stages, cards = deals
- Drag & drop deals between stages → PATCH /api/crm/deals/:id
- Deal card shows: Title, Lead name, Value, Days in stage
- Click deal for detail slideout
- "New Deal" button
- Metrics bar: Total value, Avg deal size, Win rate

### 10. Settings (/settings)
- Tabs: Workspace, Team, API Keys, Billing
- **Workspace**: Name, logo upload, primary color, white label toggle
- **Team**: Member list, invite form, role dropdown → GET/POST /api/workspace/members
- **API Keys**: List + create new → shows secret once
- **Billing**: Plan info (placeholder)

### 11. Templates (/templates)
- Grid of template cards: GET /api/templates
- Search + category filter
- Click to preview template
- "Use in Campaign" button
- "New Template" form: name, category, subject, body

## Navigation (Sidebar):
- Logo/brand at top
- Dashboard (home icon)
- Campaigns (send icon)
- Leads (users icon)
- Email Accounts (mail icon)
- Unibox (inbox icon) — with unread badge
- Analytics (chart icon)
- CRM (kanban icon)
- Templates (file icon)
- Settings (gear icon) at bottom
- User avatar + workspace name at bottom

## Design Guidelines:
- Dark sidebar (#0f172a) with light content area
- Primary color: indigo-600 (#4f46e5)
- Use shadcn/ui components: Card, Button, Badge, Dialog, Table, Select, Input, Tabs, DropdownMenu, Sheet, Command
- Status badges: Active=green, Paused=yellow, Draft=gray, Completed=blue, Error=red
- Responsive: collapsible sidebar on mobile
- Toast notifications for success/error actions
- Loading skeletons for data fetching
- Empty states with illustrations and CTAs

## Key Libraries:
- react-router-dom for routing
- axios for API calls
- recharts for charts
- @dnd-kit for drag & drop (CRM kanban)
- date-fns for date formatting
- lucide-react for icons
- react-hot-toast or sonner for notifications
