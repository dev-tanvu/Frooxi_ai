import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
export declare class MetaApiService {
    private configService;
    private httpService;
    private readonly logger;
    private readonly baseUrl;
    private readonly whatsappBaseUrl;
    constructor(configService: ConfigService, httpService: HttpService);
    sendMessage(pageId: string, recipientId: string, text: string, pageAccessToken: string): Promise<any>;
    sendMessageWithRetry(pageId: string, recipientId: string, text: string, pageAccessToken: string): Promise<any>;
    private logToFile;
    markSeen(pageId: string, recipientId: string, pageAccessToken: string): Promise<void>;
    typingOn(pageId: string, recipientId: string, pageAccessToken: string): Promise<void>;
    typingOff(pageId: string, recipientId: string, pageAccessToken: string): Promise<void>;
    sendImage(pageId: string, recipientId: string, imageUrl: string, pageAccessToken: string): Promise<any>;
    sendBatchImages(pageId: string, recipientId: string, imageUrls: string[], pageAccessToken: string): Promise<any>;
    getWhatsAppMediaUrl(mediaId: string, accessToken: string): Promise<string>;
    sendWhatsAppMessage(phoneNumberId: string, recipientPhone: string, text: string, whatsappAccessToken: string): Promise<any>;
    sendWhatsAppImage(phoneNumberId: string, recipientPhone: string, imageUrl: string, whatsappAccessToken: string): Promise<any>;
}
