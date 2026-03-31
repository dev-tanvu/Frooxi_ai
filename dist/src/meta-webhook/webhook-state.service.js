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
var WebhookStateService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebhookStateService = void 0;
const common_1 = require("@nestjs/common");
const redis_service_1 = require("../redis/redis.service");
const meta_api_service_1 = require("./meta-api.service");
let WebhookStateService = WebhookStateService_1 = class WebhookStateService {
    redis;
    metaApi;
    logger = new common_1.Logger(WebhookStateService_1.name);
    MAX_CONCURRENT_TASKS = 50;
    constructor(redis, metaApi) {
        this.redis = redis;
        this.metaApi = metaApi;
    }
    async checkSpam(senderId) {
        const now = Date.now();
        const blockKey = `spam_block:${senderId}`;
        const isBlocked = await this.redis.get(blockKey);
        if (isBlocked) {
            return { blocked: true, message: "⚠️ You are temporarily blocked for spamming. Please wait a few minutes." };
        }
        const key = `spam:${senderId}`;
        const windowStart = now - 30000;
        await this.redis.pipeline()
            .zadd(key, now, `${now}:${Math.random().toString(36).slice(2, 6)}`)
            .zremrangebyscore(key, '-inf', windowStart)
            .expire(key, 60)
            .exec();
        const recentCount = await this.redis.zcard(key);
        if (recentCount > 5) {
            await this.redis.set(blockKey, '1', 600);
            return { blocked: true, message: "⚠️ Warning: Excessive messaging detected. You are now blocked for 10 minutes." };
        }
        return { blocked: false };
    }
    async acquireAiSlot(senderId, pageId, token) {
        const newCount = await this.redis.incr('active_ai_tasks');
        await this.redis.expire('active_ai_tasks', 300);
        if (newCount <= this.MAX_CONCURRENT_TASKS) {
            this.logger.log(`🚦 Slot acquired by ${senderId}. Active tasks: ${newCount}/${this.MAX_CONCURRENT_TASKS}`);
            return;
        }
        await this.redis.decr('active_ai_tasks');
        this.logger.warn(`🚨 All ${this.MAX_CONCURRENT_TASKS} slots full. Rejecting ${senderId} with backpressure.`);
        const busyMsg = "We're experiencing very high demand right now! Please send your message again in a moment and I'll be right with you. ⏳";
        this.metaApi.sendMessage(pageId, senderId, busyMsg, token).catch(() => { });
        throw new Error('SYSTEM_BUSY');
    }
    async releaseAiSlot(senderId) {
        const count = await this.redis.decr('active_ai_tasks');
        if (count < 0) {
            await this.redis.set('active_ai_tasks', '0');
            this.logger.warn(`🚨 active_ai_tasks drifted negative — auto-healed to 0`);
            return;
        }
        this.logger.log(`🚦 Slot released by ${senderId}. Active tasks: ${count}`);
    }
    async getAdminPause(senderId) {
        return !!(await this.redis.get(`admin_pause:${senderId}`));
    }
};
exports.WebhookStateService = WebhookStateService;
exports.WebhookStateService = WebhookStateService = WebhookStateService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [redis_service_1.RedisService,
        meta_api_service_1.MetaApiService])
], WebhookStateService);
//# sourceMappingURL=webhook-state.service.js.map