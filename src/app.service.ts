import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';
import { MetaWebhookService } from './meta-webhook/meta-webhook.service';
import { MetaApiService } from './meta-webhook/meta-api.service';
import { EncryptionService } from './common/encryption.service';

@Injectable()
export class AppService implements OnModuleInit {
  private readonly logger = new Logger(AppService.name);

  constructor(
    private prisma: PrismaService,
    private metaWebhook: MetaWebhookService,
    private metaApi: MetaApiService,
    private encryption: EncryptionService
  ) {}

  async onModuleInit() {
    await this.seedMetaIntegration();
  }

  private async seedMetaIntegration() {
    const pageId = process.env.META_PAGE_ID;
    const pageAccessToken = process.env.META_PAGE_ACCESS_TOKEN;
    const wabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;

    if (!pageId || !pageAccessToken) {
      this.logger.warn('Skipping MetaIntegration seed: META_PAGE_ID or META_PAGE_ACCESS_TOKEN not found in environment');
      return;
    }

    try {
      // Find or create a default user to own the integration
      let user = await this.prisma.user.findFirst();
      if (!user) {
        user = await this.prisma.user.create({
          data: {
            email: 'admin@system.local',
            password: 'auto-generated-seed-password-do-not-use',
            name: 'System Admin'
          }
        });
        this.logger.log('Created default system admin user for MetaIntegration');
      }

      const encryptedToken = this.encryption.encrypt(pageAccessToken);

      const existing = await this.prisma.metaIntegration.findUnique({
        where: { pageId }
      });

      if (!existing) {
        await this.prisma.metaIntegration.create({
          data: {
            pageId,
            pageAccessToken: encryptedToken,
            wabaId: wabaId || null,
            userId: user.id,
            businessName: process.env.META_BUSINESS_NAME || 'Auto-Seeded Integration'
          }
        });
        this.logger.log(`✅ Automatically seeded MetaIntegration from .env for Page ID: ${pageId}`);
      } else {
        await this.prisma.metaIntegration.update({
          where: { pageId },
          data: {
            pageAccessToken: encryptedToken,
            wabaId: wabaId || null,
          }
        });
        this.logger.log(`🔄 Automatically updated MetaIntegration from .env for Page ID: ${pageId}`);
      }
    } catch (error) {
       this.logger.error(`❌ Failed to seed MetaIntegration: ${error.message}`);
    }
  }

  getHello(): string {
    return 'Hello World!';
  }

  async getStats() {
    const totalProducts = await this.prisma.product.count();
    const totalConversations = await this.prisma.conversation.count();
    const totalMessages = await this.prisma.message.count();
    const storeConfig = await this.prisma.storeConfig.findFirst();

    // Fetch message history for the last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const messageStats = await this.prisma.$queryRaw<any[]>`
      SELECT DATE_TRUNC('day', "createdAt") as date, COUNT(*)::int as count
      FROM "Message"
      WHERE "createdAt" >= ${sevenDaysAgo}
      GROUP BY DATE_TRUNC('day', "createdAt")
      ORDER BY date ASC
    `;

    const messageHistory = messageStats.map(stat => ({
      date: new Date(stat.date).toISOString().split('T')[0],
      messages: Number(stat.count),
    }));

    return {
      totalProducts,
      totalConversations,
      totalMessages,
      storeName: storeConfig?.storeName || 'Frooxi',
      messageHistory,
    };
  }

  async getRecentMessages() {
    return this.prisma.message.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' },
      include: {
        conversation: true,
      }
    });
  }

  async getNotifications() {
    return this.prisma.notification.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        customer: true
      }
    });
  }

  async markNotificationRead(id: string) {
    return this.prisma.notification.update({
      where: { id },
      data: { read: true }
    });
  }

  async pauseAi(customerId: string, durationMinutes?: number) {
    this.metaWebhook.pauseAiForCustomer(customerId, durationMinutes);
    return { success: true };
  }

  async resumeAi(customerId: string) {
    this.metaWebhook.resumeAiForCustomer(customerId);
    return { success: true };
  }

  async sendAdminMessage(customerId: string, message: string) {
    // 1. Pause AI for 1 hour
    this.metaWebhook.pauseAiForCustomer(customerId, 60);
    
    // 2. Fetch customer integration
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      include: { metaIntegration: true }
    });
    
    if (!customer) throw new Error('Customer not found');
    
    // Decrypt token
    const decryptedToken = this.encryption.decrypt(customer.metaIntegration.pageAccessToken);

    // 3. Send message using MetaApi
    await this.metaApi.sendMessage(
      customer.metaIntegration.pageId,
      customer.platformCustomerId,
      message,
      decryptedToken
    );
    
    return { success: true };
  }
}
