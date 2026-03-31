import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  const integrations = await prisma.metaIntegration.findMany();
  console.log('--- MetaIntegrations ---');
  console.log(JSON.stringify(integrations, null, 2));
  await prisma.$disconnect();
}

main().catch(console.error);
