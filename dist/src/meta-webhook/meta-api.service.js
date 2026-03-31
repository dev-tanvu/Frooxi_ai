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
var MetaApiService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MetaApiService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const axios_1 = require("@nestjs/axios");
const rxjs_1 = require("rxjs");
let MetaApiService = MetaApiService_1 = class MetaApiService {
    configService;
    httpService;
    logger = new common_1.Logger(MetaApiService_1.name);
    baseUrl = 'https://graph.facebook.com/v25.0';
    whatsappBaseUrl = 'https://graph.facebook.com/v22.0';
    constructor(configService, httpService) {
        this.configService = configService;
        this.httpService = httpService;
    }
    async sendMessage(pageId, recipientId, text, pageAccessToken) {
        const payload = {
            recipient: { id: recipientId },
            messaging_type: 'RESPONSE',
            message: { text },
        };
        try {
            this.logger.log(`📤 Sending message to ${recipientId}: "${text.substring(0, 50)}..."`);
            const url = `${this.baseUrl}/${pageId}/messages`;
            const response = await (0, rxjs_1.lastValueFrom)(this.httpService.post(url, payload, {
                headers: { 'Authorization': `Bearer ${pageAccessToken}` }
            }));
            this.logger.log(`✅ Message sent successfully.`);
            return response.data;
        }
        catch (error) {
            const errorMsg = error.response?.data?.error?.message || error.message;
            this.logger.error(`❌ Error sending message to Meta: ${errorMsg}`);
            this.logger.error(`Debug Info: PageId=${pageId}, RecipientId=${recipientId}`);
            throw error;
        }
    }
    async sendMessageWithRetry(pageId, recipientId, text, pageAccessToken) {
        try {
            return await this.sendMessage(pageId, recipientId, text, pageAccessToken);
        }
        catch (error) {
            this.logger.warn(`⚠️ First attempt failed, retrying once...`);
            return await this.sendMessage(pageId, recipientId, text, pageAccessToken);
        }
    }
    logToFile(msg) {
    }
    async markSeen(pageId, recipientId, pageAccessToken) {
        try {
            const url = `${this.baseUrl}/${pageId}/messages`;
            const payload = {
                recipient: { id: recipientId },
                sender_action: 'mark_seen',
            };
            await (0, rxjs_1.lastValueFrom)(this.httpService.post(url, payload, {
                headers: { 'Authorization': `Bearer ${pageAccessToken}` }
            }));
        }
        catch (error) {
            this.logger.error(`Error marking as seen: ${error.message}`);
        }
    }
    async typingOn(pageId, recipientId, pageAccessToken) {
        try {
            const url = `${this.baseUrl}/${pageId}/messages`;
            const payload = {
                recipient: { id: recipientId },
                sender_action: 'typing_on',
            };
            await (0, rxjs_1.lastValueFrom)(this.httpService.post(url, payload, {
                headers: { 'Authorization': `Bearer ${pageAccessToken}` }
            }));
        }
        catch (error) {
            this.logger.error(`Error starting typing: ${error.message}`);
        }
    }
    async typingOff(pageId, recipientId, pageAccessToken) {
        try {
            const url = `${this.baseUrl}/${pageId}/messages`;
            const payload = {
                recipient: { id: recipientId },
                sender_action: 'typing_off',
            };
            await (0, rxjs_1.lastValueFrom)(this.httpService.post(url, payload, {
                headers: { 'Authorization': `Bearer ${pageAccessToken}` }
            }));
        }
        catch (error) {
            this.logger.error(`Error stopping typing: ${error.message}`);
        }
    }
    async sendImage(pageId, recipientId, imageUrl, pageAccessToken) {
        const payload = {
            recipient: { id: recipientId },
            messaging_type: 'RESPONSE',
            message: {
                attachment: {
                    type: 'image',
                    payload: {
                        url: imageUrl,
                        is_reusable: true
                    }
                }
            }
        };
        try {
            this.logger.log(`📤 Sending image to ${recipientId}: ${imageUrl}`);
            const url = `${this.baseUrl}/${pageId}/messages`;
            const response = await (0, rxjs_1.lastValueFrom)(this.httpService.post(url, payload, {
                headers: { 'Authorization': `Bearer ${pageAccessToken}` }
            }));
            this.logger.log(`✅ Image sent successfully.`);
            this.logToFile(`SUCCESS: Image sent to ${recipientId}. URL: ${imageUrl}`);
            return response.data;
        }
        catch (error) {
            const errorMsg = error.response?.data?.error?.message || error.message;
            this.logger.error(`❌ Error sending image to Meta: ${errorMsg}`);
            this.logToFile(`ERROR: Image to ${recipientId} failed. Error: ${errorMsg}. URL: ${imageUrl}`);
            throw error;
        }
    }
    async sendBatchImages(pageId, recipientId, imageUrls, pageAccessToken) {
        if (!imageUrls || imageUrls.length === 0)
            return;
        if (imageUrls.length === 1) {
            return this.sendImage(pageId, recipientId, imageUrls[0], pageAccessToken);
        }
        const payload = {
            recipient: { id: recipientId },
            messaging_type: 'RESPONSE',
            message: {
                attachment: {
                    type: 'template',
                    payload: {
                        template_type: 'generic',
                        elements: imageUrls.slice(0, 10).map((url, index) => ({
                            title: `Product Image ${index + 1}`,
                            image_url: url,
                            subtitle: 'Explore our collection',
                            default_action: {
                                type: "web_url",
                                url: "https://frooxi.com",
                                webview_height_ratio: "tall",
                            },
                            buttons: [
                                {
                                    type: "web_url",
                                    url: "https://frooxi.com",
                                    title: "View on Store"
                                },
                                {
                                    type: "web_url",
                                    url: url,
                                    title: "View Full Image"
                                }
                            ]
                        }))
                    }
                }
            }
        };
        try {
            this.logger.log(`📤 Sending ${imageUrls.length} images in a Carousel to ${recipientId}`);
            const url = `${this.baseUrl}/${pageId}/messages`;
            const response = await (0, rxjs_1.lastValueFrom)(this.httpService.post(url, payload, {
                headers: { 'Authorization': `Bearer ${pageAccessToken}` }
            }));
            this.logger.log(`✅ Carousel images sent successfully.`);
            return response.data;
        }
        catch (error) {
            const errorMsg = error.response?.data?.error?.message || error.message;
            this.logger.error(`❌ Error sending Carousel images: ${errorMsg}`);
            this.logger.warn(`⚠️ Carousel failed, falling back to sequential sending...`);
            for (const url of imageUrls) {
                await this.sendImage(pageId, recipientId, url, pageAccessToken).catch(() => { });
            }
        }
    }
    async getWhatsAppMediaUrl(mediaId, accessToken) {
        try {
            const url = `${this.whatsappBaseUrl}/${mediaId}`;
            const response = await (0, rxjs_1.lastValueFrom)(this.httpService.get(url, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            }));
            const mediaUrl = response.data?.url;
            if (!mediaUrl)
                throw new Error(`Could not resolve media URL for ID: ${mediaId}`);
            this.logger.log(`✅ Resolved WhatsApp media ID ${mediaId} to URL: ${mediaUrl.substring(0, 50)}...`);
            return mediaUrl;
        }
        catch (error) {
            const errorMsg = error.response?.data?.error?.message || error.message;
            this.logger.error(`❌ Error resolving WhatsApp media: ${errorMsg}`);
            throw error;
        }
    }
    async sendWhatsAppMessage(phoneNumberId, recipientPhone, text, whatsappAccessToken) {
        const url = `${this.whatsappBaseUrl}/${phoneNumberId}/messages`;
        const payload = {
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: recipientPhone,
            type: "text",
            text: { body: text }
        };
        try {
            this.logger.log(`📤 Sending WhatsApp message to ${recipientPhone}: "${text.substring(0, 50)}..."`);
            const response = await (0, rxjs_1.lastValueFrom)(this.httpService.post(url, payload, {
                headers: {
                    'Authorization': `Bearer ${whatsappAccessToken}`,
                    'Content-Type': 'application/json'
                }
            }));
            this.logger.log(`✅ WhatsApp message sent successfully. ID: ${response.data.messages?.[0]?.id}`);
            return response.data;
        }
        catch (error) {
            const errorMsg = error.response?.data?.error?.message || error.message;
            this.logger.error(`❌ Error sending WhatsApp message: ${errorMsg}`);
            throw error;
        }
    }
    async sendWhatsAppImage(phoneNumberId, recipientPhone, imageUrl, whatsappAccessToken) {
        const url = `${this.whatsappBaseUrl}/${phoneNumberId}/messages`;
        const payload = {
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: recipientPhone,
            type: "image",
            image: { url: imageUrl }
        };
        try {
            this.logger.log(`📤 Sending WhatsApp image to ${recipientPhone}: ${imageUrl}`);
            const response = await (0, rxjs_1.lastValueFrom)(this.httpService.post(url, payload, {
                headers: {
                    'Authorization': `Bearer ${whatsappAccessToken}`,
                    'Content-Type': 'application/json'
                }
            }));
            this.logger.log(`✅ WhatsApp image sent successfully.`);
            return response.data;
        }
        catch (error) {
            const errorMsg = error.response?.data?.error?.message || error.message;
            this.logger.error(`❌ Error sending WhatsApp image: ${errorMsg}`);
            throw error;
        }
    }
};
exports.MetaApiService = MetaApiService;
exports.MetaApiService = MetaApiService = MetaApiService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService,
        axios_1.HttpService])
], MetaApiService);
//# sourceMappingURL=meta-api.service.js.map