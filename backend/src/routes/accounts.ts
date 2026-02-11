// @ts-nocheck
import { Router, Response } from 'express';
import { z } from 'zod';
import nodemailer from 'nodemailer';
import { ImapFlow } from 'imapflow';
import prisma from '../config/prisma';
import { authenticate, requireWorkspace, AuthRequest } from '../middleware/auth';
import { encrypt, decrypt } from '../utils/crypto';
import { checkDns, getDomainFromEmail } from '../utils/dns';
import { AppError } from '../middleware/errorHandler';

const router = Router();
router.use(authenticate, requireWorkspace);

const connectAccountSchema = z.object({
  email: z.string().email(),
  displayName: z.string().optional(),
  provider: z.enum(['SMTP', 'GMAIL', 'OUTLOOK', 'SENDGRID', 'MAILGUN']).default('SMTP'),
  smtpHost: z.string().min(1),
  smtpPort: z.number().default(587),
  smtpUser: z.string().min(1),
  smtpPass: z.string().min(1),
  smtpSecure: z.boolean().default(false),
  imapHost: z.string().optional(),
  imapPort: z.number().default(993),
  imapUser: z.string().optional(),
  imapPass: z.string().optional(),
  imapSecure: z.boolean().default(true),
  dailySendLimit: z.number().min(1).max(500).default(30),
});

// List all accounts
router.get('/', async (req: AuthRequest, res: Response) => {
  const accounts = await prisma.emailAccount.findMany({
    where: { workspaceId: req.workspaceId },
    select: {
      id: true,
      email: true,
      displayName: true,
      provider: true,
      smtpHost: true,
      smtpPort: true,
      smtpUser: true,
      smtpSecure: true,
      imapHost: true,
      imapPort: true,
      imapUser: true,
      imapSecure: true,
      spfValid: true,
      dkimValid: true,
      dmarcValid: true,
      warmupEnabled: true,
      deliverabilityScore: true,
      healthScore: true,
      dailySendLimit: true,
      sentToday: true,
      isActive: true,
      isPaused: true,
      pauseReason: true,
      lastSentAt: true,
      trackingDomain: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  return res.json({ accounts, total: accounts.length });
});

// Connect new account — validates SMTP and optionally IMAP
router.post('/', async (req: AuthRequest, res: Response) => {
  const data = connectAccountSchema.parse(req.body);
  const errors: string[] = [];

  // Test SMTP connection
  console.log(`[Accounts] Testing SMTP: ${data.smtpHost}:${data.smtpPort} (user: ${data.smtpUser}, secure: ${data.smtpSecure})`);
  try {
    const transporter = nodemailer.createTransport({
      host: data.smtpHost,
      port: data.smtpPort,
      secure: data.smtpSecure,
      auth: {
        user: data.smtpUser,
        pass: data.smtpPass,
      },
      connectionTimeout: 15000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
      tls: {
        rejectUnauthorized: false,
      },
    });
    await transporter.verify();
    console.log(`[Accounts] SMTP verified for ${data.email}`);
  } catch (error: any) {
    console.error(`[Accounts] SMTP verification failed:`, error.message);
    throw new AppError(`SMTP connection failed: ${error.message}`, 400);
  }

  // Test IMAP connection (if provided)
  let imapOk = false;
  if (data.imapHost && data.imapUser && data.imapPass) {
    console.log(`[Accounts] Testing IMAP: ${data.imapHost}:${data.imapPort} (user: ${data.imapUser})`);
    try {
      const imapClient = new ImapFlow({
        host: data.imapHost,
        port: data.imapPort,
        secure: data.imapSecure,
        auth: {
          user: data.imapUser,
          pass: data.imapPass,
        },
        logger: false,
        tls: {
          rejectUnauthorized: false,
        },
      });
      await imapClient.connect();
      await imapClient.logout();
      imapOk = true;
      console.log(`[Accounts] IMAP verified for ${data.email}`);
    } catch (error: any) {
      console.error(`[Accounts] IMAP verification failed:`, error.message);
      errors.push(`IMAP warning: ${error.message}`);
      // Don't throw — IMAP is optional, SMTP is sufficient to send
    }
  }

  // Check DNS
  const domain = getDomainFromEmail(data.email);
  let dnsResult = { spfValid: false, dkimValid: false, dmarcValid: false };
  try {
    dnsResult = await checkDns(domain);
  } catch (e) {
    console.warn(`[Accounts] DNS check failed for ${domain}`);
  }

  // Save account
  const account = await prisma.emailAccount.create({
    data: {
      workspaceId: req.workspaceId!,
      email: data.email,
      displayName: data.displayName || data.email.split('@')[0],
      provider: data.provider,
      smtpHost: data.smtpHost,
      smtpPort: data.smtpPort,
      smtpUser: data.smtpUser,
      smtpPass: encrypt(data.smtpPass),
      smtpSecure: data.smtpSecure,
      imapHost: data.imapHost || null,
      imapPort: data.imapPort,
      imapUser: data.imapUser || null,
      imapPass: data.imapPass ? encrypt(data.imapPass) : null,
      imapSecure: data.imapSecure,
      dailySendLimit: data.dailySendLimit,
      spfValid: dnsResult.spfValid,
      dkimValid: dnsResult.dkimValid,
      dmarcValid: dnsResult.dmarcValid,
    },
  });

  return res.status(201).json({
    account: {
      id: account.id,
      email: account.email,
      provider: account.provider,
      smtpVerified: true,
      imapVerified: imapOk,
      dns: dnsResult,
    },
    warnings: errors.length > 0 ? errors : undefined,
  });
});

// Test SMTP — send a test email
router.post('/:id/test-send', async (req: AuthRequest, res: Response) => {
  const account = await prisma.emailAccount.findFirst({
    where: { id: req.params.id, workspaceId: req.workspaceId },
  });
  if (!account) throw new AppError('Account not found', 404);
  if (!account.smtpHost || !account.smtpPass) throw new AppError('SMTP not configured', 400);

  const { to, subject, body } = req.body;
  if (!to) throw new AppError('Recipient email (to) is required', 400);

  try {
    const transporter = nodemailer.createTransport({
      host: account.smtpHost,
      port: account.smtpPort || 587,
      secure: account.smtpSecure,
      auth: {
        user: account.smtpUser || account.email,
        pass: decrypt(account.smtpPass),
      },
      tls: { rejectUnauthorized: false },
    });

    const info = await transporter.sendMail({
      from: `${account.displayName || account.email} <${account.email}>`,
      to,
      subject: subject || 'Test Email from StreamLine',
      text: body || 'This is a test email sent from your StreamLine cold email platform. If you received this, your SMTP settings are working correctly!',
      html: body
        ? body.replace(/\n/g, '<br>')
        : '<p>This is a test email sent from your <b>StreamLine</b> cold email platform.</p><p>If you received this, your SMTP settings are working correctly!</p>',
    });

    // Update sentToday
    await prisma.emailAccount.update({
      where: { id: account.id },
      data: { sentToday: { increment: 1 }, lastSentAt: new Date() },
    });

    return res.json({
      success: true,
      messageId: info.messageId,
      accepted: info.accepted,
      message: `Test email sent to ${to}`,
    });
  } catch (error: any) {
    throw new AppError(`Failed to send test email: ${error.message}`, 500);
  }
});

// Test IMAP — check inbox connection
router.post('/:id/test-imap', async (req: AuthRequest, res: Response) => {
  const account = await prisma.emailAccount.findFirst({
    where: { id: req.params.id, workspaceId: req.workspaceId },
  });
  if (!account) throw new AppError('Account not found', 404);
  if (!account.imapHost || !account.imapPass) throw new AppError('IMAP not configured', 400);

  try {
    const client = new ImapFlow({
      host: account.imapHost,
      port: account.imapPort || 993,
      secure: account.imapSecure !== false,
      auth: {
        user: account.imapUser || account.email,
        pass: decrypt(account.imapPass),
      },
      logger: false,
      tls: { rejectUnauthorized: false },
    });

    await client.connect();

    // Get mailbox status
    const status = await client.status('INBOX', { messages: true, unseen: true });

    await client.logout();

    return res.json({
      success: true,
      inbox: {
        totalMessages: status.messages,
        unseenMessages: status.unseen,
      },
      message: `IMAP connection successful. Inbox has ${status.messages} messages (${status.unseen} unread).`,
    });
  } catch (error: any) {
    throw new AppError(`IMAP connection failed: ${error.message}`, 500);
  }
});

// Get account details
router.get('/:id', async (req: AuthRequest, res: Response) => {
  const account = await prisma.emailAccount.findFirst({
    where: { id: req.params.id, workspaceId: req.workspaceId },
    include: {
      _count: {
        select: {
          sentEmails: true,
          warmupEmails: true,
          campaignAccounts: true,
        },
      },
    },
  });

  if (!account) throw new AppError('Account not found', 404);

  return res.json({
    ...account,
    smtpPass: undefined,
    imapPass: undefined,
    accessToken: undefined,
    refreshToken: undefined,
  });
});

// Update account
router.patch('/:id', async (req: AuthRequest, res: Response) => {
  const account = await prisma.emailAccount.findFirst({
    where: { id: req.params.id, workspaceId: req.workspaceId },
  });
  if (!account) throw new AppError('Account not found', 404);

  const updates: any = {};
  const allowed = ['displayName', 'dailySendLimit', 'trackingDomain', 'isActive',
    'smtpHost', 'smtpPort', 'smtpUser', 'smtpSecure',
    'imapHost', 'imapPort', 'imapUser', 'imapSecure'];
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }

  if (req.body.smtpPass) updates.smtpPass = encrypt(req.body.smtpPass);
  if (req.body.imapPass) updates.imapPass = encrypt(req.body.imapPass);

  const updated = await prisma.emailAccount.update({
    where: { id: req.params.id },
    data: updates,
  });

  return res.json({ account: { ...updated, smtpPass: undefined, imapPass: undefined } });
});

// Delete account
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  const account = await prisma.emailAccount.findFirst({
    where: { id: req.params.id, workspaceId: req.workspaceId },
  });
  if (!account) throw new AppError('Account not found', 404);

  await prisma.emailAccount.delete({ where: { id: req.params.id } });
  return res.json({ message: 'Account deleted' });
});

// Toggle warmup
router.post('/:id/warmup', async (req: AuthRequest, res: Response) => {
  const account = await prisma.emailAccount.findFirst({
    where: { id: req.params.id, workspaceId: req.workspaceId },
  });
  if (!account) throw new AppError('Account not found', 404);

  const updated = await prisma.emailAccount.update({
    where: { id: req.params.id },
    data: {
      warmupEnabled: !account.warmupEnabled,
      warmupStartedAt: !account.warmupEnabled ? new Date() : account.warmupStartedAt,
      warmupDailyLimit: req.body.dailyLimit || account.warmupDailyLimit,
      warmupReplyRate: req.body.replyRate || account.warmupReplyRate,
      warmupWeekdaysOnly: req.body.weekdaysOnly ?? account.warmupWeekdaysOnly,
    },
  });

  return res.json({
    warmupEnabled: updated.warmupEnabled,
    warmupDailyLimit: updated.warmupDailyLimit,
    warmupReplyRate: updated.warmupReplyRate,
  });
});

// Check DNS health
router.get('/:id/health', async (req: AuthRequest, res: Response) => {
  const account = await prisma.emailAccount.findFirst({
    where: { id: req.params.id, workspaceId: req.workspaceId },
  });
  if (!account) throw new AppError('Account not found', 404);

  const domain = getDomainFromEmail(account.email);
  const dnsResult = await checkDns(domain);

  await prisma.emailAccount.update({
    where: { id: account.id },
    data: {
      spfValid: dnsResult.spfValid,
      dkimValid: dnsResult.dkimValid,
      dmarcValid: dnsResult.dmarcValid,
    },
  });

  return res.json({
    email: account.email,
    domain,
    dns: dnsResult,
    healthScore: account.healthScore,
    deliverabilityScore: account.deliverabilityScore,
    warmupEnabled: account.warmupEnabled,
  });
});

// Bulk import accounts (CSV)
router.post('/bulk-import', async (req: AuthRequest, res: Response) => {
  const { accounts } = req.body;
  if (!Array.isArray(accounts)) {
    throw new AppError('Accounts must be an array', 400);
  }

  const results = [];
  for (const acc of accounts) {
    try {
      const account = await prisma.emailAccount.create({
        data: {
          workspaceId: req.workspaceId!,
          email: acc.email,
          displayName: acc.displayName || acc.email.split('@')[0],
          provider: acc.provider || 'SMTP',
          smtpHost: acc.smtpHost,
          smtpPort: acc.smtpPort || 587,
          smtpUser: acc.smtpUser || acc.email,
          smtpPass: acc.smtpPass ? encrypt(acc.smtpPass) : null,
          imapHost: acc.imapHost,
          imapPort: acc.imapPort || 993,
          imapUser: acc.imapUser || acc.email,
          imapPass: acc.imapPass ? encrypt(acc.imapPass) : null,
        },
      });
      results.push({ email: acc.email, status: 'created', id: account.id });
    } catch (error: any) {
      results.push({ email: acc.email, status: 'error', error: error.message });
    }
  }

  return res.json({ results, total: results.length, success: results.filter(r => r.status === 'created').length });
});

export default router;
