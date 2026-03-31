import { Controller, Get, Post, Body, Req, Res, HttpStatus, Logger, InternalServerErrorException, UseGuards } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { MetaWebhookService } from './meta-webhook.service';
import { MetaSignatureGuard } from './meta-signature.guard';
import { ApiKeyGuard } from '../ai/api-key.guard';
import { EncryptionService } from '../common/encryption.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { WebhookNormalizerService } from './webhook-normalizer.service';
import { RedisService } from '../redis/redis.service';

@Controller('webhook')
export class MetaWebhookController {
    private readonly logger = new Logger(MetaWebhookController.name);

    constructor(
        private readonly metaWebhookService: MetaWebhookService,
        private readonly prisma: PrismaService,
        private readonly encryptionService: EncryptionService,
        private readonly configService: ConfigService,
        private readonly normalizer: WebhookNormalizerService,
        private readonly redis: RedisService,
        @InjectQueue('webhook') private readonly webhookQueue: Queue,
    ) { }

    /**
     * Development Setup Endpoint
     * Use this to quickly register your Meta Page in the database for testing.
     */
    @Post('setup')
    @UseGuards(ApiKeyGuard)
    async setupIntegration(@Body() data: { pageId: string; pageAccessToken: string; userEmail: string }) {
        try {
            let user = await this.prisma.user.findUnique({ where: { email: data.userEmail } });

            if (!user) {
                user = await this.prisma.user.create({
                    data: {
                        email: data.userEmail,
                        password: 'dev_password', // Mock password for dev
                        name: 'Admin'
                    }
                });
            }

            const encryptedToken = this.encryptionService.encrypt(data.pageAccessToken);

            const integration = await this.prisma.metaIntegration.upsert({
                where: { pageId: data.pageId },
                update: { pageAccessToken: encryptedToken },
                create: {
                    pageId: data.pageId,
                    pageAccessToken: encryptedToken,
                    userId: user.id
                }
            });

            return { message: 'Setup successful', integrationId: integration.id };
        } catch (error) {
            this.logger.error(`Setup Error: ${error.message}`, error.stack);
            throw new InternalServerErrorException(error.message);
        }
    }

    @Get()
    verifyWebhook(@Req() req: Request, @Res() res: Response) {
        const mode = req.query['hub.mode'];
        const token = req.query['hub.verify_token'];
        const challenge = req.query['hub.challenge'];

        // In production, this should be in .env
        const VERIFY_TOKEN = this.configService.get<string>('META_VERIFY_TOKEN');

        if (!VERIFY_TOKEN) {
            this.logger.error('❌ META_VERIFY_TOKEN is missing! Webhook verification will fail.');
            return res.sendStatus(HttpStatus.INTERNAL_SERVER_ERROR);
        }

        if (mode && token) {
            if (mode === 'subscribe' && token === VERIFY_TOKEN) {
                this.logger.log('WEBHOOK_VERIFIED');
                return res.status(HttpStatus.OK).send(challenge);
            } else {
                return res.sendStatus(HttpStatus.FORBIDDEN);
            }
        }
        return res.sendStatus(HttpStatus.BAD_REQUEST);
    }

    @Post()
    @UseGuards(MetaSignatureGuard)
    async handleIncomingMessage(@Req() req: Request, @Res() res: Response) {
        const body = req.body;

        // ====== WEBHOOK DEBUG LOG ======
        this.logger.log('📩 WEBHOOK RECEIVED');
        this.logger.log(`Object Type: ${body.object}`);

        // Check if this is an event from a page subscription or WhatsApp Business
        if (body.object === 'page' || body.object === 'instagram' || body.object === 'whatsapp_business' || body.object === 'whatsapp_business_account') {

            // Iterate over each entry
            for (const entry of body.entry || []) {
                // Attach object type so service knows the origin platform
                entry.objectType = body.object;
                
                const normalized = (entry.objectType === 'whatsapp_business' || entry.objectType === 'whatsapp_business_account')
                    ? await this.normalizer.normalizeWhatsAppEvent(entry)
                    : this.normalizer.normalizeMessengerEvent(entry);

                if (normalized) {
                    const { senderId, pageId, platform, type } = normalized;
                    this.logger.log(`📥 Queuing ${type} from ${senderId} for Page ${pageId} (${platform})`);
                    
                    // 🧠 ORCHESTRATOR: Push message data to the burst buffer
                    await this.redis.pushToBuffer(senderId, normalized);

                    // Add a lightweight trigger job — the processor will drain the buffer
                    await this.webhookQueue.add('meta-event', {
                        senderId,
                        pageId,
                        platform,
                        type,
                        triggerTimestamp: Date.now(),
                    }, {
                        jobId: normalized.message?.mid || `${senderId}-${Date.now()}`,
                        attempts: 3,
                        backoff: { type: 'exponential', delay: 1000 }
                    }).catch(err => {
                        this.logger.error(`❌ Failed to queue webhook: ${err.message}`);
                    });
                }
            }

            // Returns a '200 OK' response immediately
            return res.status(HttpStatus.OK).send('EVENT_RECEIVED');
        } else {
            return res.sendStatus(HttpStatus.NOT_FOUND);
        }
    }
}
