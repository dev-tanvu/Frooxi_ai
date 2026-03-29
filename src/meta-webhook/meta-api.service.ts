import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { lastValueFrom } from 'rxjs';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class MetaApiService {
    private readonly logger = new Logger(MetaApiService.name);
    private readonly baseUrl = 'https://graph.facebook.com/v25.0';
    private readonly whatsappBaseUrl = 'https://graph.facebook.com/v22.0';

    constructor(
        private configService: ConfigService,
        private httpService: HttpService,
    ) { }

    async sendMessage(pageId: string, recipientId: string, text: string, pageAccessToken: string) {
        const payload = {
            recipient: { id: recipientId },
            messaging_type: 'RESPONSE',
            message: { text },
        };
        try {
            this.logger.log(`📤 Sending message to ${recipientId}: "${text.substring(0, 50)}..."`);
            const url = `${this.baseUrl}/${pageId}/messages?access_token=${pageAccessToken}`;

            const response = await lastValueFrom(this.httpService.post(url, payload));
            this.logger.log(`✅ Message sent successfully.`);
            return response.data;
        } catch (error) {
            const errorMsg = error.response?.data?.error?.message || error.message;
            this.logger.error(`❌ Error sending message to Meta: ${errorMsg}`);
            this.logger.error(`Debug Info: PageId=${pageId}, RecipientId=${recipientId}`);
            throw error;
        }
    }

    async sendMessageWithRetry(pageId: string, recipientId: string, text: string, pageAccessToken: string) {
        // Implement simple 1-retry logic for robustness
        try {
            return await this.sendMessage(pageId, recipientId, text, pageAccessToken);
        } catch (error) {
            this.logger.warn(`⚠️ First attempt failed, retrying once...`);
            return await this.sendMessage(pageId, recipientId, text, pageAccessToken);
        }
    }

    private logToFile(msg: string) {
        // Disabled file logging to prevent unbounded log growth. Let NestJS logger handle output.
        // this.logger.debug(msg);
    }

    async markSeen(pageId: string, recipientId: string, pageAccessToken: string) {
        try {
            const url = `${this.baseUrl}/${pageId}/messages?access_token=${pageAccessToken}`;
            const payload = {
                recipient: { id: recipientId },
                sender_action: 'mark_seen',
            };
            await lastValueFrom(this.httpService.post(url, payload));
        } catch (error) {
            this.logger.error(`Error marking as seen: ${error.message}`);
        }
    }

    async typingOn(pageId: string, recipientId: string, pageAccessToken: string) {
        try {
            const url = `${this.baseUrl}/${pageId}/messages?access_token=${pageAccessToken}`;
            const payload = {
                recipient: { id: recipientId },
                sender_action: 'typing_on',
            };
            await lastValueFrom(this.httpService.post(url, payload));
        } catch (error) {
            this.logger.error(`Error starting typing: ${error.message}`);
        }
    }

    async typingOff(pageId: string, recipientId: string, pageAccessToken: string) {
        try {
            const url = `${this.baseUrl}/${pageId}/messages?access_token=${pageAccessToken}`;
            const payload = {
                recipient: { id: recipientId },
                sender_action: 'typing_off',
            };
            await lastValueFrom(this.httpService.post(url, payload));
        } catch (error) {
            this.logger.error(`Error stopping typing: ${error.message}`);
        }
    }

    async sendImage(pageId: string, recipientId: string, imageUrl: string, pageAccessToken: string) {
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
            const url = `${this.baseUrl}/${pageId}/messages?access_token=${pageAccessToken}`;

            const response = await lastValueFrom(this.httpService.post(url, payload));
            this.logger.log(`✅ Image sent successfully.`);
            this.logToFile(`SUCCESS: Image sent to ${recipientId}. URL: ${imageUrl}`);
            return response.data;
        } catch (error) {
            const errorMsg = error.response?.data?.error?.message || error.message;
            this.logger.error(`❌ Error sending image to Meta: ${errorMsg}`);
            this.logToFile(`ERROR: Image to ${recipientId} failed. Error: ${errorMsg}. URL: ${imageUrl}`);
            throw error;
        }
    }
    async sendBatchImages(pageId: string, recipientId: string, imageUrls: string[], pageAccessToken: string) {
        if (!imageUrls || imageUrls.length === 0) return;

        // Note: While Meta Send API docs often show singular 'attachment', 
        // using 'attachments' array as requested by user based on webhook observations.
        const payload = {
            recipient: { id: recipientId },
            messaging_type: 'RESPONSE',
            message: {
                attachments: imageUrls.map(url => ({
                    type: 'image',
                    payload: {
                        url: url,
                        is_reusable: true
                    }
                }))
            }
        };

        try {
            this.logger.log(`📤 Sending ${imageUrls.length} images in batch to ${recipientId}`);
            const url = `${this.baseUrl}/${pageId}/messages?access_token=${pageAccessToken}`;

            const response = await lastValueFrom(this.httpService.post(url, payload));
            this.logger.log(`✅ Batch images sent successfully.`);
            this.logToFile(`SUCCESS: Batch images sent to ${recipientId}. Count: ${imageUrls.length}`);
            return response.data;
        } catch (error) {
            const errorMsg = error.response?.data?.error?.message || error.message;
            this.logger.error(`❌ Error sending batch images to Meta: ${errorMsg}`);
            this.logToFile(`ERROR: Batch images to ${recipientId} failed. Error: ${errorMsg}`);
            
            // Fallback: If Meta rejects the batch format, we could theoretically fallback to sequential,
            // but for now we follow user's instruction to use this structure.
            throw error;
        }
    }

    // ======== WHATSAPP API METHODS ========

    async getWhatsAppMediaUrl(mediaId: string, accessToken: string): Promise<string> {
        try {
            const url = `${this.whatsappBaseUrl}/${mediaId}`;
            const response = await lastValueFrom(this.httpService.get(url, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            }));
            
            const mediaUrl = response.data?.url;
            if (!mediaUrl) throw new Error(`Could not resolve media URL for ID: ${mediaId}`);
            
            this.logger.log(`✅ Resolved WhatsApp media ID ${mediaId} to URL: ${mediaUrl.substring(0, 50)}...`);
            return mediaUrl;
        } catch (error) {
            const errorMsg = error.response?.data?.error?.message || error.message;
            this.logger.error(`❌ Error resolving WhatsApp media: ${errorMsg}`);
            throw error;
        }
    }

    async sendWhatsAppMessage(phoneNumberId: string, recipientPhone: string, text: string, whatsappAccessToken: string) {
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
            const response = await lastValueFrom(this.httpService.post(url, payload, {
                headers: {
                    'Authorization': `Bearer ${whatsappAccessToken}`,
                    'Content-Type': 'application/json'
                }
            }));
            this.logger.log(`✅ WhatsApp message sent successfully. ID: ${response.data.messages?.[0]?.id}`);
            return response.data;
        } catch (error) {
            const errorMsg = error.response?.data?.error?.message || error.message;
            this.logger.error(`❌ Error sending WhatsApp message: ${errorMsg}`);
            throw error;
        }
    }

    async sendWhatsAppImage(phoneNumberId: string, recipientPhone: string, imageUrl: string, whatsappAccessToken: string) {
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
            const response = await lastValueFrom(this.httpService.post(url, payload, {
                headers: {
                    'Authorization': `Bearer ${whatsappAccessToken}`,
                    'Content-Type': 'application/json'
                }
            }));
            this.logger.log(`✅ WhatsApp image sent successfully.`);
            return response.data;
        } catch (error) {
            const errorMsg = error.response?.data?.error?.message || error.message;
            this.logger.error(`❌ Error sending WhatsApp image: ${errorMsg}`);
            throw error;
        }
    }
}
