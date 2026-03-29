import { PrismaService } from '../prisma/prisma.service';
import { MetaApiService } from '../meta-webhook/meta-api.service';
import { EncryptionService } from '../common/encryption.service';
export declare class ProactiveService {
    private prisma;
    private metaApi;
    private encryption;
    private readonly logger;
    constructor(prisma: PrismaService, metaApi: MetaApiService, encryption: EncryptionService);
    handleAbandonedCarts(): Promise<void>;
    handlePostPurchaseFeedback(): Promise<void>;
}
