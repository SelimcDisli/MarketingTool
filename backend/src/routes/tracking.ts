// @ts-nocheck
import { Router, Request, Response } from 'express';
import prisma from '../config/prisma';
import { dispatchWebhook } from './webhooks';

const router = Router();

// 1x1 transparent pixel for open tracking
const PIXEL = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
);

// Open tracking pixel
router.get('/open/:trackingId', async (req: Request, res: Response) => {
  const { trackingId } = req.params;

  try {
    const email = await prisma.sentEmail.findUnique({
      where: { trackingId },
      include: { campaign: { select: { workspaceId: true } } },
    });

    if (email) {
      const isFirst = !email.openedAt;

      await prisma.sentEmail.update({
        where: { trackingId },
        data: {
          openedAt: email.openedAt || new Date(),
          openCount: { increment: 1 },
        },
      });

      // Update variant stats
      if (email.variantId && isFirst) {
        await prisma.stepVariant.update({
          where: { id: email.variantId },
          data: { totalOpens: { increment: 1 } },
        });
      }

      // Update campaign stats
      if (isFirst) {
        await prisma.campaign.update({
          where: { id: email.campaignId },
          data: { totalOpens: { increment: 1 } },
        });

        // Dispatch webhook
        if (email.campaign.workspaceId) {
          await dispatchWebhook(email.campaign.workspaceId, 'email_opened', {
            emailId: email.id,
            campaignId: email.campaignId,
            leadId: email.leadId,
            toEmail: email.toEmail,
            openedAt: new Date().toISOString(),
          });
        }
      }
    }
  } catch (error) {
    console.error('Open tracking error:', error);
  }

  // Always return pixel
  res.writeHead(200, {
    'Content-Type': 'image/gif',
    'Content-Length': PIXEL.length,
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
  });
  res.end(PIXEL);
});

// Click tracking redirect
router.get('/click/:trackingId', async (req: Request, res: Response) => {
  const { trackingId } = req.params;
  const url = req.query.url as string;

  if (!url) return res.status(400).send('Missing URL');

  try {
    const email = await prisma.sentEmail.findUnique({
      where: { trackingId },
      include: { campaign: { select: { workspaceId: true } } },
    });

    if (email) {
      const isFirst = !email.clickedAt;

      await prisma.sentEmail.update({
        where: { trackingId },
        data: {
          clickedAt: email.clickedAt || new Date(),
          clickCount: { increment: 1 },
        },
      });

      if (email.variantId && isFirst) {
        await prisma.stepVariant.update({
          where: { id: email.variantId },
          data: { totalClicks: { increment: 1 } },
        });
      }

      if (isFirst) {
        await prisma.campaign.update({
          where: { id: email.campaignId },
          data: { totalClicks: { increment: 1 } },
        });

        if (email.campaign.workspaceId) {
          await dispatchWebhook(email.campaign.workspaceId, 'email_link_clicked', {
            emailId: email.id,
            campaignId: email.campaignId,
            leadId: email.leadId,
            url,
            clickedAt: new Date().toISOString(),
          });
        }
      }
    }
  } catch (error) {
    console.error('Click tracking error:', error);
  }

  // Redirect to original URL
  res.redirect(302, url);
});

// Unsubscribe
router.get('/unsubscribe/:trackingId', async (req: Request, res: Response) => {
  const { trackingId } = req.params;

  try {
    const email = await prisma.sentEmail.findUnique({
      where: { trackingId },
      include: { campaign: { select: { workspaceId: true } } },
    });

    if (email) {
      // Update lead status
      await prisma.lead.update({
        where: { id: email.leadId },
        data: { status: 'UNSUBSCRIBED' },
      });

      // Update campaign lead status
      await prisma.campaignLead.updateMany({
        where: { leadId: email.leadId },
        data: { status: 'UNSUBSCRIBED' },
      });

      // Add to blocklist
      if (email.campaign.workspaceId) {
        await prisma.blocklistEntry.create({
          data: {
            workspaceId: email.campaign.workspaceId,
            type: 'EMAIL',
            value: email.toEmail.toLowerCase(),
            reason: 'Unsubscribed',
          },
        }).catch(() => {}); // Ignore duplicate

        await dispatchWebhook(email.campaign.workspaceId, 'lead_unsubscribed', {
          leadId: email.leadId,
          email: email.toEmail,
          campaignId: email.campaignId,
        });
      }
    }
  } catch (error) {
    console.error('Unsubscribe error:', error);
  }

  res.send(`
    <html>
      <body style="font-family: sans-serif; text-align: center; padding: 50px;">
        <h2>You've been unsubscribed</h2>
        <p>You will no longer receive emails from this sender.</p>
      </body>
    </html>
  `);
});

export default router;
