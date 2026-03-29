import { Controller, Get, Post, Body, Req, Res, HttpStatus, Logger, InternalServerErrorException, UseGuards } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { MetaWebhookService } from './meta-webhook.service';
import { MetaSignatureGuard } from './meta-signature.guard';
import { ApiKeyGuard } from '../ai/api-key.guard';
import { EncryptionService } from '../common/encryption.service';

@Controller('webhook')
export class MetaWebhookController {
    private readonly logger = new Logger(MetaWebhookController.name);

    constructor(
        private readonly metaWebhookService: MetaWebhookService,
        private readonly prisma: PrismaService,
        private readonly encryptionService: EncryptionService,
        private readonly configService: ConfigService,
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
        this.logger.log('========================================');
        this.logger.log('📩 WEBHOOK RECEIVED');
        this.logger.log('========================================');
        this.logger.log(`Object Type: ${body.object}`);
        this.logger.log(`Full Payload:\n${JSON.stringify(body, null, 2)}`);
        this.logger.log('========================================');

        // Check if this is an event from a page subscription or WhatsApp Business
        if (body.object === 'page' || body.object === 'instagram' || body.object === 'whatsapp_business' || body.object === 'whatsapp_business_account') {

            // Iterate over each entry
            body.entry?.forEach((entry: any) => {
                const messaging = entry.messaging?.[0];
                const changes = entry.changes?.[0];

                if (messaging) {
                    this.logger.log(`👤 Platform: ${body.object === 'instagram' ? 'IG' : 'Messenger'} | Sender ID: ${messaging.sender?.id}`);
                    this.logger.log(`📄 Message Text: ${messaging.message?.text || '(no text)'}`);
                } else if (changes?.value?.messages?.[0]) {
                    const waMessage = changes.value.messages[0];
                    this.logger.log(`👤 Platform: WhatsApp | Sender: ${waMessage.from} | Type: ${waMessage.type}`);
                    this.logger.log(`📄 Message Text: ${waMessage.text?.body || '(no text)'}`);
                }

                // Pass the whole entry to the service handler (Non-blocking)
                // Attach object type so service knows the origin platform
                entry.objectType = body.object;
                this.metaWebhookService.handleWebhookEvent(entry).catch(err => {
                    this.logger.error(`🔥 Background Webhook Error: ${err.message}`, err.stack);
                });
            });

            // Returns a '200 OK' response immediately
            return res.status(HttpStatus.OK).send('EVENT_RECEIVED');
        } else {
            // Returns a '404 Not Found' if event is not from a page subscription
            return res.sendStatus(HttpStatus.NOT_FOUND);
        }
    }
}
