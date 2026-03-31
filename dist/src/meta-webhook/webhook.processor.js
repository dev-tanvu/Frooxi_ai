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
var WebhookProcessor_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebhookProcessor = void 0;
const bullmq_1 = require("@nestjs/bullmq");
const common_1 = require("@nestjs/common");
const meta_webhook_service_1 = require("./meta-webhook.service");
const prisma_service_1 = require("../prisma/prisma.service");
const redis_service_1 = require("../redis/redis.service");
const agent_lifecycle_service_1 = require("./agent-lifecycle.service");
let WebhookProcessor = WebhookProcessor_1 = class WebhookProcessor extends bullmq_1.WorkerHost {
    metaWebhookService;
    prisma;
    redis;
    lifecycle;
    logger = new common_1.Logger(WebhookProcessor_1.name);
    constructor(metaWebhookService, prisma, redis, lifecycle) {
        super();
        this.metaWebhookService = metaWebhookService;
        this.prisma = prisma;
        this.redis = redis;
        this.lifecycle = lifecycle;
    }
    async process(job) {
        const { type, senderId, pageId } = job.data;
        const isAiEvent = type === 'MESSAGE' || type === 'POSTBACK' || type === 'REFERRAL';
        if (!isAiEvent) {
            const messages = await this.redis.drainBuffer(senderId);
            for (const msg of messages) {
                await this.processNonAiEvent(msg);
            }
            return;
        }
        const lockKey = `typing_lock:${senderId}`;
        const acquired = await this.redis.setNX(lockKey, '1', 30);
        if (!acquired) {
            this.logger.debug(`🔇 Lock held for ${senderId}. Message is buffered. Job ${job.id} exiting silently.`);
            return;
        }
        if (pageId && senderId !== pageId) {
            this.lifecycle.getTokenOnly(pageId).then(token => {
                if (token)
                    this.lifecycle.startTypingHeartbeat(pageId, senderId, token);
            }).catch(() => { });
        }
        try {
            let loopCount = 0;
            const MAX_LOOPS = 5;
            while (loopCount < MAX_LOOPS) {
                loopCount++;
                const messages = await this.redis.drainBuffer(senderId);
                if (messages.length === 0) {
                    this.logger.debug(`📭 Buffer empty for ${senderId}. Orchestration complete after ${loopCount} loops.`);
                    break;
                }
                this.logger.log(`📦 Drained ${messages.length} message(s) from buffer for ${senderId} (loop ${loopCount})`);
                const aiMessages = messages.filter(m => m.type === 'MESSAGE' || m.type === 'REFERRAL' || m.type === 'POSTBACK');
                const nonAiMessages = messages.filter(m => m.type !== 'MESSAGE' && m.type !== 'REFERRAL' && m.type !== 'POSTBACK');
                for (const msg of nonAiMessages) {
                    await this.processNonAiEvent(msg);
                }
                if (aiMessages.length > 0) {
                    await this.metaWebhookService.processOrchestratedBatch(aiMessages);
                }
                await new Promise(resolve => setTimeout(resolve, 300));
            }
        }
        catch (error) {
            this.logger.error(`🔥 Orchestrator job ${job.id} failed: ${error.message}`, error.stack);
            throw error;
        }
        finally {
            await this.redis.del(lockKey);
        }
    }
    async processNonAiEvent(msg) {
        switch (msg.type) {
            case 'READ':
                await this.handleRead(msg);
                break;
            case 'HANDOVER':
                await this.handleHandover(msg);
                break;
            default:
                this.logger.debug(`Skipping non-actionable event type: ${msg.type}`);
        }
    }
    async handleRead(data) {
        const { senderId, read } = data;
        if (!read?.watermark)
            return;
        const watermark = read.watermark;
        await this.prisma.customer.updateMany({
            where: { platformCustomerId: senderId },
            data: { lastReadAt: new Date(watermark) }
        });
        this.logger.log(`📖 Updated lastReadAt for ${senderId} to ${new Date(watermark).toISOString()}`);
    }
    async handleHandover(data) {
        const { senderId, handover } = data;
        if (!handover)
            return;
        if (handover.new_owner_app_id) {
            await this.redis.set(`admin_pause:${senderId}`, '1', 3600);
            this.logger.log(`🤝 Handover: Admin took control for ${senderId}. AI paused for 1 hour.`);
        }
        else if (handover.previous_owner_app_id) {
            await this.redis.del(`admin_pause:${senderId}`);
            this.logger.log(`🤝 Thread control passed back to AI for ${senderId}. AI resumed.`);
            const welcomeMsg = {
                ...data,
                type: 'MESSAGE',
                message: { text: "Hello! Our admin has resolved your query. I am your AI assistant, let me know if you need help with anything else!", is_echo: false }
            };
            await this.metaWebhookService.processOrchestratedBatch([welcomeMsg]);
        }
    }
};
exports.WebhookProcessor = WebhookProcessor;
exports.WebhookProcessor = WebhookProcessor = WebhookProcessor_1 = __decorate([
    (0, bullmq_1.Processor)('webhook'),
    __metadata("design:paramtypes", [meta_webhook_service_1.MetaWebhookService,
        prisma_service_1.PrismaService,
        redis_service_1.RedisService,
        agent_lifecycle_service_1.AgentLifecycleService])
], WebhookProcessor);
//# sourceMappingURL=webhook.processor.js.map