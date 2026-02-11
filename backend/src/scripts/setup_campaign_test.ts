
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const user = await prisma.user.findFirst({
        where: { email: 'test@streamline.com' },
        include: { memberships: true },
    });

    if (!user || user.memberships.length === 0) {
        console.error('User or workspace not found');
        return;
    }

    const workspaceId = user.memberships[0].workspaceId;

    // 1. Get or create dummy account
    let account = await prisma.emailAccount.findFirst({
        where: { workspaceId },
    });

    if (!account) {
        console.log('No account found, please run add_dummy_account.ts');
        return;
    }

    // 2. Get the test campaign
    const campaign = await prisma.campaign.findFirst({
        where: { workspaceId },
        orderBy: { createdAt: 'desc' },
    });

    if (!campaign) {
        console.log('No campaign found');
        return;
    }

    console.log(`Setting up campaign: ${campaign.name} (${campaign.id})`);

    // 3. Link account to campaign
    await prisma.campaignAccount.deleteMany({
        where: { campaignId: campaign.id },
    });

    await prisma.campaignAccount.create({
        data: {
            campaignId: campaign.id,
            accountId: account.id,
        },
    });
    console.log(`Linked account ${account.email}`);

    // 4. Create dummy lead and add to campaign
    const lead = await prisma.lead.upsert({
        where: { email_workspaceId: { email: 'lead@example.com', workspaceId } },
        update: {},
        create: {
            workspaceId,
            email: 'lead@example.com',
            firstName: 'Test',
            lastName: 'Lead',
            status: 'ACTIVE',
        },
    });

    await prisma.campaignLead.deleteMany({
        where: { campaignId: campaign.id },
    });

    await prisma.campaignLead.create({
        data: {
            campaignId: campaign.id,
            leadId: lead.id,
            status: 'PENDING',
        },
    });
    console.log(`Added lead ${lead.email}`);

    // 5. Ensure at least one step exists
    const stepCount = await prisma.campaignStep.count({
        where: { campaignId: campaign.id },
    });

    if (stepCount === 0) {
        await prisma.campaignStep.create({
            data: {
                campaignId: campaign.id,
                order: 0,
                subject: 'Test Subject',
                body: 'Test Body',
            },
        });
        console.log('Created default step');
    }

    console.log('Campaign setup complete. Ready to start.');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
