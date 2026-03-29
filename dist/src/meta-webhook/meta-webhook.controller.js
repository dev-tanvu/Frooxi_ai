"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var MetaWebhookController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MetaWebhookController = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const config_1 = require("@nestjs/config");
const meta_webhook_service_1 = require("./meta-webhook.service");
const meta_signature_guard_1 = require("./meta-signature.guard");
const api_key_guard_1 = require("../ai/api-key.guard");
const encryption_service_1 = require("../common/encryption.service");
let MetaWebhookController = MetaWebhookController_1 = class MetaWebhookController {
    metaWebhookService;
    prisma;
    encryptionService;
    configService;
    logger = new common_1.Logger(MetaWebhookController_1.name);
    constructor(metaWebhookService, prisma, encryptionService, configService) {
        this.metaWebhookService = metaWebhookService;
        this.prisma = prisma;
        this.encryptionService = encryptionService;
        this.configService = configService;
    }
    async setupIntegration(data) {
        try {
            let user = await this.prisma.user.findUnique({ where: { email: data.userEmail } });
            if (!user) {
                user = await this.prisma.user.create({
                    data: {
                        email: data.userEmail,
                        password: 'dev_password',
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
        }
        catch (error) {
            this.logger.error(`Setup Error: ${error.message}`, error.stack);
            throw new common_1.InternalServerErrorException(error.message);
        }
    }
    verifyWebhook(req, res) {
        const mode = req.query['hub.mode'];
        const token = req.query['hub.verify_token'];
        const challenge = req.query['hub.challenge'];
        const VERIFY_TOKEN = this.configService.get('META_VERIFY_TOKEN');
        if (!VERIFY_TOKEN) {
            this.logger.error('❌ META_VERIFY_TOKEN is missing! Webhook verification will fail.');
            return res.sendStatus(common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
        if (mode && token) {
            if (mode === 'subscribe' && token === VERIFY_TOKEN) {
                this.logger.log('WEBHOOK_VERIFIED');
                return res.status(common_1.HttpStatus.OK).send(challenge);
            }
            else {
                return res.sendStatus(common_1.HttpStatus.FORBIDDEN);
            }
        }
        return res.sendStatus(common_1.HttpStatus.BAD_REQUEST);
    }
    async handleIncomingMessage(req, res) {
        const body = req.body;
        this.logger.log('========================================');
        this.logger.log('📩 WEBHOOK RECEIVED');
        this.logger.log('========================================');
        this.logger.log(`Object Type: ${body.object}`);
        this.logger.log(`Full Payload:\n${JSON.stringify(body, null, 2)}`);
        this.logger.log('========================================');
        if (body.object === 'page' || body.object === 'instagram' || body.object === 'whatsapp_business' || body.object === 'whatsapp_business_account') {
            body.entry?.forEach((entry) => {
                const messaging = entry.messaging?.[0];
                const changes = entry.changes?.[0];
                if (messaging) {
                    this.logger.log(`👤 Platform: ${body.object === 'instagram' ? 'IG' : 'Messenger'} | Sender ID: ${messaging.sender?.id}`);
                    this.logger.log(`📄 Message Text: ${messaging.message?.text || '(no text)'}`);
                }
                else if (changes?.value?.messages?.[0]) {
                    const waMessage = changes.value.messages[0];
                    this.logger.log(`👤 Platform: WhatsApp | Sender: ${waMessage.from} | Type: ${waMessage.type}`);
                    this.logger.log(`📄 Message Text: ${waMessage.text?.body || '(no text)'}`);
                }
                entry.objectType = body.object;
                this.metaWebhookService.handleWebhookEvent(entry).catch(err => {
                    this.logger.error(`🔥 Background Webhook Error: ${err.message}`, err.stack);
                });
            });
            return res.status(common_1.HttpStatus.OK).send('EVENT_RECEIVED');
        }
        else {
            return res.sendStatus(common_1.HttpStatus.NOT_FOUND);
        }
    }
};
exports.MetaWebhookController = MetaWebhookController;
__decorate([
    (0, common_1.Post)('setup'),
    (0, common_1.UseGuards)(api_key_guard_1.ApiKeyGuard),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], MetaWebhookController.prototype, "setupIntegration", null);
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], MetaWebhookController.prototype, "verifyWebhook", null);
__decorate([
    (0, common_1.Post)(),
    (0, common_1.UseGuards)(meta_signature_guard_1.MetaSignatureGuard),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], MetaWebhookController.prototype, "handleIncomingMessage", null);
exports.MetaWebhookController = MetaWebhookController = MetaWebhookController_1 = __decorate([
    (0, common_1.Controller)('webhook'),
    __metadata("design:paramtypes", [meta_webhook_service_1.MetaWebhookService,
        prisma_service_1.PrismaService,
        encryption_service_1.EncryptionService,
        config_1.ConfigService])
], MetaWebhookController);
//# sourceMappingURL=meta-webhook.controller.js.map