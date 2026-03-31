import { RedisService } from '../redis/redis.service';
import { MetaApiService } from './meta-api.service';
export declare class WebhookStateService {
    private redis;
    private metaApi;
    private readonly logger;
    private readonly MAX_CONCURRENT_TASKS;
    constructor(redis: RedisService, metaApi: MetaApiService);
    checkSpam(senderId: string): Promise<{
        blocked: boolean;
        message: string;
    } | {
        blocked: boolean;
        message?: undefined;
    }>;
    acquireAiSlot(senderId: string, pageId: string, token: string): Promise<void>;
    releaseAiSlot(senderId: string): Promise<void>;
    getAdminPause(senderId: string): Promise<boolean>;
}
