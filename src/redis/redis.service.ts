import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(RedisService.name);
    private redisClient: Redis;

    constructor(private configService: ConfigService) { }

    onModuleInit() {
        const host = this.configService.get<string>('REDIS_HOST');
        const port = this.configService.get<number>('REDIS_PORT');
        const password = this.configService.get<string>('REDIS_PASSWORD');
        const useTls = this.configService.get<string>('REDIS_TLS') === 'true';

        this.redisClient = new Redis({
            host,
            port,
            password,
            tls: useTls ? {} : undefined,
            retryStrategy: (times) => {
                const delay = Math.min(times * 50, 2000);
                return delay;
            },
        });

        this.redisClient.on('connect', () => {
            this.logger.log('✅ Connected to Redis successfully');
        });

        this.redisClient.on('error', (err) => {
            this.logger.error('❌ Redis connection error:', err);
        });
    }

    onModuleDestroy() {
        this.redisClient.disconnect();
    }

    // ==========================================
    // OPTIMIZED: Pipeline-based message storage
    // Previously 3 separate round-trips, now 1
    // ==========================================

    /**
     * Add a message to a conversation's history using a single Redis pipeline.
     * @param customerId The user ID
     * @param sender 'USER' or 'AGENT'
     * @param content Message text
     * @param ttl Seconds until expiration (default 24h)
     */
    async addMessage(customerId: string, sender: string, content: string, ttl: number = 3600) {
        const key = `conv:${customerId}`;
        const message = JSON.stringify({ sender, content, timestamp: Date.now() });

        // Single pipeline: 3 commands → 1 round-trip
        await this.redisClient
            .pipeline()
            .lpush(key, message)
            .ltrim(key, 0, 19)
            .expire(key, ttl)
            .exec();
    }

    /**
     * Increment message count for a user (used for memory extraction triggers)
     */
    async incrementMessageCount(customerId: string): Promise<number> {
        const key = `msg_count:${customerId}`;
        const count = await this.redisClient.incr(key);
        if (count === 1) {
            // Expire the counter after 7 days of inactivity
            await this.redisClient.expire(key, 86400 * 7);
        }
        return count;
    }

    /**
     * Get the last N messages for a conversation
     * @param customerId The user ID
     * @param limit Number of messages to fetch
     */
    async getHistory(customerId: string, limit: number = 10): Promise<string[]> {
        const key = `conv:${customerId}`;
        const messages = await this.redisClient.lrange(key, 0, limit - 1);
        
        // Reverse because we stored with LPUSH (newest first), but AI needs chronological order
        return messages.reverse().map(m => {
            const parsed = JSON.parse(m);
            return `${parsed.sender}: ${parsed.content}`;
        });
    }

    /**
     * Clear history for a user
     */
    async clearHistory(customerId: string) {
        const key = `conv:${customerId}`;
        await this.redisClient.del(key);
    }

    // ==========================================
    // OPTIMIZED: Atomic set-if-not-exists for deduplication
    // ==========================================

    /**
     * Atomic SET with NX (set-if-not-exists) + TTL.
     * Returns true if the key was set (new), false if it already existed (duplicate).
     * Used for webhook deduplication.
     */
    async setNX(key: string, value: string, ttlSeconds: number): Promise<boolean> {
        const result = await this.redisClient.set(key, value, 'EX', ttlSeconds, 'NX');
        return result === 'OK';
    }

    // ==========================================
    // OPTIMIZED: Raw pipeline access for batching
    // ==========================================

    /**
     * Create a Redis pipeline for batching multiple commands into 1 round-trip.
     * Usage:
     *   const results = await redis.pipeline()
     *     .get('key1')
     *     .get('key2')
     *     .exec();
     */
    pipeline() {
        return this.redisClient.pipeline();
    }

    // ==========================================
    // Sorted Set operations (for spam detection)
    // ==========================================

    async zadd(key: string, score: number, member: string): Promise<void> {
        await this.redisClient.zadd(key, score, member);
    }

    async zcard(key: string): Promise<number> {
        return this.redisClient.zcard(key);
    }

    async zremrangebyscore(key: string, min: string | number, max: string | number): Promise<void> {
        await this.redisClient.zremrangebyscore(key, min, max);
    }

    // --- Generic Caching Methods ---
    async get(key: string): Promise<string | null> {
        return this.redisClient.get(key);
    }

    async set(key: string, value: string | number, ttlSeconds?: number): Promise<void> {
        if (ttlSeconds) {
            await this.redisClient.setex(key, ttlSeconds, value.toString());
        } else {
            await this.redisClient.set(key, value.toString());
        }
    }

    async del(key: string): Promise<void> {
        await this.redisClient.del(key);
    }

    async incr(key: string): Promise<number> {
        return this.redisClient.incr(key);
    }

    async decr(key: string): Promise<number> {
        return this.redisClient.decr(key);
    }

    async rpush(key: string, value: string): Promise<void> {
        await this.redisClient.rpush(key, value);
    }

    async lpop(key: string): Promise<string | null> {
        return this.redisClient.lpop(key);
    }

    async llen(key: string): Promise<number> {
        return this.redisClient.llen(key);
    }

    async expire(key: string, seconds: number): Promise<void> {
        await this.redisClient.expire(key, seconds);
    }

    async lrange(key: string, start: number, stop: number): Promise<string[]> {
        return this.redisClient.lrange(key, start, stop);
    }

    async getTtl(key: string): Promise<number> {
        return this.redisClient.ttl(key);
    }

    async sAdd(key: string, value: string): Promise<void> {
        await this.redisClient.sadd(key, value);
    }

    async sIsMember(key: string, value: string): Promise<boolean> {
        return (await this.redisClient.sismember(key, value)) === 1;
    }

    async sRem(key: string, value: string): Promise<void> {
        await this.redisClient.srem(key, value);
    }

    // ==========================================
    // BURST BUFFER: Atomic message aggregation
    // ==========================================

    /**
     * Push a message into the burst buffer for a user.
     * Each message is stored as a JSON string in a Redis list.
     * TTL of 60s ensures stale buffers are auto-cleaned.
     */
    async pushToBuffer(senderId: string, messageData: any): Promise<void> {
        const key = `burst:${senderId}`;
        await this.redisClient
            .pipeline()
            .rpush(key, JSON.stringify(messageData))
            .expire(key, 60)
            .exec();
    }

    /**
     * Atomically drain ALL messages from a user's burst buffer.
     * Uses a Lua script to guarantee no messages are lost between
     * the read and delete operations — even under high concurrency.
     * Returns parsed message objects in FIFO order.
     */
    async drainBuffer(senderId: string): Promise<any[]> {
        const key = `burst:${senderId}`;
        // Lua script: atomically get all items then delete the key
        const luaScript = `
            local items = redis.call('LRANGE', KEYS[1], 0, -1)
            redis.call('DEL', KEYS[1])
            return items
        `;
        const results = await this.redisClient.eval(luaScript, 1, key) as string[];
        return (results || []).map(item => JSON.parse(item));
    }
}
