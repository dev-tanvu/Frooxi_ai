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
var WebhookNormalizerService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebhookNormalizerService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const meta_api_service_1 = require("./meta-api.service");
const redis_service_1 = require("../redis/redis.service");
let WebhookNormalizerService = WebhookNormalizerService_1 = class WebhookNormalizerService {
    configService;
    metaApi;
    redis;
    logger = new common_1.Logger(WebhookNormalizerService_1.name);
    appId;
    constructor(configService, metaApi, redis) {
        this.configService = configService;
        this.metaApi = metaApi;
        this.redis = redis;
        this.appId = this.configService.get('META_APP_ID') || '';
    }
    normalizeMessengerEvent(event) {
        const msg = event.messaging?.[0];
        if (!msg)
            return null;
        let type = 'MESSAGE';
        if (msg.read)
            type = 'READ';
        if (msg.postback)
            type = 'POSTBACK';
        if (msg.delivery)
            type = 'DELIVERY';
        if (msg.pass_thread_control || msg.take_thread_control)
            type = 'HANDOVER';
        if (msg.optin)
            type = 'OPTIN';
        if (msg.referral)
            type = 'REFERRAL';
        return {
            senderId: msg.sender?.id,
            recipientId: msg.recipient?.id,
            pageId: event.id,
            platform: event.objectType === 'instagram' ? 'INSTAGRAM' : 'MESSENGER',
            type,
            timestamp: msg.timestamp,
            message: msg.message ? {
                mid: msg.message.mid,
                text: msg.message.text,
                image: msg.message.attachments?.find((a) => a.type === 'image')?.payload?.url,
                audio: msg.message.attachments?.find((a) => a.type === 'audio')?.payload?.url,
                is_echo: msg.message.is_echo,
                app_id: msg.message.app_id,
                quick_reply: msg.message.quick_reply
            } : undefined,
            postback: msg.postback ? {
                payload: msg.postback.payload,
                title: msg.postback.title
            } : undefined,
            read: msg.read,
            handover: msg.pass_thread_control || msg.take_thread_control ? {
                new_owner_app_id: msg.pass_thread_control?.new_owner_app_id,
                previous_owner_app_id: msg.take_thread_control?.previous_owner_app_id,
                metadata: msg.pass_thread_control?.metadata || msg.take_thread_control?.metadata
            } : undefined,
            referral: msg.referral ? {
                ref: msg.referral.ref,
                source: msg.referral.source,
                type: msg.referral.type,
                ad_id: msg.referral.ad_id
            } : undefined
        };
    }
    async normalizeWhatsAppEvent(event) {
        const val = event.changes?.[0]?.value;
        const msg = val?.messages?.[0];
        if (!msg)
            return null;
        const pageId = val.metadata?.phone_number_id;
        const waToken = this.configService.get('WHATSAPP_ACCESS_TOKEN') || '';
        return {
            senderId: msg.from,
            recipientId: pageId,
            pageId,
            platform: 'WHATSAPP',
            type: 'MESSAGE',
            timestamp: msg.timestamp * 1000,
            message: {
                mid: msg.id,
                text: msg.text?.body || msg.image?.caption || '',
                image: msg.image?.url || (msg.image?.id ? await this.metaApi.getWhatsAppMediaUrl(msg.image.id, waToken) : ''),
                audio: msg.audio?.url || (msg.audio?.id ? await this.metaApi.getWhatsAppMediaUrl(msg.audio.id, waToken) : ''),
                is_echo: false
            }
        };
    }
    async processEcho(normalized) {
        const echoAppId = normalized.message.app_id?.toString();
        if (echoAppId === this.appId)
            return;
        await this.redis.set(`admin_pause:${normalized.senderId}`, '1', 1800);
        this.logger.log(`👨‍💼 Admin echo detected for ${normalized.senderId}. Pausing AI for 30m.`);
    }
};
exports.WebhookNormalizerService = WebhookNormalizerService;
exports.WebhookNormalizerService = WebhookNormalizerService = WebhookNormalizerService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService,
        meta_api_service_1.MetaApiService,
        redis_service_1.RedisService])
], WebhookNormalizerService);
//# sourceMappingURL=webhook-normalizer.service.js.map