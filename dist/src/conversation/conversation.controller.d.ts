import { ConversationService } from './conversation.service';
export declare class ConversationController {
    private conversationService;
    constructor(conversationService: ConversationService);
    getCustomerConversations(customerId: string): Promise<({
        messages: {
            id: string;
            content: string;
            createdAt: Date;
            sender: import(".prisma/client").$Enums.Sender;
            tokensUsed: number | null;
            conversationId: string;
        }[];
    } & {
        id: string;
        updatedAt: Date;
        createdAt: Date;
        metaIntegrationId: string;
        customerId: string | null;
        platform: import(".prisma/client").$Enums.Platform;
    })[]>;
    getMessages(conversationId: string): Promise<{
        id: string;
        content: string;
        createdAt: Date;
        sender: import(".prisma/client").$Enums.Sender;
        tokensUsed: number | null;
        conversationId: string;
    }[]>;
}
