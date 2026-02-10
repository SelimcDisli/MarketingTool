// @ts-nocheck
import { Router, Response } from 'express';
import prisma from '../config/prisma';
import { authenticate, requireWorkspace, requireRole, AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

const router = Router();
router.use(authenticate, requireWorkspace);

// Get current workspace
router.get('/', async (req: AuthRequest, res: Response) => {
  const workspace = await prisma.workspace.findUnique({
    where: { id: req.workspaceId },
    include: {
      _count: {
        select: {
          members: true,
          emailAccounts: true,
          campaigns: true,
          leads: true,
        },
      },
    },
  });

  if (!workspace) throw new AppError('Workspace not found', 404);
  return res.json({ workspace });
});

// Update workspace
router.patch('/', requireRole('OWNER', 'ADMIN'), async (req: AuthRequest, res: Response) => {
  const updates: any = {};
  if (req.body.name) updates.name = req.body.name;
  if (req.body.logoUrl !== undefined) updates.logoUrl = req.body.logoUrl;
  if (req.body.primaryColor) updates.primaryColor = req.body.primaryColor;
  if (req.body.whiteLabel !== undefined) updates.whiteLabel = req.body.whiteLabel;

  const workspace = await prisma.workspace.update({
    where: { id: req.workspaceId },
    data: updates,
  });

  return res.json({ workspace });
});

// List members
router.get('/members', async (req: AuthRequest, res: Response) => {
  const members = await prisma.workspaceMember.findMany({
    where: { workspaceId: req.workspaceId },
    include: {
      user: {
        select: { id: true, email: true, firstName: true, lastName: true, avatarUrl: true },
      },
    },
  });

  return res.json({ members });
});

// Invite member
router.post('/members', requireRole('OWNER', 'ADMIN'), async (req: AuthRequest, res: Response) => {
  const { email, role } = req.body;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new AppError('User not found. They need to register first.', 404);

  const existing = await prisma.workspaceMember.findUnique({
    where: {
      userId_workspaceId: {
        userId: user.id,
        workspaceId: req.workspaceId!,
      },
    },
  });
  if (existing) throw new AppError('User is already a member', 409);

  const member = await prisma.workspaceMember.create({
    data: {
      userId: user.id,
      workspaceId: req.workspaceId!,
      role: role || 'EDITOR',
      joinedAt: new Date(),
    },
    include: {
      user: {
        select: { id: true, email: true, firstName: true, lastName: true },
      },
    },
  });

  return res.status(201).json({ member });
});

// Update member role
router.patch('/members/:id', requireRole('OWNER', 'ADMIN'), async (req: AuthRequest, res: Response) => {
  const member = await prisma.workspaceMember.findFirst({
    where: { id: req.params.id, workspaceId: req.workspaceId },
  });
  if (!member) throw new AppError('Member not found', 404);
  if (member.role === 'OWNER' && req.userRole !== 'OWNER') {
    throw new AppError('Only owners can change owner roles', 403);
  }

  const updated = await prisma.workspaceMember.update({
    where: { id: req.params.id },
    data: { role: req.body.role },
  });

  return res.json({ member: updated });
});

// Remove member
router.delete('/members/:id', requireRole('OWNER', 'ADMIN'), async (req: AuthRequest, res: Response) => {
  const member = await prisma.workspaceMember.findFirst({
    where: { id: req.params.id, workspaceId: req.workspaceId },
  });
  if (!member) throw new AppError('Member not found', 404);
  if (member.role === 'OWNER') throw new AppError('Cannot remove the owner', 400);

  await prisma.workspaceMember.delete({ where: { id: req.params.id } });
  return res.json({ message: 'Member removed' });
});

export default router;
