-- Instantly Clone - Full Schema Migration
-- Run against Supabase PostgreSQL

-- ==================== USERS & WORKSPACES ====================

CREATE TABLE IF NOT EXISTS "User" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "email" TEXT NOT NULL,
  "passwordHash" TEXT,
  "firstName" TEXT,
  "lastName" TEXT,
  "avatarUrl" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email");

CREATE TABLE IF NOT EXISTS "Workspace" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "logoUrl" TEXT,
  "primaryColor" TEXT DEFAULT '#6366f1',
  "whiteLabel" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Workspace_slug_key" ON "Workspace"("slug");

CREATE TABLE IF NOT EXISTS "WorkspaceMember" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "userId" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "role" "WorkspaceRole" NOT NULL DEFAULT 'EDITOR',
  "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "joinedAt" TIMESTAMP(3),
  CONSTRAINT "WorkspaceMember_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WorkspaceMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE,
  CONSTRAINT "WorkspaceMember_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "WorkspaceMember_userId_workspaceId_key" ON "WorkspaceMember"("userId", "workspaceId");

CREATE TABLE IF NOT EXISTS "ApiKey" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "keyHash" TEXT NOT NULL,
  "keyPrefix" TEXT NOT NULL,
  "lastUsedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ApiKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "ApiKey_keyHash_key" ON "ApiKey"("keyHash");

-- ==================== EMAIL ACCOUNTS ====================

CREATE TABLE IF NOT EXISTS "EmailAccount" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "workspaceId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "displayName" TEXT,
  "provider" "EmailProvider" NOT NULL DEFAULT 'SMTP',
  "smtpHost" TEXT,
  "smtpPort" INTEGER DEFAULT 587,
  "smtpUser" TEXT,
  "smtpPass" TEXT,
  "smtpSecure" BOOLEAN NOT NULL DEFAULT true,
  "imapHost" TEXT,
  "imapPort" INTEGER DEFAULT 993,
  "imapUser" TEXT,
  "imapPass" TEXT,
  "imapSecure" BOOLEAN NOT NULL DEFAULT true,
  "oauthProvider" "OAuthProvider",
  "accessToken" TEXT,
  "refreshToken" TEXT,
  "tokenExpiresAt" TIMESTAMP(3),
  "spfValid" BOOLEAN NOT NULL DEFAULT false,
  "dkimValid" BOOLEAN NOT NULL DEFAULT false,
  "dmarcValid" BOOLEAN NOT NULL DEFAULT false,
  "warmupEnabled" BOOLEAN NOT NULL DEFAULT false,
  "warmupDailyLimit" INTEGER NOT NULL DEFAULT 40,
  "warmupReplyRate" INTEGER NOT NULL DEFAULT 30,
  "warmupStartedAt" TIMESTAMP(3),
  "warmupWeekdaysOnly" BOOLEAN NOT NULL DEFAULT false,
  "deliverabilityScore" DOUBLE PRECISION DEFAULT 0,
  "trackingDomain" TEXT,
  "healthScore" DOUBLE PRECISION NOT NULL DEFAULT 100,
  "dailySendLimit" INTEGER NOT NULL DEFAULT 30,
  "sentToday" INTEGER NOT NULL DEFAULT 0,
  "lastSentAt" TIMESTAMP(3),
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "isPaused" BOOLEAN NOT NULL DEFAULT false,
  "pauseReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmailAccount_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EmailAccount_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "EmailAccount_workspaceId_email_key" ON "EmailAccount"("workspaceId", "email");

-- ==================== CAMPAIGNS ====================

CREATE TABLE IF NOT EXISTS "Campaign" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "workspaceId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
  "timezone" TEXT NOT NULL DEFAULT 'UTC',
  "sendingDays" INTEGER[] DEFAULT '{1,2,3,4,5}',
  "sendStartTime" TEXT NOT NULL DEFAULT '09:00',
  "sendEndTime" TEXT NOT NULL DEFAULT '17:00',
  "dailyLimit" INTEGER,
  "slowRampEnabled" BOOLEAN NOT NULL DEFAULT false,
  "slowRampDays" INTEGER NOT NULL DEFAULT 14,
  "slowRampStart" INTEGER NOT NULL DEFAULT 5,
  "stopOnReply" BOOLEAN NOT NULL DEFAULT true,
  "stopOnAutoReply" BOOLEAN NOT NULL DEFAULT false,
  "trackOpens" BOOLEAN NOT NULL DEFAULT true,
  "trackClicks" BOOLEAN NOT NULL DEFAULT true,
  "aiOptimize" BOOLEAN NOT NULL DEFAULT false,
  "totalSent" INTEGER NOT NULL DEFAULT 0,
  "totalOpens" INTEGER NOT NULL DEFAULT 0,
  "totalClicks" INTEGER NOT NULL DEFAULT 0,
  "totalReplies" INTEGER NOT NULL DEFAULT 0,
  "totalBounces" INTEGER NOT NULL DEFAULT 0,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Campaign_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "Campaign_workspaceId_status_idx" ON "Campaign"("workspaceId", "status");

CREATE TABLE IF NOT EXISTS "CampaignStep" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "campaignId" TEXT NOT NULL,
  "order" INTEGER NOT NULL,
  "type" "StepType" NOT NULL DEFAULT 'EMAIL',
  "subject" TEXT,
  "body" TEXT,
  "delayDays" INTEGER NOT NULL DEFAULT 1,
  "delayHours" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CampaignStep_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CampaignStep_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "CampaignStep_campaignId_order_key" ON "CampaignStep"("campaignId", "order");

CREATE TABLE IF NOT EXISTS "StepVariant" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "stepId" TEXT NOT NULL,
  "variantLabel" TEXT NOT NULL DEFAULT 'A',
  "subject" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "weight" INTEGER NOT NULL DEFAULT 1,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "totalSent" INTEGER NOT NULL DEFAULT 0,
  "totalOpens" INTEGER NOT NULL DEFAULT 0,
  "totalClicks" INTEGER NOT NULL DEFAULT 0,
  "totalReplies" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StepVariant_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StepVariant_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "CampaignStep"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "StepVariant_stepId_variantLabel_key" ON "StepVariant"("stepId", "variantLabel");

CREATE TABLE IF NOT EXISTS "CampaignAccount" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "campaignId" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  CONSTRAINT "CampaignAccount_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CampaignAccount_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE,
  CONSTRAINT "CampaignAccount_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "CampaignAccount_campaignId_accountId_key" ON "CampaignAccount"("campaignId", "accountId");

-- ==================== LEADS ====================

CREATE TABLE IF NOT EXISTS "LeadList" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "workspaceId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "totalLeads" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LeadList_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LeadList_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "Lead" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "workspaceId" TEXT NOT NULL,
  "listId" TEXT,
  "email" TEXT NOT NULL,
  "firstName" TEXT,
  "lastName" TEXT,
  "company" TEXT,
  "jobTitle" TEXT,
  "phone" TEXT,
  "website" TEXT,
  "location" TEXT,
  "linkedinUrl" TEXT,
  "customVars" JSONB DEFAULT '{}',
  "status" "LeadStatus" NOT NULL DEFAULT 'ACTIVE',
  "isVerified" BOOLEAN NOT NULL DEFAULT false,
  "verifiedAt" TIMESTAMP(3),
  "interestLevel" "InterestLevel",
  "lastContactedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Lead_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Lead_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE,
  CONSTRAINT "Lead_listId_fkey" FOREIGN KEY ("listId") REFERENCES "LeadList"("id") ON DELETE SET NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "Lead_workspaceId_email_key" ON "Lead"("workspaceId", "email");
CREATE INDEX IF NOT EXISTS "Lead_workspaceId_status_idx" ON "Lead"("workspaceId", "status");
CREATE INDEX IF NOT EXISTS "Lead_listId_idx" ON "Lead"("listId");

CREATE TABLE IF NOT EXISTS "CampaignLead" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "campaignId" TEXT NOT NULL,
  "leadId" TEXT NOT NULL,
  "currentStep" INTEGER NOT NULL DEFAULT 0,
  "status" "CampaignLeadStatus" NOT NULL DEFAULT 'PENDING',
  "nextSendAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CampaignLead_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CampaignLead_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE,
  CONSTRAINT "CampaignLead_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "CampaignLead_campaignId_leadId_key" ON "CampaignLead"("campaignId", "leadId");
CREATE INDEX IF NOT EXISTS "CampaignLead_status_nextSendAt_idx" ON "CampaignLead"("status", "nextSendAt");

CREATE TABLE IF NOT EXISTS "BlocklistEntry" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "workspaceId" TEXT NOT NULL,
  "type" "BlockType" NOT NULL DEFAULT 'EMAIL',
  "value" TEXT NOT NULL,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BlocklistEntry_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BlocklistEntry_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "BlocklistEntry_workspaceId_type_value_key" ON "BlocklistEntry"("workspaceId", "type", "value");
CREATE INDEX IF NOT EXISTS "BlocklistEntry_workspaceId_value_idx" ON "BlocklistEntry"("workspaceId", "value");

-- ==================== SENT EMAILS ====================

CREATE TABLE IF NOT EXISTS "SentEmail" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "campaignId" TEXT NOT NULL,
  "stepId" TEXT NOT NULL,
  "variantId" TEXT,
  "leadId" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "fromEmail" TEXT NOT NULL,
  "toEmail" TEXT NOT NULL,
  "messageId" TEXT,
  "inReplyTo" TEXT,
  "trackingId" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "openedAt" TIMESTAMP(3),
  "openCount" INTEGER NOT NULL DEFAULT 0,
  "clickedAt" TIMESTAMP(3),
  "clickCount" INTEGER NOT NULL DEFAULT 0,
  "repliedAt" TIMESTAMP(3),
  "bouncedAt" TIMESTAMP(3),
  "bounceType" TEXT,
  "status" "EmailStatus" NOT NULL DEFAULT 'QUEUED',
  "error" TEXT,
  "sentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SentEmail_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SentEmail_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE,
  CONSTRAINT "SentEmail_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "CampaignStep"("id") ON DELETE CASCADE,
  CONSTRAINT "SentEmail_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "StepVariant"("id") ON DELETE SET NULL,
  CONSTRAINT "SentEmail_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE,
  CONSTRAINT "SentEmail_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "SentEmail_messageId_key" ON "SentEmail"("messageId");
CREATE UNIQUE INDEX IF NOT EXISTS "SentEmail_trackingId_key" ON "SentEmail"("trackingId");
CREATE INDEX IF NOT EXISTS "SentEmail_campaignId_sentAt_idx" ON "SentEmail"("campaignId", "sentAt");
CREATE INDEX IF NOT EXISTS "SentEmail_trackingId_idx" ON "SentEmail"("trackingId");
CREATE INDEX IF NOT EXISTS "SentEmail_leadId_idx" ON "SentEmail"("leadId");
CREATE INDEX IF NOT EXISTS "SentEmail_accountId_sentAt_idx" ON "SentEmail"("accountId", "sentAt");

-- ==================== WARMUP ====================

CREATE TABLE IF NOT EXISTS "WarmupEmail" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "accountId" TEXT NOT NULL,
  "partnerEmail" TEXT NOT NULL,
  "direction" "WarmupDirection" NOT NULL,
  "subject" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "messageId" TEXT,
  "opened" BOOLEAN NOT NULL DEFAULT false,
  "replied" BOOLEAN NOT NULL DEFAULT false,
  "movedFromSpam" BOOLEAN NOT NULL DEFAULT false,
  "markedImportant" BOOLEAN NOT NULL DEFAULT false,
  "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WarmupEmail_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WarmupEmail_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "WarmupEmail_accountId_sentAt_idx" ON "WarmupEmail"("accountId", "sentAt");

-- ==================== UNIBOX ====================

CREATE TABLE IF NOT EXISTS "UniboxThread" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "workspaceId" TEXT,
  "campaignId" TEXT,
  "leadId" TEXT,
  "accountId" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "messageCount" INTEGER NOT NULL DEFAULT 0,
  "sentiment" "ThreadSentiment",
  "tag" "ThreadTag" NOT NULL DEFAULT 'NEW',
  "aiConfidence" DOUBLE PRECISION,
  "isRead" BOOLEAN NOT NULL DEFAULT false,
  "isArchived" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UniboxThread_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "UniboxThread_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL,
  CONSTRAINT "UniboxThread_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL,
  CONSTRAINT "UniboxThread_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "UniboxThread_accountId_tag_idx" ON "UniboxThread"("accountId", "tag");
CREATE INDEX IF NOT EXISTS "UniboxThread_lastMessageAt_idx" ON "UniboxThread"("lastMessageAt");

CREATE TABLE IF NOT EXISTS "UniboxMessage" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "threadId" TEXT NOT NULL,
  "messageId" TEXT,
  "direction" "MessageDirection" NOT NULL,
  "fromEmail" TEXT NOT NULL,
  "toEmail" TEXT NOT NULL,
  "subject" TEXT,
  "body" TEXT NOT NULL,
  "bodyHtml" TEXT,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UniboxMessage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "UniboxMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "UniboxThread"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "UniboxMessage_threadId_receivedAt_idx" ON "UniboxMessage"("threadId", "receivedAt");

CREATE TABLE IF NOT EXISTS "ThreadNote" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "threadId" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ThreadNote_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ThreadNote_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "UniboxThread"("id") ON DELETE CASCADE
);

-- ==================== CRM ====================

CREATE TABLE IF NOT EXISTS "CrmPipeline" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "workspaceId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CrmPipeline_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CrmPipeline_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "CrmStage" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "pipelineId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "order" INTEGER NOT NULL,
  "color" TEXT NOT NULL DEFAULT '#6366f1',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CrmStage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CrmStage_pipelineId_fkey" FOREIGN KEY ("pipelineId") REFERENCES "CrmPipeline"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "CrmStage_pipelineId_order_key" ON "CrmStage"("pipelineId", "order");

CREATE TABLE IF NOT EXISTS "CrmDeal" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "pipelineId" TEXT NOT NULL,
  "stageId" TEXT NOT NULL,
  "leadId" TEXT,
  "title" TEXT NOT NULL,
  "value" DOUBLE PRECISION DEFAULT 0,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "expectedCloseDate" TIMESTAMP(3),
  "closedAt" TIMESTAMP(3),
  "lostReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CrmDeal_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CrmDeal_pipelineId_fkey" FOREIGN KEY ("pipelineId") REFERENCES "CrmPipeline"("id") ON DELETE CASCADE,
  CONSTRAINT "CrmDeal_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "CrmStage"("id") ON DELETE CASCADE,
  CONSTRAINT "CrmDeal_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS "CrmDeal_pipelineId_stageId_idx" ON "CrmDeal"("pipelineId", "stageId");

-- ==================== TEMPLATES ====================

CREATE TABLE IF NOT EXISTS "EmailTemplate" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "workspaceId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "category" TEXT,
  "subject" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "isGlobal" BOOLEAN NOT NULL DEFAULT false,
  "usageCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmailTemplate_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EmailTemplate_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE
);

-- ==================== WEBHOOKS ====================

CREATE TABLE IF NOT EXISTS "Webhook" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "workspaceId" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "events" TEXT[] NOT NULL,
  "secret" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "lastTriggeredAt" TIMESTAMP(3),
  "failCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Webhook_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Webhook_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE
);

-- ==================== ANALYTICS ====================

CREATE TABLE IF NOT EXISTS "AnalyticsSnapshot" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "workspaceId" TEXT NOT NULL,
  "campaignId" TEXT,
  "date" DATE NOT NULL,
  "emailsSent" INTEGER NOT NULL DEFAULT 0,
  "emailsOpened" INTEGER NOT NULL DEFAULT 0,
  "emailsClicked" INTEGER NOT NULL DEFAULT 0,
  "emailsReplied" INTEGER NOT NULL DEFAULT 0,
  "emailsBounced" INTEGER NOT NULL DEFAULT 0,
  "openRate" DOUBLE PRECISION,
  "clickRate" DOUBLE PRECISION,
  "replyRate" DOUBLE PRECISION,
  "bounceRate" DOUBLE PRECISION,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AnalyticsSnapshot_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AnalyticsSnapshot_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "AnalyticsSnapshot_workspaceId_campaignId_date_key" ON "AnalyticsSnapshot"("workspaceId", "campaignId", "date");
CREATE INDEX IF NOT EXISTS "AnalyticsSnapshot_workspaceId_date_idx" ON "AnalyticsSnapshot"("workspaceId", "date");
