import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { MetaWebhookService } from './meta-webhook.service';
import { EncryptionService } from '../common/encryption.service';
export declare class MetaWebhookController {
    private readonly metaWebhookService;
    private readonly prisma;
    private readonly encryptionService;
    private readonly configService;
    private readonly logger;
    constructor(metaWebhookService: MetaWebhookService, prisma: PrismaService, encryptionService: EncryptionService, configService: ConfigService);
    setupIntegration(data: {
        pageId: string;
        pageAccessToken: string;
        userEmail: string;
    }): Promise<{
        message: string;
        integrationId: string;
    }>;
    verifyWebhook(req: Request, res: Response): Response<any, Record<string, any>>;
    handleIncomingMessage(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
}
