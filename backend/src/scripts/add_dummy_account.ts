
import { PrismaClient } from '@prisma/client';
import { encrypt } from '../utils/crypto';

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

    const account = await prisma.emailAccount.create({
        data: {
            workspaceId,
            email: 'dummy@streamline.com',
            displayName: 'Dummy Sender',
            provider: 'SMTP',
            smtpHost: 'smtp.example.com',
            smtpPort: 587,
            smtpUser: 'dummy',
            smtpPass: encrypt('dummy-password'), // Encrypt password
            imapHost: 'imap.example.com',
            imapPort: 993,
            imapUser: 'dummy',
            imapPass: encrypt('dummy-password'),
            healthScore: 100,
            isActive: true, // Auto-activate
        },
    });

    console.log(`Created dummy account: ${account.email} (${account.id})`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
