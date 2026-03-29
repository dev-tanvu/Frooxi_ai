"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
async function check() {
    const integrations = await prisma.metaIntegration.findMany();
    console.log('Integrations in DB:', JSON.stringify(integrations, null, 2));
    const deleted = await prisma.metaIntegration.deleteMany({
        where: { pageId: '1039851315877796' }
    });
    console.log('Deleted legacy integrations:', deleted.count);
    await prisma.$disconnect();
}
check();
//# sourceMappingURL=clear-integrations.js.map