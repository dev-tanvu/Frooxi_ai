import { CustomerService } from './customer.service';
export declare class CustomerController {
    private readonly customerService;
    constructor(customerService: CustomerService);
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
            customerId: string | null;
            metaIntegrationId: string;
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
    }>;
}
