// @ts-nocheck
import { Router, Response } from 'express';
import { z } from 'zod';
import { parse } from 'csv-parse/sync';
import prisma from '../config/prisma';
import { authenticate, requireWorkspace, AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { isValidEmail, getDomainFromEmail } from '../utils/dns';
import multer from 'multer';

const router = Router();
router.use(authenticate, requireWorkspace);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } }); // 20MB

const createLeadSchema = z.object({
  email: z.string().email(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  company: z.string().optional(),
  jobTitle: z.string().optional(),
  phone: z.string().optional(),
  website: z.string().optional(),
  location: z.string().optional(),
  linkedinUrl: z.string().optional(),
  listId: z.string().optional(),
  customVars: z.record(z.string()).optional(),
});

// List leads
router.get('/', async (req: AuthRequest, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
  const skip = (page - 1) * limit;
  const listId = req.query.listId as string;
  const status = req.query.status as string;
  const search = req.query.search as string;

  const where: any = { workspaceId: req.workspaceId };
  if (listId) where.listId = listId;
  if (status) where.status = status.toUpperCase();
  if (search) {
    where.OR = [
      { email: { contains: search, mode: 'insensitive' } },
      { firstName: { contains: search, mode: 'insensitive' } },
      { lastName: { contains: search, mode: 'insensitive' } },
      { company: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [leads, total] = await Promise.all([
    prisma.lead.findMany({
      where,
      include: {
        list: { select: { id: true, name: true } },
        _count: { select: { campaignLeads: true, sentEmails: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.lead.count({ where }),
  ]);

  return res.json({
    leads,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
});

// Create lead
router.post('/', async (req: AuthRequest, res: Response) => {
  const data = createLeadSchema.parse(req.body);

  // Check blocklist
  const blocked = await prisma.blocklistEntry.findFirst({
    where: {
      workspaceId: req.workspaceId!,
      OR: [
        { type: 'EMAIL', value: data.email.toLowerCase() },
        { type: 'DOMAIN', value: getDomainFromEmail(data.email) },
      ],
    },
  });
  if (blocked) throw new AppError('Email or domain is blocklisted', 400);

  const lead = await prisma.lead.create({
    data: {
      workspaceId: req.workspaceId!,
      ...data,
      email: data.email.toLowerCase(),
    },
  });

  // Update list count
  if (data.listId) {
    await prisma.leadList.update({
      where: { id: data.listId },
      data: { totalLeads: { increment: 1 } },
    });
  }

  return res.status(201).json({ lead });
});

// CSV Upload
router.post('/upload', upload.single('file'), async (req: AuthRequest, res: Response) => {
  if (!req.file) throw new AppError('No file uploaded', 400);

  const listId = req.body.listId;
  const listName = req.body.listName;

  // Create list if name provided
  let targetListId = listId;
  if (listName && !listId) {
    const list = await prisma.leadList.create({
      data: {
        workspaceId: req.workspaceId!,
        name: listName,
      },
    });
    targetListId = list.id;
  }

  const csvContent = req.file.buffer.toString('utf-8');
  const records = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  });

  // Get blocklist
  const blockedEntries = await prisma.blocklistEntry.findMany({
    where: { workspaceId: req.workspaceId! },
  });
  const blockedSet = new Set(blockedEntries.map((b) => b.value.toLowerCase()));

  // Get existing emails for dedup
  const existingLeads = await prisma.lead.findMany({
    where: { workspaceId: req.workspaceId! },
    select: { email: true },
  });
  const existingSet = new Set(existingLeads.map((l) => l.email.toLowerCase()));

  // Column mapping — user-supplied or auto-detect
  let userMapping: Record<string, string> | null = null;
  try {
    if (req.body.columnMapping) {
      userMapping = JSON.parse(req.body.columnMapping);
    }
  } catch { }

  const mapField = (record: any, fields: string[]) => {
    for (const f of fields) {
      if (record[f] !== undefined && record[f] !== '') return record[f];
    }
    return null;
  };

  // If user provided mapping, use it to extract a field value
  const mapUserField = (record: any, targetField: string): string | null => {
    if (!userMapping) return null;
    for (const [csvCol, target] of Object.entries(userMapping)) {
      if (target === targetField && record[csvCol] !== undefined && record[csvCol] !== '') {
        return record[csvCol];
      }
    }
    return null;
  };

  const results = { created: 0, skipped: 0, blocked: 0, invalid: 0, errors: [] as string[] };
  const leadsToCreate: any[] = [];

  for (const record of records) {
    const email = (
      mapUserField(record, 'email') || mapField(record, ['email', 'Email', 'EMAIL', 'e-mail', 'E-Mail', 'email_address']) || ''
    ).toLowerCase().trim();

    if (!email || !isValidEmail(email)) {
      results.invalid++;
      continue;
    }

    if (existingSet.has(email)) {
      results.skipped++;
      continue;
    }

    if (blockedSet.has(email) || blockedSet.has(getDomainFromEmail(email))) {
      results.blocked++;
      continue;
    }

    // Extract standard fields (user mapping first, then auto-detect fallback)
    const firstName = mapUserField(record, 'firstName') || mapField(record, ['firstName', 'first_name', 'First Name', 'first', 'vorname', 'Vorname']);
    const lastName = mapUserField(record, 'lastName') || mapField(record, ['lastName', 'last_name', 'Last Name', 'last', 'nachname', 'Nachname']);
    const company = mapUserField(record, 'company') || mapField(record, ['company', 'Company', 'company_name', 'Firma', 'firma', 'Unternehmen']);
    const jobTitle = mapUserField(record, 'jobTitle') || mapField(record, ['jobTitle', 'job_title', 'Job Title', 'title', 'Title', 'Position', 'position']);
    const phone = mapUserField(record, 'phone') || mapField(record, ['phone', 'Phone', 'phone_number', 'Telefon', 'telefon']);
    const website = mapUserField(record, 'website') || mapField(record, ['website', 'Website', 'url', 'URL', 'Webseite']);
    const location = mapUserField(record, 'location') || mapField(record, ['location', 'Location', 'city', 'City', 'Ort', 'ort', 'Standort']);
    const linkedinUrl = mapUserField(record, 'linkedinUrl') || mapField(record, ['linkedinUrl', 'linkedin', 'LinkedIn', 'linkedin_url']);

    // All remaining fields go to customVars
    const standardFields = new Set([
      'email', 'Email', 'EMAIL', 'e-mail', 'E-Mail', 'email_address',
      'firstName', 'first_name', 'First Name', 'first', 'vorname', 'Vorname',
      'lastName', 'last_name', 'Last Name', 'last', 'nachname', 'Nachname',
      'company', 'Company', 'company_name', 'Firma', 'firma', 'Unternehmen',
      'jobTitle', 'job_title', 'Job Title', 'title', 'Title', 'Position', 'position',
      'phone', 'Phone', 'phone_number', 'Telefon', 'telefon',
      'website', 'Website', 'url', 'URL', 'Webseite',
      'location', 'Location', 'city', 'City', 'Ort', 'ort', 'Standort',
      'linkedinUrl', 'linkedin', 'LinkedIn', 'linkedin_url',
    ]);

    const customVars: Record<string, string> = {};
    for (const [key, value] of Object.entries(record)) {
      if (!standardFields.has(key) && value) {
        customVars[key] = String(value);
      }
    }

    leadsToCreate.push({
      workspaceId: req.workspaceId!,
      listId: targetListId || null,
      email,
      firstName,
      lastName,
      company,
      jobTitle,
      phone,
      website,
      location,
      linkedinUrl,
      customVars: Object.keys(customVars).length > 0 ? customVars : undefined,
    });

    existingSet.add(email); // Prevent within-file duplicates
  }

  // Batch insert
  if (leadsToCreate.length > 0) {
    const created = await prisma.lead.createMany({
      data: leadsToCreate,
      skipDuplicates: true,
    });
    results.created = created.count;
  }

  // Update list count
  if (targetListId) {
    const count = await prisma.lead.count({
      where: { listId: targetListId },
    });
    await prisma.leadList.update({
      where: { id: targetListId },
      data: { totalLeads: count },
    });
  }

  return res.json({
    listId: targetListId,
    results,
    totalProcessed: records.length,
  });
});

// CSV Export
router.get('/export', async (req: AuthRequest, res: Response) => {
  const listId = req.query.listId as string;
  const where: any = { workspaceId: req.workspaceId };
  if (listId) where.listId = listId;

  const leads = await prisma.lead.findMany({
    where,
    orderBy: { createdAt: 'desc' },
  });

  const headers = ['email', 'firstName', 'lastName', 'company', 'jobTitle', 'phone', 'website', 'location', 'linkedinUrl', 'status'];

  // Collect all custom var keys
  const customKeys = new Set<string>();
  leads.forEach(lead => {
    if (lead.customVars && typeof lead.customVars === 'object') {
      Object.keys(lead.customVars as Record<string, string>).forEach(k => customKeys.add(k));
    }
  });
  const allHeaders = [...headers, ...Array.from(customKeys)];

  // Build CSV
  const escapeCsv = (v: string) => {
    if (!v) return '';
    if (v.includes(',') || v.includes('"') || v.includes('\n')) return `"${v.replace(/"/g, '""')}"`;
    return v;
  };

  let csv = allHeaders.map(escapeCsv).join(',') + '\n';
  for (const lead of leads) {
    const row = headers.map(h => escapeCsv(String((lead as any)[h] || '')));
    // Add custom vars
    const vars = (lead.customVars || {}) as Record<string, string>;
    for (const ck of customKeys) {
      row.push(escapeCsv(vars[ck] || ''));
    }
    csv += row.join(',') + '\n';
  }

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="leads_export_${Date.now()}.csv"`);
  return res.send(csv);
});

// Get lead detail
router.get('/:id', async (req: AuthRequest, res: Response) => {
  const lead = await prisma.lead.findFirst({
    where: { id: req.params.id, workspaceId: req.workspaceId },
    include: {
      list: true,
      campaignLeads: {
        include: { campaign: { select: { id: true, name: true, status: true } } },
      },
      sentEmails: {
        orderBy: { sentAt: 'desc' },
        take: 20,
        select: {
          id: true,
          subject: true,
          status: true,
          openedAt: true,
          clickedAt: true,
          repliedAt: true,
          sentAt: true,
        },
      },
      crmDeals: {
        include: { stage: true },
      },
    },
  });

  if (!lead) throw new AppError('Lead not found', 404);
  return res.json({ lead });
});

// Update lead
router.patch('/:id', async (req: AuthRequest, res: Response) => {
  const lead = await prisma.lead.findFirst({
    where: { id: req.params.id, workspaceId: req.workspaceId },
  });
  if (!lead) throw new AppError('Lead not found', 404);

  const allowed = ['firstName', 'lastName', 'company', 'jobTitle', 'phone',
    'website', 'location', 'linkedinUrl', 'status', 'interestLevel', 'customVars', 'listId'];
  const updates: any = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }

  const updated = await prisma.lead.update({
    where: { id: req.params.id },
    data: updates,
  });

  return res.json({ lead: updated });
});

// Delete lead
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  await prisma.lead.deleteMany({
    where: { id: req.params.id, workspaceId: req.workspaceId },
  });
  return res.json({ message: 'Lead deleted' });
});

// Verify leads
router.post('/verify', async (req: AuthRequest, res: Response) => {
  const { leadIds } = req.body;
  const leads = await prisma.lead.findMany({
    where: {
      id: { in: leadIds },
      workspaceId: req.workspaceId,
    },
  });

  const results = [];
  for (const lead of leads) {
    const isValid = isValidEmail(lead.email);
    // Could add MX check, SMTP verification etc.
    await prisma.lead.update({
      where: { id: lead.id },
      data: { isVerified: isValid, verifiedAt: new Date() },
    });
    results.push({ id: lead.id, email: lead.email, valid: isValid });
  }

  return res.json({ results, total: results.length });
});

// ==================== LEAD LISTS ====================

// List lead lists
router.get('/lists/all', async (req: AuthRequest, res: Response) => {
  const lists = await prisma.leadList.findMany({
    where: { workspaceId: req.workspaceId },
    include: { _count: { select: { leads: true } } },
    orderBy: { createdAt: 'desc' },
  });
  return res.json({ lists });
});

// Create lead list
router.post('/lists', async (req: AuthRequest, res: Response) => {
  const list = await prisma.leadList.create({
    data: {
      workspaceId: req.workspaceId!,
      name: req.body.name,
      description: req.body.description,
    },
  });
  return res.status(201).json({ list });
});

// Delete lead list
router.delete('/lists/:id', async (req: AuthRequest, res: Response) => {
  await prisma.leadList.deleteMany({
    where: { id: req.params.id, workspaceId: req.workspaceId },
  });
  return res.json({ message: 'List deleted' });
});

// ==================== BLOCKLIST ====================

// List blocklist
router.get('/blocklist', async (req: AuthRequest, res: Response) => {
  const entries = await prisma.blocklistEntry.findMany({
    where: { workspaceId: req.workspaceId },
    orderBy: { createdAt: 'desc' },
  });
  return res.json({ blocklist: entries, total: entries.length });
});

// Add to blocklist
router.post('/blocklist', async (req: AuthRequest, res: Response) => {
  const { value, type, reason } = req.body;
  const entry = await prisma.blocklistEntry.create({
    data: {
      workspaceId: req.workspaceId!,
      type: type || 'EMAIL',
      value: value.toLowerCase(),
      reason,
    },
  });
  return res.status(201).json({ entry });
});

// Import blocklist CSV
router.post('/blocklist/import', upload.single('file'), async (req: AuthRequest, res: Response) => {
  if (!req.file) throw new AppError('No file uploaded', 400);

  const content = req.file.buffer.toString('utf-8');
  const lines = content.split('\n').map(l => l.trim()).filter(Boolean);

  const entries = [];
  for (const line of lines) {
    const value = line.replace(/"/g, '').toLowerCase().trim();
    if (!value) continue;

    const type = value.includes('@') ? 'EMAIL' : 'DOMAIN';
    entries.push({
      workspaceId: req.workspaceId!,
      type: type as 'EMAIL' | 'DOMAIN',
      value,
    });
  }

  const created = await prisma.blocklistEntry.createMany({
    data: entries,
    skipDuplicates: true,
  });

  return res.json({ imported: created.count, total: entries.length });
});

// Remove from blocklist
router.delete('/blocklist/:id', async (req: AuthRequest, res: Response) => {
  await prisma.blocklistEntry.deleteMany({
    where: { id: req.params.id, workspaceId: req.workspaceId },
  });
  return res.json({ message: 'Removed from blocklist' });
});

export default router;
