import { PrismaService } from '../prisma/prisma.service';
export declare class CustomerService {
    private prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    findAll(): Promise<({
        conversations: {
            id: string;
            updatedAt: Date;
            _count: {
                messages: number;
            };
            platform: import(".prisma/client").$Enums.Platform;
        }[];
    } & {
        id: string;
        updatedAt: Date;
        name: string | null;
        createdAt: Date;
        metaIntegrationId: string;
        platformCustomerId: string;
        preferences: string | null;
        notes: string | null;
        lastReadAt: Date | null;
        isOptedOut: boolean;
    })[]>;
    findOne(id: string): Promise<({
        conversations: ({
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
        })[];
    } & {
        id: string;
        updatedAt: Date;
        name: string | null;
        createdAt: Date;
        metaIntegrationId: string;
        platformCustomerId: string;
        preferences: string | null;
        notes: string | null;
        lastReadAt: Date | null;
        isOptedOut: boolean;
    }) | null>;
    update(id: string, data: any): Promise<{
        id: string;
        updatedAt: Date;
        name: string | null;
        createdAt: Date;
        metaIntegrationId: string;
        platformCustomerId: string;
        preferences: string | null;
        notes: string | null;
        lastReadAt: Date | null;
        isOptedOut: boolean;
    }>;
}
