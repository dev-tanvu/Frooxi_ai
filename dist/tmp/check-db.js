"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
async function main() {
    const prisma = new client_1.PrismaClient();
    const integrations = await prisma.metaIntegration.findMany();
    console.log('--- MetaIntegrations ---');
    console.log(JSON.stringify(integrations, null, 2));
    await prisma.$disconnect();
}
main().catch(console.error);
//# sourceMappingURL=check-db.js.map