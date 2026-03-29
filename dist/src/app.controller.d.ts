import { AppService } from './app.service';
export declare class AppController {
    private readonly appService;
    constructor(appService: AppService);
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
    pauseAi(body: {
        customerId: string;
        durationMinutes?: number;
    }): Promise<{
        success: boolean;
    }>;
    resumeAi(body: {
        customerId: string;
    }): Promise<{
        success: boolean;
    }>;
    sendAdminMessage(body: {
        customerId: string;
        message: string;
    }): Promise<{
        success: boolean;
    }>;
}
