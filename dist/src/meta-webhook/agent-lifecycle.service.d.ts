import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { MetaApiService } from './meta-api.service';
import { EncryptionService } from '../common/encryption.service';
import { WebhookStateService } from './webhook-state.service';
export declare class AgentLifecycleService {
    private prisma;
    private redis;
    private metaApi;
    private encryption;
    private state;
    private readonly logger;
    constructor(prisma: PrismaService, redis: RedisService, metaApi: MetaApiService, encryption: EncryptionService, state: WebhookStateService);
    getOrCreateContext(pageId: string, senderId: string, platform: any): Promise<any>;
    getTokenOnly(pageId: string): Promise<string | null>;
    persistMessage(conversationId: string, sender: 'USER' | 'AGENT', content: string): Promise<void>;
    sendOptimizedResponse(pageId: string, senderId: string, text: string, token: string, conversationId: string, platform: any): Promise<void>;
    startTypingHeartbeat(pageId: string, senderId: string, token: string): void;
    stopTypingHeartbeat(pageId: string, senderId: string, token: string): void;
    isAgentActive(name: string): Promise<boolean>;
    getAgentUnavailableMessage(name: string, customerName: string): Promise<string>;
    executeAgentLifecycle(agentName: string, senderId: string, pageId: string, platform: any, messageText: string, logicFn: (ctx: {
        token: string;
        customer: any;
        conversation: any;
    }) => Promise<void>): Promise<void>;
}
