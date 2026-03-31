import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { MetaApiService } from './meta-api.service';

@Injectable()
export class WebhookStateService {
    private readonly logger = new Logger(WebhookStateService.name);
    private readonly MAX_CONCURRENT_TASKS = 50;

    constructor(
        private redis: RedisService,
        private metaApi: MetaApiService,
    ) { }

    /**
     * Anti-spam using Redis Sorted Set (O(log N) instead of O(N) list scan).
     * Scores = timestamps, members = unique timestamp strings.
     * Automatically prunes old entries.
     */
    async checkSpam(senderId: string) {
        const now = Date.now();
        const blockKey = `spam_block:${senderId}`;

        const isBlocked = await this.redis.get(blockKey);
        if (isBlocked) {
            return { blocked: true, message: "⚠️ You are temporarily blocked for spamming. Please wait a few minutes." };
        }

        const key = `spam:${senderId}`;
        const windowStart = now - 30000; // 30-second window

        // Pipeline: add entry + prune old + set TTL in ONE round-trip
        await this.redis.pipeline()
            .zadd(key, now, `${now}:${Math.random().toString(36).slice(2, 6)}`)
            .zremrangebyscore(key, '-inf', windowStart)
            .expire(key, 60)
            .exec();

        // Count entries in the 30s window
        const recentCount = await this.redis.zcard(key);

        if (recentCount > 5) {
            await this.redis.set(blockKey, '1', 600);
            return { blocked: true, message: "⚠️ Warning: Excessive messaging detected. You are now blocked for 10 minutes." };
        }

        return { blocked: false };
    }

    /**
     * Production-grade concurrency control using atomic INCR.
     * 
     * Strategy: Atomic INCR first, check if over limit, DECR to rollback if so.
     * No queue — graceful rejection with backpressure. Meta will retry.
     * Self-healing TTL ensures counter can't drift permanently.
     */
    async acquireAiSlot(senderId: string, pageId: string, token: string): Promise<void> {
        // Atomic: increment FIRST, then check
        const newCount = await this.redis.incr('active_ai_tasks');

        // Self-healing: set TTL so counter auto-resets if all processes crash
        // TTL is generous (5 min) — re-set on every acquire to keep it alive
        await this.redis.expire('active_ai_tasks', 300);

        if (newCount <= this.MAX_CONCURRENT_TASKS) {
            this.logger.log(`🚦 Slot acquired by ${senderId}. Active tasks: ${newCount}/${this.MAX_CONCURRENT_TASKS}`);
            return;
        }

        // Over limit — rollback the increment
        await this.redis.decr('active_ai_tasks');

        this.logger.warn(`🚨 All ${this.MAX_CONCURRENT_TASKS} slots full. Rejecting ${senderId} with backpressure.`);
        const busyMsg = "We're experiencing very high demand right now! Please send your message again in a moment and I'll be right with you. ⏳";
        this.metaApi.sendMessage(pageId, senderId, busyMsg, token).catch(() => { });
        throw new Error('SYSTEM_BUSY');
    }

    /**
     * Release slot with negative-drift protection.
     */
    async releaseAiSlot(senderId: string) {
        const count = await this.redis.decr('active_ai_tasks');

        // Self-healing: if counter went negative, reset to 0
        if (count < 0) {
            await this.redis.set('active_ai_tasks', '0');
            this.logger.warn(`🚨 active_ai_tasks drifted negative — auto-healed to 0`);
            return;
        }

        this.logger.log(`🚦 Slot released by ${senderId}. Active tasks: ${count}`);
    }

    async getAdminPause(senderId: string): Promise<boolean> {
        return !!(await this.redis.get(`admin_pause:${senderId}`));
    }
}
