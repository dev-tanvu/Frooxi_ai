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
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("./prisma/prisma.service");
const meta_webhook_service_1 = require("./meta-webhook/meta-webhook.service");
const meta_api_service_1 = require("./meta-webhook/meta-api.service");
const encryption_service_1 = require("./common/encryption.service");
let AppService = class AppService {
    prisma;
    metaWebhook;
    metaApi;
    encryption;
    constructor(prisma, metaWebhook, metaApi, encryption) {
        this.prisma = prisma;
        this.metaWebhook = metaWebhook;
        this.metaApi = metaApi;
        this.encryption = encryption;
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
        const historyMap = {};
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
exports.AppService = AppService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        meta_webhook_service_1.MetaWebhookService,
        meta_api_service_1.MetaApiService,
        encryption_service_1.EncryptionService])
], AppService);
//# sourceMappingURL=app.service.js.map