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

    /**
     * Add a message to a conversation's history
     * @param customerId The user ID
     * @param sender 'USER' or 'AGENT'
     * @param content Message text
     * @param ttl Seconds until expiration (default 24h)
     */
    async addMessage(customerId: string, sender: string, content: string, ttl: number = 3600) {
        const key = `conv:${customerId}`;
        const message = JSON.stringify({ sender, content, timestamp: Date.now() });

        // LPUSH adds to the front of the list
        await this.redisClient.lpush(key, message);
        // LTRIM keeps only the last N messages (e.g., 20)
        await this.redisClient.ltrim(key, 0, 19);
        // Set expiration
        await this.redisClient.expire(key, ttl);
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

    // --- Generic Caching Methods ---

    async get(key: string): Promise<string | null> {
        return this.redisClient.get(key);
    }

    async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
        if (ttlSeconds) {
            await this.redisClient.setex(key, ttlSeconds, value);
        } else {
            await this.redisClient.set(key, value);
        }
    }

    async del(key: string): Promise<void> {
        await this.redisClient.del(key);
    }
}
