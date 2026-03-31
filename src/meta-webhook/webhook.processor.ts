import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { MetaWebhookService } from './meta-webhook.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { AgentLifecycleService } from './agent-lifecycle.service';

@Processor('webhook')
export class WebhookProcessor extends WorkerHost {
    private readonly logger = new Logger(WebhookProcessor.name);

    constructor(
        private readonly metaWebhookService: MetaWebhookService,
        private readonly prisma: PrismaService,
        private readonly redis: RedisService,
        private readonly lifecycle: AgentLifecycleService,
    ) {
        super();
    }

    async process(job: Job<any, any, string>): Promise<any> {
        const { type, senderId, pageId } = job.data;

        // Non-AI events (READ, DELIVERY) process immediately from the buffer
        const isAiEvent = type === 'MESSAGE' || type === 'POSTBACK' || type === 'REFERRAL';

        if (!isAiEvent) {
            // For non-AI events, drain and process from buffer directly
            const messages = await this.redis.drainBuffer(senderId);
            for (const msg of messages) {
                await this.processNonAiEvent(msg);
            }
            return;
        }

        // ===== AI EVENT: ORCHESTRATOR LOOP =====
        const lockKey = `typing_lock:${senderId}`;
        const acquired = await this.redis.setNX(lockKey, '1', 30);

        if (!acquired) {
            // 🔇 SILENT EXIT: Lock is held by another job.
            // Our message is safe in the Redis burst buffer.
            // The active job will drain and process it — no re-queue needed.
            this.logger.debug(`🔇 Lock held for ${senderId}. Message is buffered. Job ${job.id} exiting silently.`);
            return; // ← This is the key change: exit, don't re-queue
        }

        // ⚡ PERF: Fire typing indicator immediately, but NOT for page's own echo messages
        if (pageId && senderId !== pageId) {
            this.lifecycle.getTokenOnly(pageId).then(token => {
                if (token) this.lifecycle.startTypingHeartbeat(pageId, senderId, token);
            }).catch(() => {});
        }

        try {
            // ===== THE ORCHESTRATION LOOP =====
            // Drain → Classify → Execute → Repeat until buffer is empty
            let loopCount = 0;
            const MAX_LOOPS = 5; // Safety limit to prevent infinite loops

            while (loopCount < MAX_LOOPS) {
                loopCount++;
                const messages = await this.redis.drainBuffer(senderId);

                if (messages.length === 0) {
                    this.logger.debug(`📭 Buffer empty for ${senderId}. Orchestration complete after ${loopCount} loops.`);
                    break;
                }

                this.logger.log(`📦 Drained ${messages.length} message(s) from buffer for ${senderId} (loop ${loopCount})`);

                // Classify messages by type
                const aiMessages = messages.filter(m => m.type === 'MESSAGE' || m.type === 'REFERRAL' || m.type === 'POSTBACK');
                const nonAiMessages = messages.filter(m => m.type !== 'MESSAGE' && m.type !== 'REFERRAL' && m.type !== 'POSTBACK');

                // Process non-AI events immediately (READ, DELIVERY, HANDOVER)
                for (const msg of nonAiMessages) {
                    await this.processNonAiEvent(msg);
                }

                // Process AI messages as an orchestrated batch
                if (aiMessages.length > 0) {
                    await this.metaWebhookService.processOrchestratedBatch(aiMessages);
                }

                // Brief pause before re-checking buffer to let any in-flight webhooks land
                await new Promise(resolve => setTimeout(resolve, 300));
            }
        } catch (error) {
            this.logger.error(`🔥 Orchestrator job ${job.id} failed: ${error.message}`, error.stack);
            throw error;
        } finally {
            await this.redis.del(lockKey);
        }
    }

    private async processNonAiEvent(msg: any) {
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

    private async handleRead(data: any) {
        const { senderId, read } = data;
        if (!read?.watermark) return;
        const watermark = read.watermark;
        
        await this.prisma.customer.updateMany({
            where: { platformCustomerId: senderId },
            data: { lastReadAt: new Date(watermark) }
        });
        
        this.logger.log(`📖 Updated lastReadAt for ${senderId} to ${new Date(watermark).toISOString()}`);
    }

    private async handleHandover(data: any) {
        const { senderId, handover } = data;
        if (!handover) return;
        
        if (handover.new_owner_app_id) {
            await this.redis.set(`admin_pause:${senderId}`, '1', 3600);
            this.logger.log(`🤝 Handover: Admin took control for ${senderId}. AI paused for 1 hour.`);
        } else if (handover.previous_owner_app_id) {
            await this.redis.del(`admin_pause:${senderId}`);
            this.logger.log(`🤝 Thread control passed back to AI for ${senderId}. AI resumed.`);
            
            // Send a welcome-back message through the service
            const welcomeMsg = {
                ...data,
                type: 'MESSAGE',
                message: { text: "Hello! Our admin has resolved your query. I am your AI assistant, let me know if you need help with anything else!", is_echo: false }
            };
            await this.metaWebhookService.processOrchestratedBatch([welcomeMsg]);
        }
    }
}
