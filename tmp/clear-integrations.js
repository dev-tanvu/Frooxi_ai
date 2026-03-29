const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  try {
    const integrations = await prisma.metaIntegration.findMany();
    console.log('Current Integrations:', integrations.length);
    
    const result = await prisma.metaIntegration.deleteMany({
      where: { pageId: '1039851315877796' }
    });
    console.log('Cleared old integration entries:', result.count);
  } catch (err) {
    console.error('Error clearing:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

check();
