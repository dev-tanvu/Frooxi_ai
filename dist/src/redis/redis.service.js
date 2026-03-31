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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var RedisService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedisService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const ioredis_1 = __importDefault(require("ioredis"));
let RedisService = RedisService_1 = class RedisService {
    configService;
    logger = new common_1.Logger(RedisService_1.name);
    redisClient;
    constructor(configService) {
        this.configService = configService;
    }
    onModuleInit() {
        const host = this.configService.get('REDIS_HOST');
        const port = this.configService.get('REDIS_PORT');
        const password = this.configService.get('REDIS_PASSWORD');
        const useTls = this.configService.get('REDIS_TLS') === 'true';
        this.redisClient = new ioredis_1.default({
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
    async addMessage(customerId, sender, content, ttl = 3600) {
        const key = `conv:${customerId}`;
        const message = JSON.stringify({ sender, content, timestamp: Date.now() });
        await this.redisClient
            .pipeline()
            .lpush(key, message)
            .ltrim(key, 0, 19)
            .expire(key, ttl)
            .exec();
    }
    async incrementMessageCount(customerId) {
        const key = `msg_count:${customerId}`;
        const count = await this.redisClient.incr(key);
        if (count === 1) {
            await this.redisClient.expire(key, 86400 * 7);
        }
        return count;
    }
    async getHistory(customerId, limit = 10) {
        const key = `conv:${customerId}`;
        const messages = await this.redisClient.lrange(key, 0, limit - 1);
        return messages.reverse().map(m => {
            const parsed = JSON.parse(m);
            return `${parsed.sender}: ${parsed.content}`;
        });
    }
    async clearHistory(customerId) {
        const key = `conv:${customerId}`;
        await this.redisClient.del(key);
    }
    async setNX(key, value, ttlSeconds) {
        const result = await this.redisClient.set(key, value, 'EX', ttlSeconds, 'NX');
        return result === 'OK';
    }
    pipeline() {
        return this.redisClient.pipeline();
    }
    async zadd(key, score, member) {
        await this.redisClient.zadd(key, score, member);
    }
    async zcard(key) {
        return this.redisClient.zcard(key);
    }
    async zremrangebyscore(key, min, max) {
        await this.redisClient.zremrangebyscore(key, min, max);
    }
    async get(key) {
        return this.redisClient.get(key);
    }
    async set(key, value, ttlSeconds) {
        if (ttlSeconds) {
            await this.redisClient.setex(key, ttlSeconds, value.toString());
        }
        else {
            await this.redisClient.set(key, value.toString());
        }
    }
    async del(key) {
        await this.redisClient.del(key);
    }
    async incr(key) {
        return this.redisClient.incr(key);
    }
    async decr(key) {
        return this.redisClient.decr(key);
    }
    async rpush(key, value) {
        await this.redisClient.rpush(key, value);
    }
    async lpop(key) {
        return this.redisClient.lpop(key);
    }
    async llen(key) {
        return this.redisClient.llen(key);
    }
    async expire(key, seconds) {
        await this.redisClient.expire(key, seconds);
    }
    async lrange(key, start, stop) {
        return this.redisClient.lrange(key, start, stop);
    }
    async getTtl(key) {
        return this.redisClient.ttl(key);
    }
    async sAdd(key, value) {
        await this.redisClient.sadd(key, value);
    }
    async sIsMember(key, value) {
        return (await this.redisClient.sismember(key, value)) === 1;
    }
    async sRem(key, value) {
        await this.redisClient.srem(key, value);
    }
    async pushToBuffer(senderId, messageData) {
        const key = `burst:${senderId}`;
        await this.redisClient
            .pipeline()
            .rpush(key, JSON.stringify(messageData))
            .expire(key, 60)
            .exec();
    }
    async drainBuffer(senderId) {
        const key = `burst:${senderId}`;
        const luaScript = `
            local items = redis.call('LRANGE', KEYS[1], 0, -1)
            redis.call('DEL', KEYS[1])
            return items
        `;
        const results = await this.redisClient.eval(luaScript, 1, key);
        return (results || []).map(item => JSON.parse(item));
    }
};
exports.RedisService = RedisService;
exports.RedisService = RedisService = RedisService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], RedisService);
//# sourceMappingURL=redis.service.js.map