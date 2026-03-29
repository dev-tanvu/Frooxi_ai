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
        await this.redisClient.lpush(key, message);
        await this.redisClient.ltrim(key, 0, 19);
        await this.redisClient.expire(key, ttl);
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
    async get(key) {
        return this.redisClient.get(key);
    }
    async set(key, value, ttlSeconds) {
        if (ttlSeconds) {
            await this.redisClient.setex(key, ttlSeconds, value);
        }
        else {
            await this.redisClient.set(key, value);
        }
    }
    async del(key) {
        await this.redisClient.del(key);
    }
};
exports.RedisService = RedisService;
exports.RedisService = RedisService = RedisService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], RedisService);
//# sourceMappingURL=redis.service.js.map