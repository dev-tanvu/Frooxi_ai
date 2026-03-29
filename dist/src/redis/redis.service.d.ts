import { OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
export declare class RedisService implements OnModuleInit, OnModuleDestroy {
    private configService;
    private readonly logger;
    private redisClient;
    constructor(configService: ConfigService);
    onModuleInit(): void;
    onModuleDestroy(): void;
    addMessage(customerId: string, sender: string, content: string, ttl?: number): Promise<void>;
    incrementMessageCount(customerId: string): Promise<number>;
    getHistory(customerId: string, limit?: number): Promise<string[]>;
    clearHistory(customerId: string): Promise<void>;
    get(key: string): Promise<string | null>;
    set(key: string, value: string, ttlSeconds?: number): Promise<void>;
    del(key: string): Promise<void>;
}
