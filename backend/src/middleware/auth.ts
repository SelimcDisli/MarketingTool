import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import prisma from '../config/prisma';

export interface AuthRequest extends Request {
  userId?: string;
  workspaceId?: string;
  userRole?: string;
}

export interface JwtPayload {
  userId: string;
  email: string;
}

export const authenticate = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    const apiKey = req.headers['x-api-key'] as string;

    if (apiKey) {
      // API key auth
      const bcrypt = await import('bcryptjs');
      const keys = await prisma.apiKey.findMany({
        where: { keyPrefix: apiKey.substring(0, 8) },
      });

      for (const key of keys) {
        if (await bcrypt.compare(apiKey, key.keyHash)) {
          req.userId = key.userId;
          await prisma.apiKey.update({
            where: { id: key.id },
            data: { lastUsedAt: new Date() },
          });
          return next();
        }
      }
      return res.status(401).json({ error: 'Invalid API key' });
    }

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, config.jwt.secret) as JwtPayload;
    req.userId = decoded.userId;

    // Get workspace from header or query
    const workspaceId = req.headers['x-workspace-id'] as string || req.query.workspaceId as string;
    if (workspaceId) {
      const membership = await prisma.workspaceMember.findUnique({
        where: {
          userId_workspaceId: {
            userId: decoded.userId,
            workspaceId,
          },
        },
      });

      if (!membership) {
        return res.status(403).json({ error: 'Not a member of this workspace' });
      }

      req.workspaceId = workspaceId;
      req.userRole = membership.role;
    }

    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

export const requireWorkspace = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.workspaceId) {
    return res.status(400).json({ error: 'Workspace ID required. Set x-workspace-id header.' });
  }
  next();
};

export const requireRole = (...roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.userRole || !roles.includes(req.userRole)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
};
