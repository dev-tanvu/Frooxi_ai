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
var AgentLifecycleService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentLifecycleService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const redis_service_1 = require("../redis/redis.service");
const meta_api_service_1 = require("./meta-api.service");
const encryption_service_1 = require("../common/encryption.service");
const webhook_state_service_1 = require("./webhook-state.service");
let AgentLifecycleService = AgentLifecycleService_1 = class AgentLifecycleService {
    prisma;
    redis;
    metaApi;
    encryption;
    state;
    logger = new common_1.Logger(AgentLifecycleService_1.name);
    constructor(prisma, redis, metaApi, encryption, state) {
        this.prisma = prisma;
        this.redis = redis;
        this.metaApi = metaApi;
        this.encryption = encryption;
        this.state = state;
    }
    async getOrCreateContext(pageId, senderId, platform) {
        const cacheKey = `ctx:${pageId}:${senderId}`;
        const cached = await this.redis.get(cacheKey);
        if (cached)
            return JSON.parse(cached);
        let integration = await this.prisma.metaIntegration.findUnique({ where: { pageId } });
        if (!integration) {
            this.logger.error(`❌ No integration found in database for Page ID: ${pageId}`);
            throw new Error("No integration");
        }
        let customer = await this.prisma.customer.findUnique({
            where: { metaIntegrationId_platformCustomerId: { metaIntegrationId: integration.id, platformCustomerId: senderId } }
        });
        if (!customer) {
            customer = await this.prisma.customer.create({
                data: { metaIntegrationId: integration.id, platformCustomerId: senderId, name: `Customer ${senderId.slice(-4)}` }
            });
        }
        let conversation = await this.prisma.conversation.findUnique({
            where: { metaIntegrationId_customerId: { metaIntegrationId: integration.id, customerId: customer.id } }
        });
        if (!conversation) {
            conversation = await this.prisma.conversation.create({
                data: { metaIntegrationId: integration.id, customerId: customer.id, platform }
            });
        }
        const ctx = {
            integration: { ...integration, pageAccessToken: this.encryption.decrypt(integration.pageAccessToken) },
            customer,
            conversation
        };
        await this.redis.set(cacheKey, JSON.stringify(ctx), 600);
        return ctx;
    }
    async getTokenOnly(pageId) {
        const cached = await this.redis.get(`token:${pageId}`);
        if (cached)
            return cached;
        let integration = await this.prisma.metaIntegration.findUnique({ where: { pageId } });
        if (!integration)
            return null;
        const token = this.encryption.decrypt(integration.pageAccessToken);
        await this.redis.set(`token:${pageId}`, token, 600);
        return token;
    }
    async persistMessage(conversationId, sender, content) {
        await this.prisma.message.create({ data: { conversationId, sender, content: content.slice(0, 2000) } });
    }
    async sendOptimizedResponse(pageId, senderId, text, token, conversationId, platform) {
        const persistPromise = Promise.all([
            this.persistMessage(conversationId, 'AGENT', text),
            this.redis.addMessage(senderId, 'AGENT', text)
        ]);
        const urls = text.match(/(https?:\/\/[^\s]+)/g) || [];
        const body = text
            .replace(/\[ORDER_READY:.*?\]/gs, '')
            .replace(/\[ORDER_UPDATE:.*?\]/gs, '')
            .replace(/[*_~`#$]/g, '')
            .replace(/(https?:\/\/[^\s]+)/g, '')
            .replace(/\[Image(s)?\]/gi, '')
            .replace(/\b(image\s*){2,}\b/gi, '')
            .trim();
        let sendPromise;
        if (platform === 'WHATSAPP') {
            sendPromise = (async () => {
                if (body)
                    await this.metaApi.sendWhatsAppMessage(pageId, senderId, body, token);
                for (const u of urls)
                    await this.metaApi.sendWhatsAppImage(pageId, senderId, u, token);
            })();
        }
        else {
            sendPromise = (async () => {
                if (body)
                    await this.metaApi.sendMessageWithRetry(pageId, senderId, body, token);
                if (urls.length > 0)
                    await this.metaApi.sendBatchImages(pageId, senderId, urls, token);
            })();
        }
        await Promise.all([persistPromise, sendPromise]);
    }
    startTypingHeartbeat(pageId, senderId, token) {
        this.metaApi.typingOn(pageId, senderId, token).catch(() => { });
    }
    stopTypingHeartbeat(pageId, senderId, token) {
        this.metaApi.typingOff(pageId, senderId, token).catch(() => { });
    }
    async isAgentActive(name) {
        return (await this.prisma.aiAgent.findUnique({ where: { name } }))?.isActive ?? true;
    }
    async getAgentUnavailableMessage(name, customerName) {
        return `Hello ${customerName}! Our AI agent is currently taking a short break. An admin will be with you shortly! 🙏`;
    }
    async executeAgentLifecycle(agentName, senderId, pageId, platform, messageText, logicFn) {
        let token = '';
        try {
            const ctx = await this.getOrCreateContext(pageId, senderId, platform);
            token = ctx.integration.pageAccessToken;
            const isActive = await this.isAgentActive(agentName);
            const userFacingAgents = ['Text Agent', 'Order Agent', 'Visual Agent', 'Voice Agent'];
            if (!isActive && userFacingAgents.includes(agentName)) {
                const unavailableMsg = await this.getAgentUnavailableMessage(agentName, ctx.customer.name);
                await this.sendOptimizedResponse(pageId, senderId, unavailableMsg, token, ctx.conversation.id, platform);
                return;
            }
            await Promise.all([
                this.state.acquireAiSlot(senderId, pageId, token),
                this.metaApi.typingOn(pageId, senderId, token).catch(() => { }),
            ]);
            Promise.all([
                this.persistMessage(ctx.conversation.id, 'USER', messageText),
                this.redis.addMessage(senderId, 'USER', messageText)
            ]).catch(err => this.logger.error(`Message persistence failed: ${err.message}`));
            await logicFn({ token, customer: ctx.customer, conversation: ctx.conversation });
        }
        catch (error) {
            this.logger.error(`❌ [${agentName}] Error: ${error.message}`);
            if (token) {
                await this.metaApi.sendMessage(pageId, senderId, "I'm having a bit of trouble processing that. Give me a moment! 🛠️", token);
            }
        }
        finally {
            this.stopTypingHeartbeat(pageId, senderId, token);
            await this.state.releaseAiSlot(senderId);
        }
    }
};
exports.AgentLifecycleService = AgentLifecycleService;
exports.AgentLifecycleService = AgentLifecycleService = AgentLifecycleService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        redis_service_1.RedisService,
        meta_api_service_1.MetaApiService,
        encryption_service_1.EncryptionService,
        webhook_state_service_1.WebhookStateService])
], AgentLifecycleService);
//# sourceMappingURL=agent-lifecycle.service.js.map