import { ConfigService } from '@nestjs/config';
import { MetaApiService } from './meta-api.service';
import { RedisService } from '../redis/redis.service';
export declare class WebhookNormalizerService {
    private configService;
    private metaApi;
    private redis;
    private readonly logger;
    private readonly appId;
    constructor(configService: ConfigService, metaApi: MetaApiService, redis: RedisService);
    normalizeMessengerEvent(event: any): {
        senderId: any;
        recipientId: any;
        pageId: any;
        platform: string;
        type: string;
        timestamp: any;
        message: {
            mid: any;
            text: any;
            image: any;
            audio: any;
            is_echo: any;
            app_id: any;
            quick_reply: any;
        } | undefined;
        postback: {
            payload: any;
            title: any;
        } | undefined;
        read: any;
        handover: {
            new_owner_app_id: any;
            previous_owner_app_id: any;
            metadata: any;
        } | undefined;
        referral: {
            ref: any;
            source: any;
            type: any;
            ad_id: any;
        } | undefined;
    } | null;
    normalizeWhatsAppEvent(event: any): Promise<{
        senderId: any;
        recipientId: any;
        pageId: any;
        platform: string;
        type: string;
        timestamp: number;
        message: {
            mid: any;
            text: any;
            image: any;
            audio: any;
            is_echo: boolean;
        };
    } | null>;
    processEcho(normalized: any): Promise<void>;
}
