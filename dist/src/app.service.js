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
var AppService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("./prisma/prisma.service");
const meta_webhook_service_1 = require("./meta-webhook/meta-webhook.service");
const meta_api_service_1 = require("./meta-webhook/meta-api.service");
const encryption_service_1 = require("./common/encryption.service");
let AppService = AppService_1 = class AppService {
    prisma;
    metaWebhook;
    metaApi;
    encryption;
    logger = new common_1.Logger(AppService_1.name);
    constructor(prisma, metaWebhook, metaApi, encryption) {
        this.prisma = prisma;
        this.metaWebhook = metaWebhook;
        this.metaApi = metaApi;
        this.encryption = encryption;
    }
    async onModuleInit() {
        await this.seedMetaIntegration();
    }
    async seedMetaIntegration() {
        const pageId = process.env.META_PAGE_ID;
        const pageAccessToken = process.env.META_PAGE_ACCESS_TOKEN;
        const wabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
        if (!pageId || !pageAccessToken) {
            this.logger.warn('Skipping MetaIntegration seed: META_PAGE_ID or META_PAGE_ACCESS_TOKEN not found in environment');
            return;
        }
        try {
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
            }
            else {
                await this.prisma.metaIntegration.update({
                    where: { pageId },
                    data: {
                        pageAccessToken: encryptedToken,
                        wabaId: wabaId || null,
                    }
                });
                this.logger.log(`🔄 Automatically updated MetaIntegration from .env for Page ID: ${pageId}`);
            }
        }
        catch (error) {
            this.logger.error(`❌ Failed to seed MetaIntegration: ${error.message}`);
        }
    }
    getHello() {
        return 'Hello World!';
    }
    async getStats() {
        const totalProducts = await this.prisma.product.count();
        const totalConversations = await this.prisma.conversation.count();
        const totalMessages = await this.prisma.message.count();
        const storeConfig = await this.prisma.storeConfig.findFirst();
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const messageStats = await this.prisma.$queryRaw `
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
    async markNotificationRead(id) {
        return this.prisma.notification.update({
            where: { id },
            data: { read: true }
        });
    }
    async pauseAi(customerId, durationMinutes) {
        this.metaWebhook.pauseAiForCustomer(customerId, durationMinutes);
        return { success: true };
    }
    async resumeAi(customerId) {
        this.metaWebhook.resumeAiForCustomer(customerId);
        return { success: true };
    }
    async sendAdminMessage(customerId, message) {
        this.metaWebhook.pauseAiForCustomer(customerId, 60);
        const customer = await this.prisma.customer.findUnique({
            where: { id: customerId },
            include: { metaIntegration: true }
        });
        if (!customer)
            throw new Error('Customer not found');
        const decryptedToken = this.encryption.decrypt(customer.metaIntegration.pageAccessToken);
        await this.metaApi.sendMessage(customer.metaIntegration.pageId, customer.platformCustomerId, message, decryptedToken);
        return { success: true };
    }
};
exports.AppService = AppService;
exports.AppService = AppService = AppService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        meta_webhook_service_1.MetaWebhookService,
        meta_api_service_1.MetaApiService,
        encryption_service_1.EncryptionService])
], AppService);
//# sourceMappingURL=app.service.js.map