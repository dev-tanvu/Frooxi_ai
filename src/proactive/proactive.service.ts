import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MetaApiService } from '../meta-webhook/meta-api.service';
import { EncryptionService } from '../common/encryption.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class ProactiveService implements OnModuleInit {
    private readonly logger = new Logger(ProactiveService.name);

    constructor(
        private prisma: PrismaService,
        private metaApi: MetaApiService,
        private encryption: EncryptionService,
        @InjectQueue('proactive') private proactiveQueue: Queue,
    ) {}

    async onModuleInit() {
        // Register Repeatable Jobs in BullMQ
        // This ensures the jobs run even if the server restarts and provides visibility in BullBoard
        
        // 1. Abandoned Cart Follow-Up (Every 30 minutes)
        await this.proactiveQueue.add(
            'handle-abandoned-carts',
            {},
            {
                repeat: { pattern: '*/30 * * * *' }, // Every 30 minutes
                jobId: 'abandoned-cart-sync'
            }
        );

        // 2. Post-Purchase Feedback (Daily at 12 PM)
        await this.proactiveQueue.add(
            'handle-feedback-loop',
            {},
            {
                repeat: { pattern: '0 12 * * *' }, // 12:00 PM daily
                jobId: 'feedback-loop-sync'
            }
        );

        this.logger.log('🚀 Proactive Repeatable Jobs registered in BullMQ');
    }

    // 1. Abandoned Cart Follow-Up Logic
    async handleAbandonedCarts() {
        this.logger.log('🕒 Running Abandoned Cart Task...');
        await this.prisma.ensureConnected();

        const oneHourAgo = new Date(Date.now() - 1 * 60 * 60 * 1000);
        const MAX_FOLLOW_UPS = 3;

        try {
            const abandonedCartItems = await this.prisma.cartItem.findMany({
                where: {
                    addedAt: { lt: oneHourAgo },
                    followUpCount: { lt: MAX_FOLLOW_UPS }
                },
                include: {
                    cart: {
                        include: {
                            customer: {
                                include: { metaIntegration: true }
                            }
                        }
                    }
                }
            }) as any[];

            for (const item of abandonedCartItems) {
                const customer = item.cart.customer;
                try {
                    if (customer.isOptedOut) continue;

                    this.logger.log(`🛒 Sending abandoned cart follow-up #${item.followUpCount + 1} for Product: ${item.productName} (Customer: ${customer.name})`);
                    const integration = customer.metaIntegration;

                    if (integration) {
                        integration.pageAccessToken = this.encryption.decrypt(integration.pageAccessToken);
                    }

                    if (integration && integration.pageId && integration.pageAccessToken) {
                        const firstName = customer.name?.split(' ')[0] || 'there';
                        const itemName = item.productName;

                        let message: string;
                        if (item.followUpCount === 0) {
                            message = `Hi ${firstName}! Just checking in about your interest in ${itemName}. If you have any questions, I'm here to help! 😊`;
                        } else if (item.followUpCount === 1) {
                            message = `Hi ${firstName}! Still thinking about ${itemName}? I can help with sizes, colors, or the ordering process anytime! 🛍️`;
                        } else {
                            message = `Hey ${firstName}! Last reminder about ${itemName} in your cart. Let me know if you'd like to proceed or if I can help find something else! ✨`;
                        }

                        await this.metaApi.sendMessage(
                            integration.pageId,
                            customer.platformCustomerId,
                            message,
                            integration.pageAccessToken
                        );

                        await this.prisma.cartItem.update({
                            where: { id: item.id },
                            data: { followUpCount: { increment: 1 } }
                        });
                    }
                } catch (innerError) {
                    this.logger.error(`❌ Failed to process abandoned cart for Item ${item.id}: ${innerError.message}`);
                }
            }
        } catch (error) {
            this.logger.error(`❌ Abandoned Cart logic failed: ${error.message}`);
            throw error;
        }
    }

    // 2. Post-Purchase Feedback Logic
    async handlePostPurchaseFeedback() {
        this.logger.log('📦 Running Post-Purchase Feedback Task...');
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
                    if ((order.customer as any).isOptedOut) continue;

                    this.logger.log(`🌟 Sending feedback request for Order ${order.id}`);
                    const integration = await this.prisma.metaIntegration.findUnique({
                        where: { id: order.customer.metaIntegrationId }
                    });

                    if (integration) {
                        const itemName = order.items.length > 0 ? order.items[0].productName : 'recent purchase';
                        const firstName = order.customerName.split(' ')[0];
                        const message = `Hi ${firstName}! Hope you are loving your ${itemName}! If you have a moment, we'd love to hear your thoughts. Let me know if everything fits perfectly or if you'd like to see some new matching arrivals! ✨`;
                        
                        await this.metaApi.sendMessage(
                            integration.pageId, 
                            order.customer.platformCustomerId, 
                            message, 
                            this.encryption.decrypt(integration.pageAccessToken)
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
            this.logger.error(`❌ Post-Purchase Feedback logic failed: ${error.message}`);
            throw error;
        }
    }
}
