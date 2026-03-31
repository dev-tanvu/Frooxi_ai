import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MetaApiService } from './meta-api.service';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class WebhookNormalizerService {
    private readonly logger = new Logger(WebhookNormalizerService.name);
    private readonly appId: string;

    constructor(
        private configService: ConfigService,
        private metaApi: MetaApiService,
        private redis: RedisService,
    ) {
        this.appId = this.configService.get<string>('META_APP_ID') || '';
    }

    normalizeMessengerEvent(event: any) {
        const msg = event.messaging?.[0];
        if (!msg) return null;

        // Determine event type
        let type = 'MESSAGE';
        if (msg.read) type = 'READ';
        if (msg.postback) type = 'POSTBACK';
        if (msg.delivery) type = 'DELIVERY';
        if (msg.pass_thread_control || msg.take_thread_control) type = 'HANDOVER';
        if (msg.optin) type = 'OPTIN';
        if (msg.referral) type = 'REFERRAL';

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
                image: msg.message.attachments?.find((a: any) => a.type === 'image')?.payload?.url,
                audio: msg.message.attachments?.find((a: any) => a.type === 'audio')?.payload?.url,
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

    async normalizeWhatsAppEvent(event: any) {
        const val = event.changes?.[0]?.value;
        const msg = val?.messages?.[0];
        if (!msg) return null;
        
        const pageId = val.metadata?.phone_number_id;
        const waToken = this.configService.get<string>('WHATSAPP_ACCESS_TOKEN') || '';

        return {
            senderId: msg.from,
            recipientId: pageId,
            pageId,
            platform: 'WHATSAPP',
            type: 'MESSAGE',
            timestamp: msg.timestamp * 1000, // WhatsApp is in seconds
            message: {
                mid: msg.id,
                text: msg.text?.body || msg.image?.caption || '',
                image: msg.image?.url || (msg.image?.id ? await this.metaApi.getWhatsAppMediaUrl(msg.image.id, waToken) : ''),
                audio: msg.audio?.url || (msg.audio?.id ? await this.metaApi.getWhatsAppMediaUrl(msg.audio.id, waToken) : ''),
                is_echo: false
            }
        };
    }

    async processEcho(normalized: any) {
        const echoAppId = normalized.message.app_id?.toString();
        if (echoAppId === this.appId) return;

        await this.redis.set(`admin_pause:${normalized.senderId}`, '1', 1800);
        this.logger.log(`👨‍💼 Admin echo detected for ${normalized.senderId}. Pausing AI for 30m.`);
    }
}
