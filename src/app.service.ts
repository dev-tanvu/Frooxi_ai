import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';
import { MetaWebhookService } from './meta-webhook/meta-webhook.service';
import { MetaApiService } from './meta-webhook/meta-api.service';
import { EncryptionService } from './common/encryption.service';

@Injectable()
export class AppService {
  constructor(
    private prisma: PrismaService,
    private metaWebhook: MetaWebhookService,
    private metaApi: MetaApiService,
    private encryption: EncryptionService
  ) {}

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

    const messageStats = await this.prisma.message.groupBy({
      by: ['createdAt'],
      where: {
        createdAt: {
          gte: sevenDaysAgo,
        },
      },
      _count: {
        id: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    // Simplify the date grouping for the frontend (Map to YYYY-MM-DD)
    const historyMap: Record<string, number> = {};
    messageStats.forEach(stat => {
      const dateKey = stat.createdAt.toISOString().split('T')[0];
      historyMap[dateKey] = (historyMap[dateKey] || 0) + stat._count.id;
    });

    const messageHistory = Object.entries(historyMap).map(([date, count]) => ({
      date,
      messages: count,
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
