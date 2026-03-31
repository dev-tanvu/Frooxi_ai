import { RedisService } from '../redis/redis.service';
import { EmotionState } from '../ai/gemini.service';
export declare class IntentRouterService {
    private redis;
    private readonly logger;
    constructor(redis: RedisService);
    detectIntentFastPath(text: string, history: string[]): EmotionState;
    getHistoryIntentFallback(senderId: string): Promise<EmotionState['intent']>;
}
