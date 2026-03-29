import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { MetaApiService } from '../meta-webhook/meta-api.service';
import { EncryptionService } from '../common/encryption.service';

@Injectable()
export class ProactiveService {
    private readonly logger = new Logger(ProactiveService.name);

    constructor(
        private prisma: PrismaService,
        private metaApi: MetaApiService,
        private encryption: EncryptionService,
    ) {}

    // 1. Abandoned Cart Follow-Up
    // Runs every 30 minutes to find PLACED orders older than specified intervals
    @Cron(CronExpression.EVERY_30_MINUTES)
    async handleAbandonedCarts() {
        this.logger.log('🕒 Running Abandoned Cart CRON job...');
        await this.prisma.ensureConnected();

        // Define time intervals for abandonment follow-ups
        const oneHourAgo = new Date(Date.now() - 1 * 60 * 60 * 1000);
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

        try {
            // Check for orders that need follow-ups at different intervals
            const abandonedOrders = await this.prisma.order.findMany({
                where: {
                    status: 'PLACED' as any,
                    abandonedFollowUpSent: false,
                    createdAt: { lt: oneHourAgo }
                },
                include: { items: true }
            }) as any;

            for (const order of abandonedOrders) {
                try {
                    this.logger.log(`🛒 Sending abandoned cart follow-up for Order ${order.id}`);
                    const integration = await this.prisma.metaIntegration.findUnique({
                        where: { id: order.customer.metaIntegrationId }
                    });

                    if (integration) {
                        integration.pageAccessToken = this.encryption.decrypt(integration.pageAccessToken);
                    }

                    if (integration && integration.pageId && integration.pageAccessToken) {
                        const itemName = order.items.length > 0 ? order.items[0].productName : 'your item';
                        
                        // Determine which follow-up message to send based on timing
                        let message = `Hi ${order.customerName.split(' ')[0]}! Just checking in about your interest in ${itemName}. If you have any questions, I'm here to help! 😊`;
                        if (order.createdAt <= oneHourAgo) {
                            message = `Hey ${order.customerName.split(' ')[0]}! We noticed you were interested in ${itemName} but didn't complete your order. Is there anything I can help you with? 😊`;
                        } else if (order.createdAt <= oneDayAgo) {
                            message = `Hi ${order.customerName.split(' ')[0]}! Just checking in about your interest in ${itemName}. If you have any questions or need help with the ordering process, I'm here to assist! 🛍️`;
                        } else if (order.createdAt <= sevenDaysAgo) {
                            message = `Hello ${order.customerName.split(' ')[0]}! We saw you were looking at ${itemName} a while ago. If you're still interested, we'd love to help you complete your order. Let me know if you need any information! 🌟`;
                        }
                        
                        await this.metaApi.sendMessage(
                            integration.pageId, 
                            order.customerId, 
                            message, 
                            integration.pageAccessToken
                        );

                        await this.prisma.order.update({
                            where: { id: order.id },
                            data: { abandonedFollowUpSent: true }
                        });
                    }
                } catch (innerError) {
                    this.logger.error(`❌ Failed to process abandoned cart for Order ${order.id}: ${innerError.message}`);
                }
            }
        } catch (error) {
            this.logger.error(`❌ Abandoned Cart CRON failed: ${error.message}`);
        }
    }

    // 2. Post-Purchase Feedback Loop
    // Runs daily to find DELIVERED orders older than 3 days.
    @Cron(CronExpression.EVERY_DAY_AT_NOON)
    async handlePostPurchaseFeedback() {
        this.logger.log('📦 Running Post-Purchase Feedback CRON job...');
        await this.prisma.ensureConnected();
        const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);

        try {
            const deliveredOrders = await this.prisma.order.findMany({
                where: {
                    status: 'DELIVERED',
                    updatedAt: { lt: threeDaysAgo },
                    feedbackRequested: false
                },
                include: { customer: true, items: true }
            });

            for (const order of deliveredOrders) {
                try {
                    this.logger.log(`🌟 Sending feedback request for Order ${order.id}`);
                    const integration = await this.prisma.metaIntegration.findUnique({
                        where: { id: order.customer.metaIntegrationId }
                    });

                    if (integration) {
                        const itemName = order.items.length > 0 ? order.items[0].productName : 'recent purchase';
                        const message = `Hi ${order.customerName.split(' ')[0]}! Hope you are loving your ${itemName}! If you have a moment, we'd love to hear your thoughts. Let me know if everything fits perfectly or if you'd like to see some new matching arrivals! ✨`;
                        
                        await this.metaApi.sendMessage(
                            integration.pageId, 
                            order.customer.platformCustomerId, 
                            message, 
                            integration.pageAccessToken
                        );

                        await this.prisma.order.update({
                            where: { id: order.id },
                            data: { feedbackRequested: true }
                        });
                    }
                } catch (innerError) {
                    this.logger.error(`❌ Failed to process feedback loop for Order ${order.id}: ${innerError.message}`);
                }
            }
        } catch (error) {
            this.logger.error(`❌ Post-Purchase Feedback CRON failed: ${error.message}`);
        }
    }
}
