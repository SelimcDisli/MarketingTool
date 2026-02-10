// @ts-nocheck
import { Router, Response } from 'express';
import { z } from 'zod';
import nodemailer from 'nodemailer';
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
  smtpHost: z.string().optional(),
  smtpPort: z.number().optional(),
  smtpUser: z.string().optional(),
  smtpPass: z.string().optional(),
  smtpSecure: z.boolean().optional(),
  imapHost: z.string().optional(),
  imapPort: z.number().optional(),
  imapUser: z.string().optional(),
  imapPass: z.string().optional(),
  imapSecure: z.boolean().optional(),
  dailySendLimit: z.number().min(1).max(100).optional(),
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

// Connect new account
router.post('/', async (req: AuthRequest, res: Response) => {
  const data = connectAccountSchema.parse(req.body);

  // Test SMTP connection
  if (data.smtpHost && data.smtpUser && data.smtpPass) {
    try {
      const transporter = nodemailer.createTransport({
        host: data.smtpHost,
        port: data.smtpPort || 587,
        secure: data.smtpSecure ?? false,
        auth: {
          user: data.smtpUser,
          pass: data.smtpPass,
        },
        connectionTimeout: 10000,
      });
      await transporter.verify();
    } catch (error: any) {
      throw new AppError(`SMTP connection failed: ${error.message}`, 400);
    }
  }

  // Check DNS
  const domain = getDomainFromEmail(data.email);
  const dnsResult = await checkDns(domain);

  const account = await prisma.emailAccount.create({
    data: {
      workspaceId: req.workspaceId!,
      email: data.email,
      displayName: data.displayName,
      provider: data.provider,
      smtpHost: data.smtpHost,
      smtpPort: data.smtpPort,
      smtpUser: data.smtpUser,
      smtpPass: data.smtpPass ? encrypt(data.smtpPass) : null,
      smtpSecure: data.smtpSecure,
      imapHost: data.imapHost,
      imapPort: data.imapPort,
      imapUser: data.imapUser,
      imapPass: data.imapPass ? encrypt(data.imapPass) : null,
      imapSecure: data.imapSecure,
      dailySendLimit: data.dailySendLimit || 30,
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
      dns: dnsResult,
    },
  });
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
  const allowed = ['displayName', 'dailySendLimit', 'trackingDomain', 'isActive'];
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

  // Update DNS status in DB
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
