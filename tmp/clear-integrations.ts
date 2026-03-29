import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function check() {
  const integrations = await prisma.metaIntegration.findMany();
  console.log('Integrations in DB:', JSON.stringify(integrations, null, 2));
  
  // Delete the one with pageId 1039851315877796 if it exists
  const deleted = await prisma.metaIntegration.deleteMany({
    where: { pageId: '1039851315877796' }
  });
  console.log('Deleted legacy integrations:', deleted.count);
  
  await prisma.$disconnect();
}

check();
