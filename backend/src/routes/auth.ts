// @ts-nocheck
import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import prisma from '../config/prisma';
import { config } from '../config';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  workspaceName: z.string().min(1),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

// Register
router.post('/register', async (req: Request, res: Response) => {
  try {
    const data = registerSchema.parse(req.body);
    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(data.password, 12);

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: data.email,
          passwordHash,
          firstName: data.firstName,
          lastName: data.lastName,
        },
      });

      const workspace = await tx.workspace.create({
        data: {
          name: data.workspaceName,
          slug: data.workspaceName.toLowerCase().replace(/\s+/g, '-') + '-' + Date.now(),
          members: {
            create: {
              userId: user.id,
              role: 'OWNER',
              joinedAt: new Date(),
            },
          },
        },
      });

      // Create default CRM pipeline
      const pipeline = await tx.crmPipeline.create({
        data: {
          workspaceId: workspace.id,
          name: 'Default Pipeline',
          isDefault: true,
          stages: {
            createMany: {
              data: [
                { name: 'Lead', order: 0, color: '#94a3b8' },
                { name: 'Contacted', order: 1, color: '#60a5fa' },
                { name: 'Interested', order: 2, color: '#34d399' },
                { name: 'Meeting Booked', order: 3, color: '#a78bfa' },
                { name: 'Proposal Sent', order: 4, color: '#fbbf24' },
                { name: 'Closed Won', order: 5, color: '#22c55e' },
                { name: 'Closed Lost', order: 6, color: '#ef4444' },
              ],
            },
          },
        },
      });

      return { user, workspace };
    });

    const token = jwt.sign(
      { userId: result.user.id, email: result.user.email },
      config.jwt.secret,
      { expiresIn: '7d' } as any
    );

    return res.status(201).json({
      token,
      user: {
        id: result.user.id,
        email: result.user.email,
        firstName: result.user.firstName,
        lastName: result.user.lastName,
      },
      workspace: {
        id: result.workspace.id,
        name: result.workspace.name,
        slug: result.workspace.slug,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    throw error;
  }
});

// Login
router.post('/login', async (req: Request, res: Response) => {
  try {
    const data = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({
      where: { email: data.email },
      include: {
        memberships: {
          include: { workspace: true },
        },
      },
    });

    if (!user || !user.passwordHash) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isValid = await bcrypt.compare(data.password, user.passwordHash);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email },
      config.jwt.secret,
      { expiresIn: '7d' } as any
    );

    return res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      },
      workspaces: user.memberships.map((m) => ({
        id: m.workspace.id,
        name: m.workspace.name,
        slug: m.workspace.slug,
        role: m.role,
      })),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    throw error;
  }
});

// Get current user
router.get('/me', authenticate, async (req: AuthRequest, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    include: {
      memberships: {
        include: { workspace: true },
      },
    },
  });

  if (!user) return res.status(404).json({ error: 'User not found' });

  return res.json({
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    workspaces: user.memberships.map((m) => ({
      id: m.workspace.id,
      name: m.workspace.name,
      slug: m.workspace.slug,
      role: m.role,
    })),
  });
});

export default router;
