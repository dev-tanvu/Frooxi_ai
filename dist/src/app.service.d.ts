import { PrismaService } from './prisma/prisma.service';
import { MetaWebhookService } from './meta-webhook/meta-webhook.service';
import { MetaApiService } from './meta-webhook/meta-api.service';
import { EncryptionService } from './common/encryption.service';
export declare class AppService {
    private prisma;
    private metaWebhook;
    private metaApi;
    private encryption;
    constructor(prisma: PrismaService, metaWebhook: MetaWebhookService, metaApi: MetaApiService, encryption: EncryptionService);
    getHello(): string;
    getStats(): Promise<{
        totalProducts: number;
        totalConversations: number;
        totalMessages: number;
        storeName: string;
        messageHistory: {
            date: string;
            messages: number;
        }[];
    }>;
    getRecentMessages(): Promise<({
        conversation: {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            customerId: string | null;
            metaIntegrationId: string;
            platform: import(".prisma/client").$Enums.Platform;
        };
    } & {
        id: string;
        createdAt: Date;
        sender: import(".prisma/client").$Enums.Sender;
        content: string;
        tokensUsed: number | null;
        conversationId: string;
    })[]>;
    getNotifications(): Promise<({
        customer: {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            name: string | null;
            metaIntegrationId: string;
            platformCustomerId: string;
            preferences: string | null;
            notes: string | null;
        };
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        customerId: string;
        message: string;
        type: string;
        read: boolean;
    })[]>;
    markNotificationRead(id: string): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        customerId: string;
        message: string;
        type: string;
        read: boolean;
    }>;
    pauseAi(customerId: string, durationMinutes?: number): Promise<{
        success: boolean;
    }>;
    resumeAi(customerId: string): Promise<{
        success: boolean;
    }>;
    sendAdminMessage(customerId: string, message: string): Promise<{
        success: boolean;
    }>;
}
