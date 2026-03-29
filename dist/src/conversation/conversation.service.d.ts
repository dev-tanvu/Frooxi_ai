import { PrismaService } from '../prisma/prisma.service';
export declare class ConversationService {
    private prisma;
    constructor(prisma: PrismaService);
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
        customerId: string | null;
        metaIntegrationId: string;
        platform: import(".prisma/client").$Enums.Platform;
    })[]>;
    getConversationMessages(conversationId: string): Promise<{
        id: string;
        content: string;
        createdAt: Date;
        sender: import(".prisma/client").$Enums.Sender;
        tokensUsed: number | null;
        conversationId: string;
    }[]>;
}
