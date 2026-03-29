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
var ProactiveService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProactiveService = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const prisma_service_1 = require("../prisma/prisma.service");
const meta_api_service_1 = require("../meta-webhook/meta-api.service");
const encryption_service_1 = require("../common/encryption.service");
let ProactiveService = ProactiveService_1 = class ProactiveService {
    prisma;
    metaApi;
    encryption;
    logger = new common_1.Logger(ProactiveService_1.name);
    constructor(prisma, metaApi, encryption) {
        this.prisma = prisma;
        this.metaApi = metaApi;
        this.encryption = encryption;
    }
    async handleAbandonedCarts() {
        this.logger.log('🕒 Running Abandoned Cart CRON job...');
        await this.prisma.ensureConnected();
        const oneHourAgo = new Date(Date.now() - 1 * 60 * 60 * 1000);
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        try {
            const abandonedOrders = await this.prisma.order.findMany({
                where: {
                    status: 'PLACED',
                    abandonedFollowUpSent: false,
                    createdAt: { lt: oneHourAgo }
                },
                include: { items: true }
            });
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
                        let message = `Hi ${order.customerName.split(' ')[0]}! Just checking in about your interest in ${itemName}. If you have any questions, I'm here to help! 😊`;
                        if (order.createdAt <= oneHourAgo) {
                            message = `Hey ${order.customerName.split(' ')[0]}! We noticed you were interested in ${itemName} but didn't complete your order. Is there anything I can help you with? 😊`;
                        }
                        else if (order.createdAt <= oneDayAgo) {
                            message = `Hi ${order.customerName.split(' ')[0]}! Just checking in about your interest in ${itemName}. If you have any questions or need help with the ordering process, I'm here to assist! 🛍️`;
                        }
                        else if (order.createdAt <= sevenDaysAgo) {
                            message = `Hello ${order.customerName.split(' ')[0]}! We saw you were looking at ${itemName} a while ago. If you're still interested, we'd love to help you complete your order. Let me know if you need any information! 🌟`;
                        }
                        await this.metaApi.sendMessage(integration.pageId, order.customerId, message, integration.pageAccessToken);
                        await this.prisma.order.update({
                            where: { id: order.id },
                            data: { abandonedFollowUpSent: true }
                        });
                    }
                }
                catch (innerError) {
                    this.logger.error(`❌ Failed to process abandoned cart for Order ${order.id}: ${innerError.message}`);
                }
            }
        }
        catch (error) {
            this.logger.error(`❌ Abandoned Cart CRON failed: ${error.message}`);
        }
    }
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
                        await this.metaApi.sendMessage(integration.pageId, order.customer.platformCustomerId, message, integration.pageAccessToken);
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
            this.logger.error(`❌ Post-Purchase Feedback CRON failed: ${error.message}`);
        }
    }
};
exports.ProactiveService = ProactiveService;
__decorate([
    (0, schedule_1.Cron)(schedule_1.CronExpression.EVERY_30_MINUTES),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ProactiveService.prototype, "handleAbandonedCarts", null);
__decorate([
    (0, schedule_1.Cron)(schedule_1.CronExpression.EVERY_DAY_AT_NOON),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ProactiveService.prototype, "handlePostPurchaseFeedback", null);
exports.ProactiveService = ProactiveService = ProactiveService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        meta_api_service_1.MetaApiService,
        encryption_service_1.EncryptionService])
], ProactiveService);
//# sourceMappingURL=proactive.service.js.map