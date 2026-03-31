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
var IntentRouterService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.IntentRouterService = void 0;
const common_1 = require("@nestjs/common");
const redis_service_1 = require("../redis/redis.service");
let IntentRouterService = IntentRouterService_1 = class IntentRouterService {
    redis;
    logger = new common_1.Logger(IntentRouterService_1.name);
    constructor(redis) {
        this.redis = redis;
    }
    detectIntentFastPath(text, history) {
        const lower = text.toLowerCase();
        if (history.length > 0) {
            const lastAi = history.filter(m => m.startsWith('AGENT:')).slice(-1)[0]?.toLowerCase() || '';
            const isOrderPrompt = /order|started|get that|color|size|address|delivery/i.test(lastAi);
            const isNo = /^(no|nah|na|nope|cancel|stop|r na|na thak)\b/i.test(lower);
            const isProductQuery = /\b(ache|shirt|pant|dress|tshirt|ki|colour|price|dam|kat)\b/i.test(lower);
            if (isOrderPrompt && !isNo && !isProductQuery) {
                return {
                    intent: 'Ordering',
                    frustration_level: 0,
                    urgency: 'Medium',
                    style: 'Casual',
                    search_queries: []
                };
            }
        }
        const patterns = {
            buying: [/^(buy|order|want|get|take)\s+/i, /\b(price|cost|how much|dam|bikri|kenbo)\b/i, /\b(place|confirm)\s+order\b/i],
            browsing: [/^(show|see|looking for|search)\s+/i, /\b(pics?|photos?|images?|sizes?|colors?|ache|shirt|pant|tshirt|golla|fabric|material|ki|dekhao)\b/i],
            support: [/help|problem|issue|refund|return|track|status|shuchok|ashubidha/i],
            handoff: [/human|person|agent|talk to|manager|admin|manush/i]
        };
        for (const [intent, regexes] of Object.entries(patterns)) {
            if (regexes.some((r) => r.test(lower))) {
                return {
                    intent: intent.charAt(0).toUpperCase() + intent.slice(1),
                    frustration_level: 0,
                    urgency: 'Low',
                    style: 'Short',
                    search_queries: []
                };
            }
        }
        return {
            intent: 'Other',
            frustration_level: 0,
            urgency: 'Low',
            style: 'Short',
            search_queries: []
        };
    }
    async getHistoryIntentFallback(senderId) {
        const session = await this.redis.get(`order_session:${senderId}`);
        if (session)
            return 'Ordering';
        return 'Other';
    }
};
exports.IntentRouterService = IntentRouterService;
exports.IntentRouterService = IntentRouterService = IntentRouterService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [redis_service_1.RedisService])
], IntentRouterService);
//# sourceMappingURL=intent-router.service.js.map