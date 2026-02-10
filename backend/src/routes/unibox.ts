// @ts-nocheck
import { Router, Response } from 'express';
import prisma from '../config/prisma';
import { authenticate, requireWorkspace, AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import nodemailer from 'nodemailer';
import { decrypt } from '../utils/crypto';

const router = Router();
router.use(authenticate, requireWorkspace);

// List threads
router.get('/threads', async (req: AuthRequest, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = Math.min(parseInt(req.query.limit as string) || 30, 100);
  const skip = (page - 1) * limit;
  const tag = req.query.tag as string;
  const campaignId = req.query.campaignId as string;
  const accountId = req.query.accountId as string;
  const isRead = req.query.isRead as string;

  const where: any = {
    account: { workspaceId: req.workspaceId },
    isArchived: false,
  };

  if (tag) where.tag = tag.toUpperCase();
  if (campaignId) where.campaignId = campaignId;
  if (accountId) where.accountId = accountId;
  if (isRead !== undefined) where.isRead = isRead === 'true';

  const [threads, total] = await Promise.all([
    prisma.uniboxThread.findMany({
      where,
      include: {
        lead: { select: { id: true, email: true, firstName: true, lastName: true, company: true } },
        account: { select: { id: true, email: true, displayName: true } },
        campaign: { select: { id: true, name: true } },
        messages: {
          orderBy: { receivedAt: 'desc' },
          take: 1,
          select: { body: true, direction: true, receivedAt: true },
        },
      },
      orderBy: { lastMessageAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.uniboxThread.count({ where }),
  ]);

  return res.json({
    threads,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

// Get thread detail
router.get('/threads/:id', async (req: AuthRequest, res: Response) => {
  const thread = await prisma.uniboxThread.findFirst({
    where: { id: req.params.id, account: { workspaceId: req.workspaceId } },
    include: {
      lead: true,
      account: { select: { id: true, email: true, displayName: true } },
      campaign: { select: { id: true, name: true } },
      messages: { orderBy: { receivedAt: 'asc' } },
      notes: { orderBy: { createdAt: 'desc' } },
    },
  });

  if (!thread) throw new AppError('Thread not found', 404);

  // Mark as read
  if (!thread.isRead) {
    await prisma.uniboxThread.update({
      where: { id: thread.id },
      data: { isRead: true },
    });
  }

  return res.json({ thread });
});

// Reply to thread
router.post('/threads/:id/reply', async (req: AuthRequest, res: Response) => {
  const thread = await prisma.uniboxThread.findFirst({
    where: { id: req.params.id, account: { workspaceId: req.workspaceId } },
    include: {
      account: true,
      lead: true,
      messages: { orderBy: { receivedAt: 'desc' }, take: 1 },
    },
  });

  if (!thread) throw new AppError('Thread not found', 404);

  const { body, bodyHtml } = req.body;
  if (!body) throw new AppError('Reply body is required', 400);

  // Send email
  const account = thread.account;
  const toEmail = thread.lead?.email || thread.messages[0]?.fromEmail;

  if (!toEmail) throw new AppError('No recipient email found', 400);

  let transporter;
  if (account.smtpHost && account.smtpPass) {
    transporter = nodemailer.createTransport({
      host: account.smtpHost,
      port: account.smtpPort || 587,
      secure: account.smtpSecure,
      auth: {
        user: account.smtpUser || account.email,
        pass: decrypt(account.smtpPass),
      },
    });
  } else {
    throw new AppError('No SMTP credentials configured for this account', 400);
  }

  const lastMessage = thread.messages[0];
  const info = await transporter.sendMail({
    from: `${account.displayName || account.email} <${account.email}>`,
    to: toEmail,
    subject: `Re: ${thread.subject}`,
    text: body,
    html: bodyHtml || body.replace(/\n/g, '<br>'),
    inReplyTo: lastMessage?.messageId || undefined,
  });

  // Save message
  const message = await prisma.uniboxMessage.create({
    data: {
      threadId: thread.id,
      messageId: info.messageId,
      direction: 'OUTBOUND',
      fromEmail: account.email,
      toEmail,
      subject: `Re: ${thread.subject}`,
      body,
      bodyHtml: bodyHtml || body.replace(/\n/g, '<br>'),
    },
  });

  // Update thread
  await prisma.uniboxThread.update({
    where: { id: thread.id },
    data: {
      lastMessageAt: new Date(),
      messageCount: { increment: 1 },
    },
  });

  return res.json({ message });
});

// Tag thread
router.patch('/threads/:id/tag', async (req: AuthRequest, res: Response) => {
  const thread = await prisma.uniboxThread.findFirst({
    where: { id: req.params.id, account: { workspaceId: req.workspaceId } },
  });
  if (!thread) throw new AppError('Thread not found', 404);

  const updated = await prisma.uniboxThread.update({
    where: { id: thread.id },
    data: {
      tag: req.body.tag,
      sentiment: req.body.sentiment,
      isRead: req.body.isRead,
      isArchived: req.body.isArchived,
    },
  });

  // Update lead interest level based on tag
  if (thread.leadId && req.body.tag) {
    const tagToInterest: Record<string, string> = {
      INTERESTED: 'INTERESTED',
      NOT_INTERESTED: 'NOT_INTERESTED',
      MEETING_BOOKED: 'MEETING_BOOKED',
    };
    const interest = tagToInterest[req.body.tag];
    if (interest) {
      await prisma.lead.update({
        where: { id: thread.leadId },
        data: { interestLevel: interest as any },
      });
    }
  }

  return res.json({ thread: updated });
});

// Add team note
router.post('/threads/:id/notes', async (req: AuthRequest, res: Response) => {
  const thread = await prisma.uniboxThread.findFirst({
    where: { id: req.params.id, account: { workspaceId: req.workspaceId } },
  });
  if (!thread) throw new AppError('Thread not found', 404);

  const note = await prisma.threadNote.create({
    data: {
      threadId: thread.id,
      authorId: req.userId!,
      content: req.body.content,
    },
  });

  return res.json({ note });
});

// Bulk operations
router.post('/threads/bulk', async (req: AuthRequest, res: Response) => {
  const { threadIds, action, tag } = req.body;

  if (!Array.isArray(threadIds) || threadIds.length === 0) {
    throw new AppError('threadIds required', 400);
  }

  switch (action) {
    case 'markRead':
      await prisma.uniboxThread.updateMany({
        where: { id: { in: threadIds } },
        data: { isRead: true },
      });
      break;
    case 'markUnread':
      await prisma.uniboxThread.updateMany({
        where: { id: { in: threadIds } },
        data: { isRead: false },
      });
      break;
    case 'archive':
      await prisma.uniboxThread.updateMany({
        where: { id: { in: threadIds } },
        data: { isArchived: true },
      });
      break;
    case 'tag':
      if (!tag) throw new AppError('tag required for tag action', 400);
      await prisma.uniboxThread.updateMany({
        where: { id: { in: threadIds } },
        data: { tag },
      });
      break;
    default:
      throw new AppError('Invalid action', 400);
  }

  return res.json({ message: `${action} applied to ${threadIds.length} threads` });
});

// Get thread stats
router.get('/stats', async (req: AuthRequest, res: Response) => {
  const baseWhere = { account: { workspaceId: req.workspaceId }, isArchived: false };

  const [total, unread, interested, meetingBooked, newThreads] = await Promise.all([
    prisma.uniboxThread.count({ where: baseWhere }),
    prisma.uniboxThread.count({ where: { ...baseWhere, isRead: false } }),
    prisma.uniboxThread.count({ where: { ...baseWhere, tag: 'INTERESTED' } }),
    prisma.uniboxThread.count({ where: { ...baseWhere, tag: 'MEETING_BOOKED' } }),
    prisma.uniboxThread.count({ where: { ...baseWhere, tag: 'NEW' } }),
  ]);

  return res.json({ total, unread, interested, meetingBooked, new: newThreads });
});

export default router;
