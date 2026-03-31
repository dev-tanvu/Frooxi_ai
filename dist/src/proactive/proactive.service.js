"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var ProactiveService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProactiveService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const meta_api_service_1 = require("../meta-webhook/meta-api.service");
const encryption_service_1 = require("../common/encryption.service");
const bullmq_1 = require("@nestjs/bullmq");
const bullmq_2 = require("bullmq");
let ProactiveService = ProactiveService_1 = class ProactiveService {
    prisma;
    metaApi;
    encryption;
    proactiveQueue;
    logger = new common_1.Logger(ProactiveService_1.name);
    constructor(prisma, metaApi, encryption, proactiveQueue) {
        this.prisma = prisma;
        this.metaApi = metaApi;
        this.encryption = encryption;
        this.proactiveQueue = proactiveQueue;
    }
    async onModuleInit() {
        await this.proactiveQueue.add('handle-abandoned-carts', {}, {
            repeat: { pattern: '*/30 * * * *' },
            jobId: 'abandoned-cart-sync'
        });
        await this.proactiveQueue.add('handle-feedback-loop', {}, {
            repeat: { pattern: '0 12 * * *' },
            jobId: 'feedback-loop-sync'
        });
        this.logger.log('🚀 Proactive Repeatable Jobs registered in BullMQ');
    }
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
            });
            for (const item of abandonedCartItems) {
                const customer = item.cart.customer;
                try {
                    if (customer.isOptedOut)
                        continue;
                    this.logger.log(`🛒 Sending abandoned cart follow-up #${item.followUpCount + 1} for Product: ${item.productName} (Customer: ${customer.name})`);
                    const integration = customer.metaIntegration;
                    if (integration) {
                        integration.pageAccessToken = this.encryption.decrypt(integration.pageAccessToken);
                    }
                    if (integration && integration.pageId && integration.pageAccessToken) {
                        const firstName = customer.name?.split(' ')[0] || 'there';
                        const itemName = item.productName;
                        let message;
                        if (item.followUpCount === 0) {
                            message = `Hi ${firstName}! Just checking in about your interest in ${itemName}. If you have any questions, I'm here to help! 😊`;
                        }
                        else if (item.followUpCount === 1) {
                            message = `Hi ${firstName}! Still thinking about ${itemName}? I can help with sizes, colors, or the ordering process anytime! 🛍️`;
                        }
                        else {
                            message = `Hey ${firstName}! Last reminder about ${itemName} in your cart. Let me know if you'd like to proceed or if I can help find something else! ✨`;
                        }
                        await this.metaApi.sendMessage(integration.pageId, customer.platformCustomerId, message, integration.pageAccessToken);
                        await this.prisma.cartItem.update({
                            where: { id: item.id },
                            data: { followUpCount: { increment: 1 } }
                        });
                    }
                }
                catch (innerError) {
                    this.logger.error(`❌ Failed to process abandoned cart for Item ${item.id}: ${innerError.message}`);
                }
            }
        }
        catch (error) {
            this.logger.error(`❌ Abandoned Cart logic failed: ${error.message}`);
            throw error;
        }
    }
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
                    if (order.customer.isOptedOut)
                        continue;
                    this.logger.log(`🌟 Sending feedback request for Order ${order.id}`);
                    const integration = await this.prisma.metaIntegration.findUnique({
                        where: { id: order.customer.metaIntegrationId }
                    });
                    if (integration) {
                        const itemName = order.items.length > 0 ? order.items[0].productName : 'recent purchase';
                        const firstName = order.customerName.split(' ')[0];
                        const message = `Hi ${firstName}! Hope you are loving your ${itemName}! If you have a moment, we'd love to hear your thoughts. Let me know if everything fits perfectly or if you'd like to see some new matching arrivals! ✨`;
                        await this.metaApi.sendMessage(integration.pageId, order.customer.platformCustomerId, message, this.encryption.decrypt(integration.pageAccessToken));
                        await this.prisma.order.update({
                            where: { id: order.id },
                            data: { feedbackRequested: true }
                        });
                    }
                }
                catch (innerError) {
                    this.logger.error(`❌ Failed to process feedback loop for Order ${order.id}: ${innerError.message}`);
                }
            }
        }
        catch (error) {
            this.logger.error(`❌ Post-Purchase Feedback logic failed: ${error.message}`);
            throw error;
        }
    }
};
exports.ProactiveService = ProactiveService;
exports.ProactiveService = ProactiveService = ProactiveService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(3, (0, bullmq_1.InjectQueue)('proactive')),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        meta_api_service_1.MetaApiService,
        encryption_service_1.EncryptionService,
        bullmq_2.Queue])
], ProactiveService);
//# sourceMappingURL=proactive.service.js.map