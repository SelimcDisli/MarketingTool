export interface User {
  id: string
  email: string
  firstName: string
  lastName: string
  avatarUrl?: string
  createdAt: string
}

export interface Workspace {
  id: string
  name: string
  role: 'OWNER' | 'ADMIN' | 'EDITOR' | 'VIEWER'
}

export interface Campaign {
  id: string
  name: string
  status: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'ERROR'
  workspaceId: string
  scheduleTimezone: string
  scheduleDays: number[]
  scheduleStartTime: string
  scheduleEndTime: string
  dailyLimit: number
  stopOnReply: boolean
  stopOnAutoReply: boolean
  trackOpens: boolean
  trackClicks: boolean
  slowRampEnabled: boolean
  slowRampIncrement: number
  createdAt: string
  updatedAt: string
  _count?: {
    steps: number
    campaignLeads: number
    sentEmails: number
  }
  steps?: CampaignStep[]
}

export interface CampaignStep {
  id: string
  campaignId: string
  stepOrder: number
  delayDays: number
  delayHours: number
  subject: string
  body: string
  variants?: StepVariant[]
}

export interface StepVariant {
  id: string
  stepId: string
  variantLabel: string
  subject: string
  body: string
  weight: number
}

export interface EmailAccount {
  id: string
  email: string
  displayName: string
  provider: string
  smtpHost: string
  smtpPort: number
  imapHost: string
  imapPort: number
  warmupEnabled: boolean
  warmupLimit: number
  dailyLimit: number
  sentToday: number
  healthScore: number
  spfValid: boolean
  dkimValid: boolean
  dmarcValid: boolean
  isActive: boolean
  createdAt: string
}

export interface Lead {
  id: string
  email: string
  firstName?: string
  lastName?: string
  company?: string
  jobTitle?: string
  phone?: string
  website?: string
  linkedinUrl?: string
  city?: string
  state?: string
  country?: string
  status: 'ACTIVE' | 'BOUNCED' | 'UNSUBSCRIBED' | 'REPLIED' | 'COMPLETED'
  verified: boolean
  verificationStatus?: string
  customVars?: Record<string, string>
  listId: string
  list?: LeadList
  createdAt: string
}

export interface LeadList {
  id: string
  name: string
  workspaceId: string
  _count?: { leads: number }
  createdAt: string
}

export interface Thread {
  id: string
  subject: string
  tag?: string
  isRead: boolean
  lastMessageAt: string
  lead?: Lead
  account?: EmailAccount
  messages?: ThreadMessage[]
  _count?: { messages: number }
}

export interface ThreadMessage {
  id: string
  threadId: string
  direction: 'INBOUND' | 'OUTBOUND'
  fromEmail: string
  toEmail: string
  subject: string
  body: string
  sentAt: string
}

export interface CrmPipeline {
  id: string
  name: string
  workspaceId: string
  stages?: CrmStage[]
}

export interface CrmStage {
  id: string
  name: string
  stageOrder: number
  color: string
  pipelineId: string
  deals?: CrmDeal[]
  _count?: { deals: number }
}

export interface CrmDeal {
  id: string
  title: string
  value: number
  currency: string
  stageId: string
  leadId?: string
  lead?: Lead
  stage?: CrmStage
  createdAt: string
}

export interface EmailTemplate {
  id: string
  name: string
  category: string
  subject: string
  body: string
  isShared: boolean
  createdAt: string
}

export interface AnalyticsOverview {
  totalSent: number
  totalOpened: number
  totalReplied: number
  totalBounced: number
  totalClicked: number
  openRate: number
  replyRate: number
  bounceRate: number
  clickRate: number
  activeCampaigns: number
  totalLeads: number
  totalAccounts: number
}

export interface DailyStats {
  date: string
  sent: number
  opened: number
  replied: number
  bounced: number
  clicked: number
}

export interface WorkspaceMember {
  id: string
  userId: string
  role: 'OWNER' | 'ADMIN' | 'EDITOR' | 'VIEWER'
  user: User
  joinedAt: string
}
