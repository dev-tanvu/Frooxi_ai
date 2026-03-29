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
var MetaWebhookService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MetaWebhookService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const prisma_service_1 = require("../prisma/prisma.service");
const gemini_service_1 = require("../ai/gemini.service");
const meta_api_service_1 = require("./meta-api.service");
const redis_service_1 = require("../redis/redis.service");
const pinecone_service_1 = require("../ai/pinecone.service");
const axios_1 = require("@nestjs/axios");
const rxjs_1 = require("rxjs");
const product_service_1 = require("../product/product.service");
const order_service_1 = require("../order/order.service");
const customer_service_1 = require("../customer/customer.service");
const faq_service_1 = require("../faq/faq.service");
const ai_agent_service_1 = require("../ai-agent/ai-agent.service");
const settings_service_1 = require("../settings/settings.service");
const encryption_service_1 = require("../common/encryption.service");
let MetaWebhookService = MetaWebhookService_1 = class MetaWebhookService {
    configService;
    prisma;
    gemini;
    metaApi;
    redis;
    pinecone;
    httpService;
    productService;
    orderService;
    customerService;
    faqService;
    aiAgentService;
    settingsService;
    encryption;
    logger = new common_1.Logger(MetaWebhookService_1.name);
    appId;
    aiAgentTableMissingWarned = false;
    adminOverrides = new Map();
    OVERRIDE_DURATION = 30 * 60 * 1000;
    typingHeartbeats = new Map();
    lastUserMessageTimestamp = new Map();
    CONFIDENCE_THRESHOLD = 0.75;
    activeAiTasks = 0;
    MAX_CONCURRENT_TASKS = 50;
    MAX_QUEUE_SIZE = 200;
    waitingQueue = [];
    pauseAiForCustomer(customerId, durationMinutes = 30) {
        this.adminOverrides.set(customerId, Date.now() + durationMinutes * 60 * 1000);
        this.logger.log(`🛑 AI paused for customer ${customerId} via Admin API for ${durationMinutes} mins`);
    }
    resumeAiForCustomer(customerId) {
        this.adminOverrides.delete(customerId);
        this.logger.log(`▶️ AI resumed for customer ${customerId} via Admin API`);
    }
    constructor(configService, prisma, gemini, metaApi, redis, pinecone, httpService, productService, orderService, customerService, faqService, aiAgentService, settingsService, encryption) {
        this.configService = configService;
        this.prisma = prisma;
        this.gemini = gemini;
        this.metaApi = metaApi;
        this.redis = redis;
        this.pinecone = pinecone;
        this.httpService = httpService;
        this.productService = productService;
        this.orderService = orderService;
        this.customerService = customerService;
        this.faqService = faqService;
        this.aiAgentService = aiAgentService;
        this.settingsService = settingsService;
        this.encryption = encryption;
        this.appId = this.configService.get('META_APP_ID') || '';
    }
    async acquireAiSlot(senderId, pageId, pageAccessToken) {
        if (this.activeAiTasks < this.MAX_CONCURRENT_TASKS) {
            this.activeAiTasks++;
            this.logger.log(`🚦 Slot acquired by ${senderId}. Active tasks: ${this.activeAiTasks}/${this.MAX_CONCURRENT_TASKS}`);
            return Promise.resolve();
        }
        if (this.waitingQueue.length >= this.MAX_QUEUE_SIZE) {
            this.logger.error(`🚨 CONCURRENCY QUEUE FULL! Rejecting ${senderId}.`);
            throw new Error('SYSTEM_OVERLOAD');
        }
        this.logger.warn(`⏳ Slots full. Queueing ${senderId} (Position: ${this.waitingQueue.length + 1})`);
        const queueMsg = "We're experiencing unusually high traffic! You're in a short queue, I'll reply in just a moment... ⏳";
        this.metaApi.sendMessage(pageId, senderId, queueMsg, pageAccessToken).catch(() => { });
        return new Promise((resolve) => {
            this.waitingQueue.push({ resolve, senderId });
        });
    }
    releaseAiSlot(senderId) {
        if (this.waitingQueue.length > 0) {
            const next = this.waitingQueue.shift();
            if (next) {
                this.logger.log(`🚦 Slot transferred from ${senderId} to ${next.senderId}. Queue remaining: ${this.waitingQueue.length}`);
                next.resolve();
            }
        }
        else {
            this.activeAiTasks = Math.max(0, this.activeAiTasks - 1);
            this.logger.log(`🚦 Slot released by ${senderId}. Active tasks: ${this.activeAiTasks}/${this.MAX_CONCURRENT_TASKS}`);
        }
    }
    async handleWebhookEvent(event) {
        const objectType = event.objectType || 'page';
        let normalized;
        if (objectType === 'whatsapp_business' || objectType === 'whatsapp_business_account') {
            normalized = await this.normalizeWhatsAppEvent(event);
        }
        else {
            normalized = this.normalizeMessengerEvent(event);
        }
        if (!normalized)
            return;
        const { senderId, pageId, message, platform } = normalized;
        const requestStartTime = Date.now();
        if (message.is_echo) {
            if (platform === 'WHATSAPP')
                return;
            const echoAppId = message.app_id?.toString();
            if (echoAppId === this.appId)
                return;
            return this.processEcho(event.messaging[0], pageId);
        }
        const envWaid = this.configService.get('WHATSAPP_PHONE_NUMBER_ID') || '';
        const envToken = this.configService.get('WHATSAPP_ACCESS_TOKEN');
        let token = null;
        if (platform === 'WHATSAPP' && (pageId === envWaid || !pageId) && envToken) {
            token = envToken;
        }
        else {
            const integration = await this.prisma.metaIntegration.findUnique({ where: { pageId } }).catch(() => null);
            token = integration ? this.encryption.decrypt(integration.pageAccessToken) : null;
        }
        const spamResult = await this.checkSpam(senderId);
        if (token && (platform === 'MESSENGER' || platform === 'INSTAGRAM')) {
            this.metaApi.markSeen(pageId, senderId, token).catch(() => { });
            this.startTypingHeartbeat(pageId, senderId, token);
        }
        if (spamResult.blocked) {
            this.logger.warn(`🚫 SPAM BLOCKED [${platform}]: ${senderId}`);
            if (token) {
                this.stopTypingHeartbeat(senderId);
                await this.sendDirectPlatformResponse(platform, pageId, senderId, spamResult.message, token);
            }
            return;
        }
        const lockTime = this.adminOverrides.get(senderId);
        if (lockTime && Date.now() < lockTime) {
            this.stopTypingHeartbeat(senderId);
            return;
        }
        const hasImage = !!message.image;
        const hasAudio = !!message.audio;
        const messageText = message.text || '';
        const lastTimestamp = this.lastUserMessageTimestamp.get(senderId) || 0;
        const timeSinceLastMessage = requestStartTime - lastTimestamp;
        const FRESH_CONVERSATION_THRESHOLD = 1 * 60 * 60 * 1000;
        const isFreshConversation = timeSinceLastMessage > FRESH_CONVERSATION_THRESHOLD;
        this.lastUserMessageTimestamp.set(senderId, requestStartTime);
        if (isFreshConversation) {
            this.logger.log(`🆕 Fresh conversation detected for ${senderId} (${Math.round(timeSinceLastMessage / 60000)}m gap). Clearing stale context.`);
            await this.redis.del(`order_session:${senderId}`).catch(() => { });
        }
        let intent = 'Other';
        if (!hasImage && !hasAudio && messageText) {
            const history = await this.redis.getHistory(senderId, 2);
            const fastIntent = this.detectIntentFastPath(messageText, history);
            intent = fastIntent.intent;
            if (intent === 'Other') {
                const orderSession = await this.redis.get(`order_session:${senderId}`);
                if (orderSession) {
                    intent = 'Ordering';
                    this.logger.log(`📦 Active order session found for ${senderId}. Routing to Order Agent.`);
                }
            }
        }
        this.logger.log(`🧠 HEAD AGENT DECISION [${platform}]: senderId=${senderId} | intent=${intent} | hasImage=${hasImage} | hasAudio=${hasAudio} | fresh=${isFreshConversation}`);
        const mockMessaging = { sender: { id: senderId } };
        if ((intent === 'Buying' || intent === 'Ordering') && !hasImage && !hasAudio) {
            const orderAgentActive = await this.isAgentActive('Order Agent');
            if (!orderAgentActive) {
                this.logger.warn(`⚠️ Order Agent is OFF. Falling back to Text Agent for ${senderId}.`);
            }
            else {
                this.logger.log(`📦 ROUTING → Order Agent for ${senderId}`);
                this.processOrderAgent(mockMessaging, pageId, platform, messageText).catch(err => {
                    this.logger.error(`❌ Order Agent Error: ${err.message}`);
                });
                return;
            }
        }
        if (hasImage) {
            const visualActive = await this.isAgentActive('Visual Agent');
            if (!visualActive) {
                if (token) {
                    const { customer, conversation } = await this.getOrCreateContext(pageId, senderId, platform);
                    const unavailableMsg = await this.getAgentUnavailableMessage('Visual Agent', customer.name || undefined);
                    this.stopTypingHeartbeat(senderId);
                    await this.sendOptimizedResponse(pageId, senderId, unavailableMsg, token, conversation.id, platform);
                }
                return;
            }
            const systemMessages = await this.aiAgentService.getSystemPredefinedMessages();
            if (token) {
                await this.sendDirectPlatformResponse(platform, pageId, senderId, systemMessages.imageReceivedMessage, token);
            }
            this.logger.log(`🖼️ ROUTING → Visual Agent for ${senderId}`);
            this.processVisualAgent(mockMessaging, [message.image], pageId, messageText, platform, requestStartTime).catch(err => {
                this.logger.error(`❌ Visual Agent Error: ${err.message}`);
            });
            return;
        }
        if (hasAudio) {
            const voiceActive = await this.isAgentActive('Voice Agent');
            if (!voiceActive) {
                if (token) {
                    const { customer, conversation } = await this.getOrCreateContext(pageId, senderId, platform);
                    const unavailableMsg = await this.getAgentUnavailableMessage('Voice Agent', customer.name || undefined);
                    this.stopTypingHeartbeat(senderId);
                    await this.sendOptimizedResponse(pageId, senderId, unavailableMsg, token, conversation.id, platform);
                }
                return;
            }
            const systemMessages = await this.aiAgentService.getSystemPredefinedMessages();
            if (token) {
                await this.sendDirectPlatformResponse(platform, pageId, senderId, systemMessages.voiceReceivedMessage, token);
            }
            this.logger.log(`🎙️ ROUTING → Voice Agent for ${senderId}`);
            const audioAttachment = { payload: { url: message.audio, duration: message.audioDuration } };
            this.processVoiceAgent(mockMessaging, audioAttachment, pageId, platform).catch(err => {
                this.logger.error(`❌ Voice Agent Error: ${err.message}`);
            });
            return;
        }
        if (messageText) {
            const textActive = await this.isAgentActive('Text Agent');
            if (!textActive) {
                if (token) {
                    const { customer, conversation } = await this.getOrCreateContext(pageId, senderId, platform);
                    const unavailableMsg = await this.getAgentUnavailableMessage('Text Agent', customer.name || undefined);
                    this.stopTypingHeartbeat(senderId);
                    await this.sendOptimizedResponse(pageId, senderId, unavailableMsg, token, conversation.id, platform);
                }
                return;
            }
            this.logger.log(`💬 ROUTING → Text Agent for ${senderId}`);
            this.processTextAgent(mockMessaging, pageId, platform, messageText).catch(err => {
                this.logger.error(`❌ Text Agent Error: ${err.message}`);
            });
            return;
        }
    }
    normalizeMessengerEvent(event) {
        const messaging = event.messaging?.[0];
        if (!messaging)
            return null;
        if (messaging.read || messaging.delivery || messaging.optin) {
            return null;
        }
        const message = messaging.message || {};
        const attachments = message.attachments || [];
        return {
            senderId: messaging.sender?.id,
            pageId: event.id,
            platform: (event.objectType === 'instagram') ? 'INSTAGRAM' : 'MESSENGER',
            message: {
                text: message.text,
                image: attachments.find((a) => a.type === 'image')?.payload?.url,
                audio: attachments.find((a) => a.type === 'audio')?.payload?.url,
                audioDuration: attachments.find((a) => a.type === 'audio')?.payload?.duration || 0,
                is_echo: message.is_echo,
                app_id: message.app_id,
                type: 'text'
            }
        };
    }
    async normalizeWhatsAppEvent(event) {
        const changes = event.changes?.[0]?.value;
        const waMessage = changes?.messages?.[0];
        if (!waMessage)
            return null;
        const senderId = waMessage.from;
        const pageId = changes.metadata?.phone_number_id;
        const platform = 'WHATSAPP';
        const envWaid = this.configService.get('WHATSAPP_PHONE_NUMBER_ID') || '';
        const envToken = this.configService.get('WHATSAPP_ACCESS_TOKEN');
        let token = null;
        if (platform === 'WHATSAPP' && (pageId === envWaid || !pageId) && envToken) {
            token = envToken;
            this.logger.log(`🔄 Using prioritized WhatsApp environment credentials for Page ID: ${pageId || 'global'}`);
        }
        else {
            let integration = null;
            try {
                integration = await this.prisma.metaIntegration.findUnique({ where: { pageId } });
            }
            catch (dbError) {
                this.logger.warn(`⚠️ Database connection issues: ${dbError.message}.`);
            }
            if (integration) {
                token = this.encryption.decrypt(integration.pageAccessToken);
            }
        }
        const normalized = {
            senderId,
            pageId,
            platform,
            message: {
                text: '',
                image: '',
                audio: '',
                audioDuration: 0,
                is_echo: false,
                type: waMessage.type
            }
        };
        if (waMessage.type === 'text') {
            normalized.message.text = waMessage.text?.body || '';
        }
        else if (waMessage.image?.caption) {
            normalized.message.text = waMessage.image.caption;
        }
        else if (waMessage.video?.caption) {
            normalized.message.text = waMessage.video.caption;
        }
        else if (waMessage.document?.caption) {
            normalized.message.text = waMessage.document.caption;
        }
        if (waMessage.type === 'image' && waMessage.image?.url) {
            normalized.message.image = waMessage.image.url;
            this.logger.log(`🖼️ Using direct WhatsApp image URL from webhook.`);
        }
        else if (waMessage.type === 'audio' && waMessage.audio?.url) {
            normalized.message.audio = waMessage.audio.url;
            this.logger.log(`🎙️ Using direct WhatsApp audio URL from webhook.`);
        }
        else if (waMessage.type === 'image' && waMessage.image?.id && token) {
            normalized.message.image = await this.metaApi.getWhatsAppMediaUrl(waMessage.image.id, token);
        }
        else if (waMessage.type === 'audio' && waMessage.audio?.id && token) {
            normalized.message.audio = await this.metaApi.getWhatsAppMediaUrl(waMessage.audio.id, token);
        }
        return normalized;
    }
    async sendDirectPlatformResponse(platform, pageId, senderId, text, token) {
        if (platform === 'WHATSAPP') {
            return this.metaApi.sendWhatsAppMessage(pageId, senderId, text, token);
        }
        else {
            return this.metaApi.sendMessage(pageId, senderId, text, token);
        }
    }
    async checkSpam(senderId) {
        const settings = await this.settingsService.getSpamProtectionSettings();
        const spamWarningStr = "⚠️ You've been temporarily blocked due to excessive messaging. Please wait and try again later.";
        const maxMessages = settings.maxRequestsPer30Seconds || 5;
        const blockDuration = (settings.blockDuration || 10) * 60 * 1000;
        const timeWindow = 30 * 1000;
        if (this.spamBlocks.has(senderId)) {
            const blockUntil = this.spamBlocks.get(senderId);
            if (Date.now() < blockUntil) {
                const minutesLeft = Math.ceil((blockUntil - Date.now()) / (60 * 1000));
                return {
                    blocked: true,
                    reason: `Blocked for ${minutesLeft}m`,
                    message: `⚠️ You are currently blocked for ${minutesLeft} more minute(s) due to spamming.`
                };
            }
            else {
                this.spamBlocks.delete(senderId);
                this.userMessageTimestamps.delete(senderId);
            }
        }
        const now = Date.now();
        const timestamps = this.userMessageTimestamps.get(senderId) || [];
        const recentTimestamps = timestamps.filter(t => now - t < timeWindow);
        recentTimestamps.push(now);
        this.userMessageTimestamps.set(senderId, recentTimestamps);
        if (recentTimestamps.length > maxMessages) {
            this.spamBlocks.set(senderId, now + blockDuration);
            return {
                blocked: true,
                reason: 'Spam detected — blocking',
                message: spamWarningStr
            };
        }
        return { blocked: false, reason: '', message: '' };
    }
    detectIntentFastPath(messageText, history) {
        const text = messageText.toLowerCase().trim();
        if (history && history.length > 0) {
            const lastMessage = history[history.length - 1];
            if (lastMessage && lastMessage.startsWith('AGENT:') &&
                (lastMessage.includes('Let me get that order started for you') || lastMessage.includes('order started') || lastMessage.includes('Let me get that started'))) {
                return {
                    frustration_level: 0,
                    intent: 'Ordering',
                    urgency: 'Medium',
                    style: 'Casual',
                    search_queries: []
                };
            }
        }
        const patterns = {
            greeting: [
                /^(hi|hello|hey|good morning|good afternoon|good evening|yo|sup|what's up)/i,
                /^(how are you|howdy|greetings|namaste|salam)/i
            ],
            buying: [
                /^(buy|order|want|need|get|take)\s+(this|it|one|that|some)/i,
                /\b(how much|price|cost)\b.*\?/i,
                /\b(size|color|in stock)\b.*\?/i,
                /\b(delivery|shipping) (fee|cost|time|charges)\b/i,
                /\b(place|confirm|complete)\s+order\b/i
            ],
            browsing: [
                /^(show|see|looking for|search|find)\s+/i,
                /\b(do you have|got any)\b.*\?/i,
                /\b(more|another|different|other)\s+(pics?|photos?|images?|options?)\b/i,
                /\b(t-shirt|shirt|pants|jeans|jacket|dress|hoodie|clothing)\b/i
            ],
            support: [
                /(help|problem|issue|wrong|broken|damage)/i,
                /(refund|return|exchange|cancel)/i,
                /(where is|track|status).*order/i,
                /\b(complain|disappointed|unsatisfied)\b/i
            ],
            handoff: [
                /(human|person|agent|representative|support team)/i,
                /(talk to|speak with|call me)/i,
                /\b(manager|supervisor|admin)\b/i
            ]
        };
        for (const [intent, regexList] of Object.entries(patterns)) {
            for (const regex of regexList) {
                if (regex.test(text)) {
                    return {
                        frustration_level: 0,
                        intent: intent.charAt(0).toUpperCase() + intent.slice(1),
                        urgency: 'Low',
                        style: text.length > 50 ? 'Detailed' : 'Short',
                        search_queries: this.extractSearchQueries(text, intent)
                    };
                }
            }
        }
        return {
            frustration_level: 0,
            intent: 'Other',
            urgency: 'Low',
            style: text.length > 50 ? 'Detailed' : 'Short',
            search_queries: []
        };
    }
    extractSearchQueries(text, intent) {
        if (intent !== 'browsing' && intent !== 'buying')
            return [];
        const productKeywords = [
            't-shirt', 'shirt', 'pants', 'jeans', 'jacket', 'dress', 'hoodie',
            'sweater', 'coat', 'shorts', 'skirt', 'top', 'blouse', 'polo'
        ];
        const colors = ['red', 'blue', 'green', 'black', 'white', 'yellow', 'pink', 'purple', 'brown', 'gray'];
        const queries = [];
        for (const product of productKeywords) {
            if (text.includes(product)) {
                queries.push(product);
            }
        }
        for (const color of colors) {
            if (text.includes(color)) {
                const productQuery = queries[0] || 'item';
                queries.push(`${color} ${productQuery}`);
            }
        }
        return queries.slice(0, 2);
    }
    async processEcho(echoEvent, pageId) {
        const customerId = echoEvent.recipient.id;
        this.logger.log(`👨‍💼 Human admin message detected for customer ${customerId} on page ${pageId}. Suppressing AI.`);
        this.adminOverrides.set(customerId, Date.now() + this.OVERRIDE_DURATION);
    }
    async getOrCreateContext(pageId, senderId, platform) {
        let integration = await this.prisma.metaIntegration.findUnique({ where: { pageId } });
        if (!integration && platform === 'WHATSAPP') {
            const envWaid = this.configService.get('WHATSAPP_PHONE_NUMBER_ID');
            const envToken = this.configService.get('WHATSAPP_ACCESS_TOKEN');
            const envWabaId = this.configService.get('WHATSAPP_BUSINESS_ACCOUNT_ID');
            if (pageId === envWaid && envToken) {
                this.logger.log(`🌱 Auto-provisioning WhatsApp integration for page ${pageId}`);
                const firstUser = await this.prisma.user.findFirst();
                if (firstUser) {
                    integration = await this.prisma.metaIntegration.create({
                        data: {
                            pageId,
                            pageAccessToken: envToken,
                            userId: firstUser.id,
                            wabaId: envWabaId,
                            businessName: 'WhatsApp Business'
                        }
                    });
                }
            }
        }
        if (!integration) {
            throw new Error(`Integration for page ${pageId} not found`);
        }
        if (platform === 'WHATSAPP') {
            const envToken = this.configService.get('WHATSAPP_ACCESS_TOKEN');
            if (envToken && integration.pageAccessToken !== envToken) {
                this.logger.log(`💾 Syncing WhatsApp token in DB for page ${pageId}`);
                await this.prisma.metaIntegration.update({
                    where: { id: integration.id },
                    data: { pageAccessToken: this.encryption.encrypt(envToken) }
                }).catch(e => this.logger.error(`Failed to sync token: ${e.message}`));
                integration.pageAccessToken = envToken;
            }
        }
        let customer = await this.prisma.customer.findUnique({
            where: {
                metaIntegrationId_platformCustomerId: {
                    metaIntegrationId: integration.id,
                    platformCustomerId: senderId
                }
            }
        });
        if (!customer) {
            customer = await this.prisma.customer.create({
                data: {
                    metaIntegrationId: integration.id,
                    platformCustomerId: senderId,
                    name: `Customer ${senderId.substring(0, 4)}`,
                }
            });
        }
        let conversation = await this.prisma.conversation.findUnique({
            where: {
                metaIntegrationId_customerId: {
                    metaIntegrationId: integration.id,
                    customerId: customer.id
                }
            }
        });
        if (!conversation) {
            conversation = await this.prisma.conversation.create({
                data: {
                    metaIntegrationId: integration.id,
                    customerId: customer.id,
                    platform,
                }
            });
        }
        return { integration, customer, conversation };
    }
    async persistMessage(conversationId, sender, content) {
        await this.prisma.message.create({
            data: {
                conversationId,
                sender,
                content: content.length > 2000 ? content.substring(0, 1997) + '...' : content
            }
        });
    }
    userMessageTimestamps = new Map();
    spamBlocks = new Map();
    async processOrderAgent(messaging, pageId, platform, messageText) {
        const senderId = messaging.sender.id;
        try {
            const { integration, customer, conversation } = await this.getOrCreateContext(pageId, senderId, platform);
            const pageToken = integration.pageAccessToken;
            await this.acquireAiSlot(senderId, pageId, pageToken);
            const [orderAgent, history] = await Promise.all([
                this.aiAgentService.getActiveAgentByName('Order Agent'),
                this.redis.getHistory(senderId, 15),
            ]);
            const orderModelName = orderAgent?.model;
            const customerMemory = customer.preferences || '';
            await Promise.all([
                this.persistMessage(conversation.id, 'USER', messageText),
                this.redis.addMessage(senderId, 'USER', messageText)
            ]);
            let productContext = [];
            const orderSession = await this.redis.get(`order_session:${senderId}`);
            if (orderSession) {
                try {
                    const sessionData = JSON.parse(orderSession);
                    if (sessionData.productId) {
                        const p = await this.productService.findOne(sessionData.productId);
                        if (p) {
                            productContext = [this.buildProductContext(p)];
                            this.logger.log(`📦 Order Agent: Using product from active session: ${p.name}`);
                        }
                    }
                }
                catch { }
            }
            if (productContext.length === 0) {
                const lastProductId = await this.redis.get(`last_product:${senderId}`);
                if (lastProductId) {
                    const p = await this.productService.findOne(lastProductId);
                    if (p) {
                        productContext = [this.buildProductContext(p)];
                        this.logger.log(`📦 Order Agent: Using last discussed product: ${p.name}`);
                    }
                }
            }
            if (productContext.length === 0) {
                const latestOrder = await this.orderService.findLatestPlacedOrder(customer.id);
                if (latestOrder?.items?.length > 0) {
                    const p = await this.productService.findOne(latestOrder.items[0].productId);
                    if (p) {
                        productContext = [this.buildProductContext(p)];
                        this.logger.log(`📦 Order Agent: Using product from existing order: ${p.name}`);
                    }
                }
            }
            if (productContext.length === 0 && messageText) {
                const searchResults = await this.productService.searchProducts(messageText);
                if (searchResults.length > 0) {
                    productContext = [this.buildProductContext(searchResults[0])];
                    this.logger.log(`📦 Order Agent: Found product via search: ${searchResults[0].name}`);
                }
            }
            if (productContext.length > 0) {
                const sessionData = { productId: productContext[0].id, startedAt: Date.now() };
                await this.redis.set(`order_session:${senderId}`, JSON.stringify(sessionData), 900).catch(() => { });
            }
            const aiResponseText = await this.gemini.generateOrderResponse(messageText, productContext, history, customerMemory, orderModelName);
            this.logger.log(`📦 Order Agent RAW (first 500): ${aiResponseText.substring(0, 500)}`);
            const isOrderReady = aiResponseText.includes('[ORDER_READY:');
            this.logger.log(`📋 Order Agent Tag Detection: ORDER_READY=${isOrderReady}`);
            await this.extractAndProcessOrder(aiResponseText, customer.id);
            let finalResponseText = aiResponseText;
            if (isOrderReady) {
                await this.redis.del(`order_session:${senderId}`).catch(() => { });
                this.logger.log(`✅ Order placed. Clearing order session for ${senderId}.`);
                finalResponseText += "\n\n🎉 Thank you so much for your order! It has been successfully placed.\n\nWould you like to check out some more items from our store? 🛍️";
            }
            await this.sendOptimizedResponse(pageId, senderId, finalResponseText, integration.pageAccessToken, conversation.id, platform);
            if (platform === 'MESSENGER' || platform === 'INSTAGRAM') {
                this.stopTypingHeartbeat(senderId);
            }
        }
        catch (error) {
            this.logger.error(`Order Agent System Error: ${error.message}`);
            this.stopTypingHeartbeat(senderId);
        }
        finally {
            this.releaseAiSlot(senderId);
        }
    }
    async processTextAgent(messaging, pageId, platform, messageText) {
        const senderId = messaging.sender.id;
        try {
            const initialContext = await this.getOrCreateContext(pageId, senderId, platform);
            const pageToken = initialContext.integration.pageAccessToken;
            await this.acquireAiSlot(senderId, pageId, pageToken);
            const [textAgent, behaviourAgent, history, cachedEmotion] = await Promise.all([
                this.aiAgentService.getActiveAgentByName('Text Agent'),
                this.aiAgentService.getActiveAgentByName('Behaviour Agent'),
                this.redis.getHistory(senderId, 10),
                this.redis.get(`emotion:${senderId}`)
            ]);
            const { integration, customer, conversation } = initialContext;
            const textModelName = textAgent?.model;
            const behaviourModelName = behaviourAgent?.model;
            const customerMemory = customer.preferences || 'No specific preferences known yet.';
            await Promise.all([
                this.persistMessage(conversation.id, 'USER', messageText),
                this.redis.addMessage(senderId, 'USER', messageText)
            ]);
            this.logger.log(`📚 FAQ Analysis...`);
            const detectedCategory = this.detectInfoCategory(messageText);
            if (detectedCategory) {
                this.logger.log(`🎯 Info message detected, category: ${detectedCategory}`);
                const faqMatch = await this.faqService.findFaqMatch(messageText, detectedCategory);
                if (faqMatch) {
                    this.logger.log(`✅ FAQ Match Found: "${faqMatch.faq.question}" (confidence: ${faqMatch.confidence})`);
                    const faqResponse = this.faqService.getFaqResponse(faqMatch, customer.name || undefined);
                    await this.sendOptimizedResponse(pageId, senderId, faqResponse, integration.pageAccessToken, conversation.id, platform);
                    this.stopTypingHeartbeat(senderId);
                    return;
                }
            }
            let emotionState;
            const fastIntent = this.detectIntentFastPath(messageText, history);
            if (fastIntent.intent !== 'Other') {
                emotionState = fastIntent;
            }
            else {
                emotionState = await this.gemini.analyzeEmotionAndIntent(messageText, history, behaviourModelName);
            }
            if (emotionState.frustration_level > 0) {
                this.redis.set(`emotion:${senderId}`, JSON.stringify({
                    frustration_level: emotionState.frustration_level,
                    intent: emotionState.intent,
                    timestamp: Date.now()
                }), 600).catch(() => { });
            }
            if (cachedEmotion) {
                try {
                    const prevEmotion = JSON.parse(cachedEmotion);
                    if (prevEmotion.frustration_level >= 3) {
                        emotionState.frustration_level = Math.max(emotionState.frustration_level, prevEmotion.frustration_level - 1);
                    }
                }
                catch { }
            }
            if (emotionState.intent === 'Handoff') {
                this.logger.log(`🚨 Human Handoff requested for customer ${customer.id}`);
                this.prisma.notification.create({
                    data: {
                        type: 'HANDOFF',
                        message: `Customer requesting human assistance. Last message: "${messageText}"`,
                        customerId: customer.id
                    }
                }).catch(e => this.logger.error(`Handoff notification failed: ${e.message}`));
            }
            let searchResults = [];
            const followUpPattern = /(more\s+(pics?|photos?|images?)|another\s+(angle|picture|photo)|see\s+more|show\s+(me\s+)?more|stock|in\s+stock|available|quantity|how\s+many|material|made\s+of|brand|fabric|composition|details?\s+(about|of)|tell\s+me\s+more|what('s|\s+is)\s+(it|this|that)|size\s+chart)/i;
            const lastProductKey = `last_product:${senderId}`;
            const lastProductId = await this.redis.get(lastProductKey);
            if (lastProductId && followUpPattern.test(messageText)) {
                this.logger.log(`🔁 Follow-up detected for product ${lastProductId}`);
                const p = await this.productService.findOne(lastProductId);
                if (p) {
                    searchResults = [this.buildProductContext(p)];
                }
            }
            if (searchResults.length === 0) {
                searchResults = await this.getCachedSearchResults(messageText, emotionState);
                if (searchResults.length === 0 && lastProductId) {
                    this.logger.log(`🔄 Search empty, falling back to last product ${lastProductId}`);
                    const p = await this.productService.findOne(lastProductId);
                    if (p) {
                        searchResults = [this.buildProductContext(p)];
                    }
                }
            }
            if (searchResults.length > 0) {
                const primary = searchResults[0];
                this.redis.set(`last_product:${senderId}`, primary.id, 86400).catch(() => { });
            }
            const aiResponseText = await this.gemini.generateSalesResponse(messageText, searchResults, history, customerMemory, false, emotionState, textModelName);
            await this.sendOptimizedResponse(pageId, senderId, aiResponseText, integration.pageAccessToken, conversation.id, platform);
            const msgCount = await this.redis.incrementMessageCount(senderId);
            if (msgCount % 5 === 0) {
                const behaviourActive = await this.isAgentActive('Behaviour Agent');
                if (behaviourActive) {
                    this.extractAndSaveProfile(customer, senderId, behaviourModelName).catch(err => this.logger.error(`Background profile extraction failed: ${err.message}`));
                }
            }
        }
        catch (error) {
            this.logger.error(`Text Agent System Error: ${error.message}`);
            this.stopTypingHeartbeat(senderId);
        }
        finally {
            this.releaseAiSlot(senderId);
        }
    }
    buildProductContext(p) {
        return {
            id: p.id,
            name: p.name,
            price: p.price,
            imageUrls: p.imageUrls,
            colors: p.colors,
            sizes: p.sizes,
            description: p.description,
            metadata: p.metadata
        };
    }
    async getCachedSearchResults(messageText, emotionState) {
        const cacheKey = `search:${messageText.toLowerCase().trim()}`;
        try {
            const cached = await this.redis.get(cacheKey);
            if (cached) {
                this.logger.log(`🎯 Cache hit for search: ${messageText.substring(0, 30)}...`);
                return JSON.parse(cached);
            }
            let searchResults = [];
            if (emotionState.search_queries && emotionState.search_queries.length > 0) {
                this.logger.log(`🔍 Compound Text Queries Detected: ${emotionState.search_queries.join(', ')}`);
                for (const q of emotionState.search_queries) {
                    const rawResults = await this.productService.searchProducts(q);
                    searchResults.push(...rawResults);
                }
                const uniqueIds = new Set();
                const deduped = [];
                for (const p of searchResults) {
                    if (!uniqueIds.has(p.id)) {
                        uniqueIds.add(p.id);
                        deduped.push(p);
                    }
                }
                searchResults = deduped.slice(0, 6);
            }
            else {
                searchResults = await this.productService.searchProducts(messageText);
            }
            if (searchResults.length > 0) {
                await this.redis.set(cacheKey, JSON.stringify(searchResults), 300);
                this.logger.log(`💾 Cached ${searchResults.length} search results for: ${messageText.substring(0, 30)}...`);
            }
            return searchResults;
        }
        catch (error) {
            this.logger.error(`❌ Cached search failed, falling back to direct search: ${error.message}`);
            return await this.productService.searchProducts(messageText);
        }
    }
    startTypingHeartbeat(pageId, senderId, token) {
        this.stopTypingHeartbeat(senderId);
        this.metaApi.typingOn(pageId, senderId, token).catch(() => { });
        const interval = setInterval(() => {
            this.metaApi.typingOn(pageId, senderId, token).catch(() => { });
        }, 15000);
        this.typingHeartbeats.set(senderId, interval);
    }
    stopTypingHeartbeat(senderId) {
        const interval = this.typingHeartbeats.get(senderId);
        if (interval) {
            clearInterval(interval);
            this.typingHeartbeats.delete(senderId);
        }
    }
    async sendOptimizedResponse(pageId, senderId, text, token, conversationId, platform) {
        try {
            let decryptedToken = token;
            try {
                decryptedToken = this.encryption.decrypt(token);
            }
            catch (e) {
            }
            const cleanText = this.stripMarkdown(text);
            await this.persistMessage(conversationId, 'AGENT', text);
            await this.redis.addMessage(senderId, 'AGENT', text);
            const imageUrls = this.extractImageUrls(text);
            const textWithoutUrls = this.removeImageUrls(cleanText);
            if (platform === 'MESSENGER' || platform === 'INSTAGRAM') {
                if (imageUrls.length > 0) {
                    await this.metaApi.sendBatchImages(pageId, senderId, imageUrls, decryptedToken);
                }
                if (textWithoutUrls) {
                    await this.metaApi.sendMessageWithRetry(pageId, senderId, textWithoutUrls, decryptedToken);
                }
            }
            else if (platform === 'WHATSAPP') {
                if (imageUrls.length > 0) {
                    for (const url of imageUrls) {
                        await this.metaApi.sendWhatsAppImage(pageId, senderId, url, decryptedToken);
                    }
                }
                if (textWithoutUrls) {
                    await this.metaApi.sendWhatsAppMessage(pageId, senderId, textWithoutUrls, decryptedToken);
                }
            }
        }
        catch (error) {
            this.logger.error(`Response Send Error [${platform}]: ${error.message}`);
        }
    }
    async handleBatchImages(pageId, recipientId, links, token) {
        if (!links || links.length === 0)
            return;
        const uniqueLinks = [...new Set(links)];
        this.logger.log(`🖼️ Delivering ${uniqueLinks.length} images in batch...`);
        try {
            await this.metaApi.sendBatchImages(pageId, recipientId, uniqueLinks, token);
        }
        catch (err) {
            this.logger.error(`❌ Failed to send batch images: ${err.message}. Falling back to sequential.`);
            for (const url of uniqueLinks) {
                try {
                    await this.metaApi.sendImage(pageId, recipientId, url, token);
                    await new Promise(resolve => setTimeout(resolve, 800));
                }
                catch (seqErr) {
                    this.logger.error(`❌ Sequential fallback failed for ${url}: ${seqErr.message}`);
                }
            }
        }
    }
    async processVisualAgent(messaging, imageUrls, pageId, userText = '', platform = 'MESSENGER', requestStartTime = Date.now()) {
        const senderId = messaging.sender.id;
        try {
            const lastMsgTime = this.lastUserMessageTimestamp.get(senderId) || 0;
            if (requestStartTime < lastMsgTime) {
                this.logger.warn(`🛑 Stale Image Task Ignored for ${senderId}. User has moved on.`);
                return;
            }
            const { integration, customer, conversation } = await this.getOrCreateContext(pageId, senderId, platform);
            await this.acquireAiSlot(senderId, pageId, integration.pageAccessToken);
            const visualAgent = await this.aiAgentService.getActiveAgentByName('Visual Agent');
            const textAgent = await this.aiAgentService.getActiveAgentByName('Text Agent');
            const visualEmbeddingModelName = visualAgent?.model;
            const textModelName = textAgent?.model;
            const history = await this.redis.getHistory(senderId, 10);
            const customerMemory = customer.preferences || 'No specific preferences known yet.';
            const logText = (userText || '(Sent Image for search)').trim();
            await this.persistMessage(conversation.id, 'USER', `[VisualSearch] ${logText}`);
            await this.redis.addMessage(senderId, 'USER', `[Sent Image] ${logText}`);
            if (userText && userText.trim()) {
                const faqMatch = await this.faqService.findFaqMatch(userText);
                if (faqMatch) {
                    this.logger.log(`✅ FAQ Match in Visual Agent: "${faqMatch.faq.question}"`);
                    const faqResponse = this.faqService.getFaqResponse(faqMatch, customer.name || undefined);
                    await this.sendOptimizedResponse(pageId, senderId, faqResponse, integration.pageAccessToken, conversation.id, platform);
                    this.stopTypingHeartbeat(senderId);
                    return;
                }
            }
            let allMatches = [];
            for (let i = 0; i < imageUrls.length; i++) {
                const imageUrl = imageUrls[i];
                this.logger.log(`🧠 Generating Embedding for image ${i + 1}/${imageUrls.length}...`);
                const imageBuffer = await this.downloadImage(imageUrl, integration.pageAccessToken);
                const imageEmbedding = await this.gemini.generateMultimodalEmbedding(userText || 'Analyze this clothing item', imageBuffer, 'image/jpeg', visualEmbeddingModelName);
                const matches = await this.pinecone.query(imageEmbedding, 5);
                if (matches && matches.length > 0) {
                    allMatches.push(...matches);
                }
            }
            if (allMatches.length > 0) {
                const uniqueIds = new Set();
                const uniqueMatches = [];
                for (const m of allMatches) {
                    if (!uniqueIds.has(m.id)) {
                        uniqueIds.add(m.id);
                        uniqueMatches.push(m);
                    }
                }
                uniqueMatches.sort((a, b) => (b.score || 0) - (a.score || 0));
                const bestMatch = uniqueMatches[0];
                bestMatch.score = bestMatch.score || 0;
                const score = bestMatch.score * 100;
                this.logger.log(`🔍 Top Vector Match: ${score.toFixed(2)}%`);
                let promptContext = `The user sent an image. I found a match with ${score.toFixed(1)}% confidence.`;
                if (bestMatch.score < this.CONFIDENCE_THRESHOLD) {
                    promptContext = `The user sent an image. The visual match is WEAK (${score.toFixed(1)}%). 
                    DO NOT state it is definitively the item. Instead, offer it as a strong possibility and ask 
                    "Is this what you're looking for?" or describe it as "something similar you might like."`;
                    this.logger.log(`⚠️ Weak Match (${score.toFixed(1)}%) - Using cautious prompt.`);
                }
                const products = uniqueMatches.slice(0, 3).map(m => m.metadata);
                const promptPrefix = imageUrls.length > 1
                    ? `The user sent ${imageUrls.length} images. Here are the best visual matches.`
                    : promptContext;
                const aiResponseText = await this.gemini.generateSalesResponse(`${promptPrefix} User query: "${userText}"`, products, history, customerMemory, false, null, textModelName);
                if (products.length > 0 && products[0].id) {
                    this.redis.set(`last_product:${senderId}`, products[0].id, 86400).catch(() => { });
                }
                await this.sendOptimizedResponse(pageId, senderId, aiResponseText, integration.pageAccessToken, conversation.id, platform);
                this.stopTypingHeartbeat(senderId);
            }
            else {
                const noMatchMsg = "I couldn't find an exact match for that item in our current inventory. Could you tell me more about what you're looking for?";
                await this.sendDirectPlatformResponse(platform, pageId, senderId, noMatchMsg, integration.pageAccessToken);
                await this.persistMessage(conversation.id, 'AGENT', noMatchMsg);
                await this.redis.addMessage(senderId, 'AGENT', noMatchMsg);
                this.stopTypingHeartbeat(senderId);
            }
            const msgCount = await this.redis.incrementMessageCount(senderId);
            if (msgCount % 5 === 0) {
                const behaviourActive = await this.isAgentActive('Behaviour Agent');
                if (behaviourActive) {
                    this.extractAndSaveProfile(customer, senderId).catch(err => this.logger.error(`Background profile extraction failed: ${err.message}`));
                }
            }
        }
        catch (error) {
            this.logger.error(`Visual Agent System Error: ${error.message}`);
            this.stopTypingHeartbeat(senderId);
        }
        finally {
            this.releaseAiSlot(senderId);
        }
    }
    async processVoiceAgent(messaging, audioAttachment, pageId, platform = 'MESSENGER') {
        const senderId = messaging.sender.id;
        const audioUrl = audioAttachment.payload.url;
        const durationMs = audioAttachment.payload.duration || 0;
        this.logger.log(`🎙️ Voice Agent processing [${platform}] for ${senderId}. URL: ${audioUrl.substring(0, 50)}...`);
        try {
            const { integration, customer, conversation } = await this.getOrCreateContext(pageId, senderId, platform);
            if (durationMs > 60000) {
                this.logger.warn(`⚠️ Voice note too long: ${durationMs}ms from ${senderId}`);
                const rejectionMsg = "I am sorry, I can't listen to voice notes longer than 60 seconds. I am connecting you with our support team who will help you further! 🙏";
                await this.metaApi.sendMessage(pageId, senderId, rejectionMsg, integration.pageAccessToken);
                await this.prisma.notification.create({
                    data: {
                        type: 'HANDOFF',
                        message: `Voice note limit exceeded (${Math.round(durationMs / 1000)}s). Customer needs human help.`,
                        customerId: customer.id
                    }
                });
                this.stopTypingHeartbeat(senderId);
                return;
            }
            await this.acquireAiSlot(senderId, pageId, integration.pageAccessToken);
            const voiceAgent = await this.aiAgentService.getActiveAgentByName('Voice Agent');
            const voiceModelName = voiceAgent?.model;
            const history = await this.redis.getHistory(senderId, 10);
            const customerMemory = customer.preferences || 'No specific preferences known yet.';
            this.logger.log(`📥 Downloading audio for ${senderId}...`);
            const audioBuffer = await this.downloadFile(audioUrl, integration.pageAccessToken);
            if (durationMs === 0 && audioBuffer.length > 2 * 1024 * 1024) {
                this.logger.warn(`⚠️ Large audio file detected without duration: ${audioBuffer.length} bytes`);
            }
            this.logger.log(`🧠 Calling Gemini Voice Processing...`);
            const mimeType = audioUrl.toLowerCase().includes('.ogg') ? 'audio/ogg' : 'audio/mp4';
            const products = await this.productService.searchProducts('');
            const { transcription, response: aiResponse } = await this.gemini.processAudioMessage(audioBuffer, mimeType, products.slice(0, 5), history, customerMemory, voiceModelName);
            this.logger.log(`📝 Voice Transcription: "${transcription}"`);
            await this.persistMessage(conversation.id, 'USER', `[Voice]: ${transcription}`);
            await this.redis.addMessage(senderId, 'USER', `[Voice]: ${transcription}`);
            await this.sendOptimizedResponse(pageId, senderId, aiResponse, integration.pageAccessToken, conversation.id, platform);
            if (platform === 'MESSENGER' || platform === 'INSTAGRAM') {
                this.stopTypingHeartbeat(senderId);
            }
        }
        catch (error) {
            this.logger.error(`Voice Agent System Error: ${error.message}`);
            if (platform === 'MESSENGER' || platform === 'INSTAGRAM') {
                this.stopTypingHeartbeat(senderId);
            }
        }
        finally {
            this.releaseAiSlot(senderId);
        }
    }
    async downloadFile(url, token) {
        const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
        const response = await (0, rxjs_1.lastValueFrom)(this.httpService.get(url, { responseType: 'arraybuffer', headers }));
        return Buffer.from(response.data);
    }
    async extractAndProcessOrder(aiResponseText, customerId) {
        const readyJson = this.extractTagJson(aiResponseText, 'ORDER_READY');
        const updateJson = this.extractTagJson(aiResponseText, 'ORDER_UPDATE');
        if (readyJson) {
            try {
                const orderData = JSON.parse(readyJson);
                this.logger.log(`🎯 ORDER_READY DETECTED: Creating order for customer ${customerId}`);
                let createdOrders;
                if (orderData.deliveries && Array.isArray(orderData.deliveries)) {
                    createdOrders = await this.orderService.createOrdersFromCart(orderData, customerId);
                }
                else {
                    createdOrders = [await this.orderService.createOrder({
                            customerId: customerId,
                            customerName: orderData.name || orderData.customerName,
                            customerPhone: orderData.phone,
                            customerEmail: orderData.email,
                            deliveryAddress: orderData.location,
                            items: [{
                                    productId: orderData.productId,
                                    size: orderData.size,
                                    color: orderData.color,
                                    quantity: orderData.quantity
                                }]
                        })];
                }
                this.logger.log(`✅ Order(s) successfully created with PLACED status. Awaiting admin confirmation.`);
            }
            catch (err) {
                this.logger.error(`❌ Failed to process ORDER_READY tag: ${err.message}`);
            }
        }
        else if (updateJson) {
            try {
                const updateData = JSON.parse(updateJson);
                this.logger.log(`🔄 ORDER_UPDATE DETECTED: Updating latest pending order for ${customerId}`);
                const latestOrder = await this.orderService.findLatestPendingOrder(customerId);
                if (latestOrder) {
                    if (updateData.deliveries && Array.isArray(updateData.deliveries)) {
                        await this.prisma.order.delete({ where: { id: latestOrder.id } }).catch(e => this.logger.warn(`Could not delete old order: ${e.message}`));
                        await this.orderService.createOrdersFromCart(updateData, customerId);
                        this.logger.log(`✅ Cart successfully updated via replacement.`);
                    }
                    else {
                        await this.orderService.updateOrder(latestOrder.id, {
                            customerName: updateData.name,
                            customerPhone: updateData.phone,
                            customerEmail: updateData.email,
                            deliveryAddress: updateData.location,
                            items: updateData.productId ? [{
                                    productId: updateData.productId,
                                    size: updateData.size,
                                    color: updateData.color,
                                    quantity: updateData.quantity
                                }] : undefined
                        });
                        this.logger.log(`✅ Order ${latestOrder.id} successfully updated.`);
                    }
                }
                else {
                    this.logger.warn(`⚠️ No pending order found to update for customer ${customerId}`);
                }
            }
            catch (err) {
                this.logger.error(`❌ Failed to process ORDER_UPDATE tag: ${err.message}`);
            }
        }
    }
    extractTagJson(text, tagName) {
        const marker = `[${tagName}:`;
        const startIdx = text.indexOf(marker);
        if (startIdx === -1)
            return null;
        const jsonStart = text.indexOf('{', startIdx + marker.length);
        if (jsonStart === -1)
            return null;
        let depth = 0;
        for (let i = jsonStart; i < text.length; i++) {
            if (text[i] === '{')
                depth++;
            else if (text[i] === '}')
                depth--;
            if (depth === 0) {
                return text.substring(jsonStart, i + 1);
            }
        }
        return null;
    }
    stripMarkdown(text) {
        let clean = text;
        for (const tag of ['ORDER_READY', 'ORDER_UPDATE', 'ORDER_SPLIT']) {
            const marker = `[${tag}:`;
            let idx = clean.indexOf(marker);
            while (idx !== -1) {
                const jsonStart = clean.indexOf('{', idx);
                if (jsonStart === -1)
                    break;
                let depth = 0;
                let end = jsonStart;
                for (let i = jsonStart; i < clean.length; i++) {
                    if (clean[i] === '{')
                        depth++;
                    else if (clean[i] === '}')
                        depth--;
                    if (depth === 0) {
                        end = i;
                        break;
                    }
                }
                const closingBracket = clean.indexOf(']', end);
                const removeEnd = closingBracket !== -1 ? closingBracket + 1 : end + 1;
                clean = clean.substring(0, idx) + clean.substring(removeEnd);
                idx = clean.indexOf(marker);
            }
        }
        clean = clean.replace(/[*_~`#$]/g, '');
        return clean.trim();
    }
    detectInfoCategory(messageText) {
        const text = messageText.toLowerCase().trim();
        const infoCategories = {
            'Business Info': ['hours', 'open', 'close', 'timing', 'business hours', 'location', 'address', 'where', 'contact', 'phone', 'email', 'support'],
            'Shipping': ['delivery', 'shipping', 'deliver', 'time', 'when', 'charges', 'fee', 'cost', 'outside dhaka', 'area'],
            'Order Process': ['order', 'buy', 'purchase', 'payment', 'cash', 'bkash', 'nagad', 'card', 'checkout', 'cart', 'modify', 'cancel'],
            'Returns': ['return', 'refund', 'policy', 'exchange', 'money back', 'give back'],
            'Product Info': ['size', 'fit', 'original', 'authentic', 'genuine', 'quality', 'brand', 'care', 'wash', 'clean']
        };
        for (const [category, keywords] of Object.entries(infoCategories)) {
            if (keywords.some(keyword => text.includes(keyword))) {
                return category;
            }
        }
        return null;
    }
    async downloadImage(url, token) {
        const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
        const response = await (0, rxjs_1.lastValueFrom)(this.httpService.get(url, { responseType: 'arraybuffer', headers }));
        return Buffer.from(response.data);
    }
    async isAgentActive(agentId) {
        try {
            const agent = await this.prisma.aiAgent.findUnique({
                where: { name: agentId },
            });
            return agent?.isActive ?? true;
        }
        catch (error) {
            const e = error;
            if (e?.code === 'P2021') {
                if (!this.aiAgentTableMissingWarned) {
                    this.aiAgentTableMissingWarned = true;
                    this.logger.warn('ai_agents table missing; defaulting agent availability to active. Run Prisma migrations.');
                }
                return true;
            }
            this.logger.error(`Failed to check agent status for ${agentId}: ${e?.message ?? String(error)}`);
            return true;
        }
    }
    async getAgentUnavailableMessage(agentName, customerName) {
        const DEFAULT_UNAVAILABLE = "I'm sorry, but that AI service is currently temporarily unavailable for maintenance.\n\n🔧 Our team is working to restore it as soon as possible.\n\n📞 I'm connecting you with our admin team who can assist you right away.\n\nThank you for your patience! 😊";
        try {
            const agent = await this.aiAgentService.getAgentByName(agentName);
            if (agentName === 'Behaviour Agent') {
                return '';
            }
            const message = agent?.unavailableMessage || DEFAULT_UNAVAILABLE;
            return message;
        }
        catch (error) {
            this.logger.error(`Error fetching unavailable message for ${agentName}:`, error);
            return DEFAULT_UNAVAILABLE;
        }
    }
    async notifyAdminAboutInactiveAgent(agentName, senderId, messageText, customer) {
        try {
            await this.prisma.notification.create({
                data: {
                    type: 'AGENT_UNAVAILABLE',
                    message: `Customer ${customer.name || senderId} tried to use ${agentName} but it's inactive. Message: "${messageText}"`,
                    customerId: customer.id
                }
            });
            this.logger.log(`🔔 Admin notified about inactive ${agentName} usage by customer ${customer.name || senderId}`);
        }
        catch (error) {
            this.logger.error(`Failed to notify admin about inactive agent: ${error.message}`);
        }
    }
    async extractAndSaveProfile(customer, senderId, modelName) {
        try {
            this.logger.log(`🧠 Triggering Semantic Memory extraction for customer ${customer.id}`);
            const history = await this.redis.getHistory(senderId, 20);
            const newProfile = await this.gemini.extractBehavioralProfile(history, customer.preferences || '', modelName);
            if (newProfile && newProfile !== customer.preferences) {
                await this.customerService.update(customer.id, { preferences: newProfile });
                this.logger.log(`💾 Updated Semantic Memory: ${newProfile}`);
            }
        }
        catch (e) {
            this.logger.error(`Failed to extract profile: ${e.message}`);
        }
    }
    extractImageUrls(text) {
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        return text.match(urlRegex) || [];
    }
    removeImageUrls(text) {
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        return text.replace(urlRegex, '').trim();
    }
};
exports.MetaWebhookService = MetaWebhookService;
exports.MetaWebhookService = MetaWebhookService = MetaWebhookService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService,
        prisma_service_1.PrismaService,
        gemini_service_1.GeminiService,
        meta_api_service_1.MetaApiService,
        redis_service_1.RedisService,
        pinecone_service_1.PineconeService,
        axios_1.HttpService,
        product_service_1.ProductService,
        order_service_1.OrderService,
        customer_service_1.CustomerService,
        faq_service_1.FaqService,
        ai_agent_service_1.AiAgentService,
        settings_service_1.SettingsService,
        encryption_service_1.EncryptionService])
], MetaWebhookService);
//# sourceMappingURL=meta-webhook.service.js.map