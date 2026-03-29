import { OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
export declare class StoreService implements OnModuleInit {
    private prisma;
    private readonly logger;
    private configCache;
    private configCacheExpiry;
    private rulesCache;
    private rulesCacheExpiry;
    private readonly CACHE_TTL;
    constructor(prisma: PrismaService);
    onModuleInit(): Promise<void>;
    ensureConfigExists(): Promise<void>;
    getConfig(): Promise<any>;
    updateConfig(data: any): Promise<{
        currency: string;
        id: string;
        storeName: string;
        businessDetails: string | null;
        updatedAt: Date;
    }>;
    findAllRules(): Promise<{
        id: string;
        updatedAt: Date;
        title: string;
        content: string;
        category: string;
        active: boolean;
        createdAt: Date;
    }[]>;
    findActiveRules(): Promise<any>;
    createRule(data: any): Promise<{
        id: string;
        updatedAt: Date;
        title: string;
        content: string;
        category: string;
        active: boolean;
        createdAt: Date;
    }>;
    updateRule(id: string, data: any): Promise<{
        id: string;
        updatedAt: Date;
        title: string;
        content: string;
        category: string;
        active: boolean;
        createdAt: Date;
    }>;
    deleteRule(id: string): Promise<{
        id: string;
        updatedAt: Date;
        title: string;
        content: string;
        category: string;
        active: boolean;
        createdAt: Date;
    }>;
}
