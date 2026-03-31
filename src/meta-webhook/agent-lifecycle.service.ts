import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { MetaApiService } from './meta-api.service';
import { EncryptionService } from '../common/encryption.service';
import { WebhookStateService } from './webhook-state.service';

@Injectable()
export class AgentLifecycleService {
    private readonly logger = new Logger(AgentLifecycleService.name);

    constructor(
        private prisma: PrismaService,
        private redis: RedisService,
        private metaApi: MetaApiService,
        private encryption: EncryptionService,
        private state: WebhookStateService,
    ) { }

    async getOrCreateContext(pageId: string, senderId: string, platform: any) {
        const cacheKey = `ctx:${pageId}:${senderId}`;
        const cached = await this.redis.get(cacheKey);
        if (cached) return JSON.parse(cached);

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

        await this.redis.set(cacheKey, JSON.stringify(ctx), 600); // 10 min TTL
        return ctx;
    }

    async getTokenOnly(pageId: string): Promise<string | null> {
        // ⚡ PERF: Check fast token cache first (avoids DB hit for typing indicator)
        const cached = await this.redis.get(`token:${pageId}`);
        if (cached) return cached;

        let integration = await this.prisma.metaIntegration.findUnique({ where: { pageId } });
        if (!integration) return null;
        const token = this.encryption.decrypt(integration.pageAccessToken);
        // Cache token for 10 min
        await this.redis.set(`token:${pageId}`, token, 600);
        return token;
    }

    async persistMessage(conversationId: string, sender: 'USER' | 'AGENT', content: string) {
        await this.prisma.message.create({ data: { conversationId, sender, content: content.slice(0, 2000) } });
    }

    async sendOptimizedResponse(pageId: string, senderId: string, text: string, token: string, conversationId: string, platform: any) {
        // ⚡ PERF: Fire persistence and sending in parallel — don't wait for DB before sending to Meta
        const persistPromise = Promise.all([
            this.persistMessage(conversationId, 'AGENT', text),
            this.redis.addMessage(senderId, 'AGENT', text)
        ]);

        const urls = text.match(/(https?:\/\/[^\s]+)/g) || [];
        // Clean out urls, order tags, markdown formatting, AND hallucinated 'image' text
        const body = text
            .replace(/\[ORDER_READY:.*?\]/gs, '')
            .replace(/\[ORDER_UPDATE:.*?\]/gs, '')
            .replace(/[*_~`#$]/g, '')
            .replace(/(https?:\/\/[^\s]+)/g, '')
            .replace(/\[Image(s)?\]/gi, '')
            .replace(/\b(image\s*){2,}\b/gi, '') // Removes repeating "image image image"
            .trim();

        let sendPromise: Promise<void>;
        if (platform === 'WHATSAPP') {
            sendPromise = (async () => {
                // Send text first, then images
                if (body) await this.metaApi.sendWhatsAppMessage(pageId, senderId, body, token);
                for (const u of urls) await this.metaApi.sendWhatsAppImage(pageId, senderId, u, token);
            })();
        } else {
            sendPromise = (async () => {
                // Send text first, then images
                if (body) await this.metaApi.sendMessageWithRetry(pageId, senderId, body, token);
                if (urls.length > 0) await this.metaApi.sendBatchImages(pageId, senderId, urls, token);
            })();
        }

        // Wait for both to finish
        await Promise.all([persistPromise, sendPromise]);
    }

    startTypingHeartbeat(pageId: string, senderId: string, token: string) {
        // A1: Fire and forget. Meta's typing_on lasts 20s automatically.
        // No setInterval means no memory leaks and it works across load balancers.
        this.metaApi.typingOn(pageId, senderId, token).catch(() => {});
    }

    stopTypingHeartbeat(pageId: string, senderId: string, token: string) {
        this.metaApi.typingOff(pageId, senderId, token).catch(() => {});
    }

    async isAgentActive(name: string) {
        return (await this.prisma.aiAgent.findUnique({ where: { name } }))?.isActive ?? true;
    }

    async getAgentUnavailableMessage(name: string, customerName: string) {
        return `Hello ${customerName}! Our AI agent is currently taking a short break. An admin will be with you shortly! 🙏`;
    }

    async executeAgentLifecycle(
        agentName: string,
        senderId: string,
        pageId: string,
        platform: any,
        messageText: string,
        logicFn: (ctx: { token: string; customer: any; conversation: any }) => Promise<void>
    ) {
        let token = '';
        try {
            const ctx = await this.getOrCreateContext(pageId, senderId, platform);
            token = ctx.integration.pageAccessToken;

            const isActive = await this.isAgentActive(agentName);
            const userFacingAgents = ['Text Agent', 'Order Agent', 'Visual Agent', 'Voice Agent'];
            
            if (!isActive && userFacingAgents.includes(agentName)) {
                const unavailableMsg = await this.getAgentUnavailableMessage(agentName, ctx.customer.name!);
                await this.sendOptimizedResponse(pageId, senderId, unavailableMsg, token, ctx.conversation.id, platform);
                return;
            }

            // ⚡ PERF: Run slot acquisition + typing start in parallel
            await Promise.all([
                this.state.acquireAiSlot(senderId, pageId, token),
                this.metaApi.typingOn(pageId, senderId, token).catch(() => {}),
            ]);

            // ⚡ PERF: Fire-and-forget user message persistence — don't block AI generation
            Promise.all([
                this.persistMessage(ctx.conversation.id, 'USER', messageText),
                this.redis.addMessage(senderId, 'USER', messageText)
            ]).catch(err => this.logger.error(`Message persistence failed: ${err.message}`));

            await logicFn({ token, customer: ctx.customer, conversation: ctx.conversation });

        } catch (error) {
            this.logger.error(`❌ [${agentName}] Error: ${error.message}`);
            if (token) {
                await this.metaApi.sendMessage(pageId, senderId, "I'm having a bit of trouble processing that. Give me a moment! 🛠️", token);
            }
        } finally {
            this.stopTypingHeartbeat(pageId, senderId, token);
            await this.state.releaseAiSlot(senderId);
        }
    }
}
