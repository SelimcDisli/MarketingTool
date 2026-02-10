// @ts-nocheck
import { Router, Response } from 'express';
import prisma from '../config/prisma';
import { authenticate, requireWorkspace, AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

const router = Router();
router.use(authenticate, requireWorkspace);

// List templates
router.get('/', async (req: AuthRequest, res: Response) => {
  const category = req.query.category as string;
  const search = req.query.search as string;

  const where: any = {
    OR: [
      { workspaceId: req.workspaceId },
      { isGlobal: true },
    ],
  };
  if (category) where.category = category;
  if (search) {
    where.AND = {
      OR: [
        { name: { contains: search, mode: 'insensitive' } },
        { subject: { contains: search, mode: 'insensitive' } },
      ],
    };
  }

  const templates = await prisma.emailTemplate.findMany({
    where,
    orderBy: [{ usageCount: 'desc' }, { createdAt: 'desc' }],
  });

  return res.json({ templates });
});

// Create template
router.post('/', async (req: AuthRequest, res: Response) => {
  const { name, category, subject, body } = req.body;

  const template = await prisma.emailTemplate.create({
    data: {
      workspaceId: req.workspaceId!,
      name,
      category,
      subject,
      body,
    },
  });

  return res.status(201).json({ template });
});

// Update template
router.patch('/:id', async (req: AuthRequest, res: Response) => {
  const template = await prisma.emailTemplate.findFirst({
    where: { id: req.params.id, workspaceId: req.workspaceId },
  });
  if (!template) throw new AppError('Template not found', 404);

  const updated = await prisma.emailTemplate.update({
    where: { id: req.params.id },
    data: {
      name: req.body.name,
      category: req.body.category,
      subject: req.body.subject,
      body: req.body.body,
    },
  });

  return res.json({ template: updated });
});

// Delete template
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  await prisma.emailTemplate.deleteMany({
    where: { id: req.params.id, workspaceId: req.workspaceId },
  });
  return res.json({ message: 'Template deleted' });
});

export default router;
