import { OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MetaApiService } from '../meta-webhook/meta-api.service';
import { EncryptionService } from '../common/encryption.service';
import { Queue } from 'bullmq';
export declare class ProactiveService implements OnModuleInit {
    private prisma;
    private metaApi;
    private encryption;
    private proactiveQueue;
    private readonly logger;
    constructor(prisma: PrismaService, metaApi: MetaApiService, encryption: EncryptionService, proactiveQueue: Queue);
    onModuleInit(): Promise<void>;
    handleAbandonedCarts(): Promise<void>;
    handlePostPurchaseFeedback(): Promise<void>;
}
