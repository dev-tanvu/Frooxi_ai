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
const webhook_normalizer_service_1 = require("./webhook-normalizer.service");
const webhook_state_service_1 = require("./webhook-state.service");
const intent_router_service_1 = require("./intent-router.service");
const agent_lifecycle_service_1 = require("./agent-lifecycle.service");
const order_logic_service_1 = require("./order-logic.service");
const gemini_behaviour_service_1 = require("../ai/gemini-behaviour.service");
const gemini_response_service_1 = require("../ai/gemini-response.service");
const gemini_multimodal_service_1 = require("../ai/gemini-multimodal.service");
const redis_service_1 = require("../redis/redis.service");
const product_service_1 = require("../product/product.service");
const faq_service_1 = require("../faq/faq.service");
const ai_agent_service_1 = require("../ai-agent/ai-agent.service");
const pinecone_service_1 = require("../ai/pinecone.service");
const customer_service_1 = require("../customer/customer.service");
const cart_service_1 = require("../cart/cart.service");
const meta_api_service_1 = require("./meta-api.service");
const axios_1 = require("@nestjs/axios");
const rxjs_1 = require("rxjs");
let MetaWebhookService = MetaWebhookService_1 = class MetaWebhookService {
    configService;
    normalizer;
    state;
    router;
    lifecycle;
    orderLogic;
    geminiBehaviour;
    geminiResponse;
    geminiMultimodal;
    redis;
    productService;
    faqService;
    aiAgentService;
    pinecone;
    customerService;
    cartService;
    metaApi;
    httpService;
    logger = new common_1.Logger(MetaWebhookService_1.name);
    appId;
    constructor(configService, normalizer, state, router, lifecycle, orderLogic, geminiBehaviour, geminiResponse, geminiMultimodal, redis, productService, faqService, aiAgentService, pinecone, customerService, cartService, metaApi, httpService) {
        this.configService = configService;
        this.normalizer = normalizer;
        this.state = state;
        this.router = router;
        this.lifecycle = lifecycle;
        this.orderLogic = orderLogic;
        this.geminiBehaviour = geminiBehaviour;
        this.geminiResponse = geminiResponse;
        this.geminiMultimodal = geminiMultimodal;
        this.redis = redis;
        this.productService = productService;
        this.faqService = faqService;
        this.aiAgentService = aiAgentService;
        this.pinecone = pinecone;
        this.customerService = customerService;
        this.cartService = cartService;
        this.metaApi = metaApi;
        this.httpService = httpService;
        this.appId = this.configService.get('META_APP_ID') || '';
    }
    async handleWebhookEvent(event) {
        const objectType = event.objectType || 'page';
        let normalized = (objectType === 'whatsapp_business' || objectType === 'whatsapp_business_account')
            ? await this.normalizer.normalizeWhatsAppEvent(event)
            : this.normalizer.normalizeMessengerEvent(event);
        if (!normalized)
            return;
        const { senderId, pageId, message, platform, type, referral } = normalized;
        if (referral && referral.ref) {
            const refText = `[SYSTEM: User arrived via referral link. Reference: ${referral.ref}, Source: ${referral.source || 'UNKNOWN'}]`;
            if (message) {
                message.text = message.text ? `${message.text}\n\n${refText}` : refText;
            }
            else {
                normalized.message = { text: refText, is_echo: false };
                normalized.type = 'MESSAGE';
            }
        }
        if (normalized.type !== 'MESSAGE')
            return;
        if (!normalized.message)
            return;
        const actualMessage = normalized.message;
        const requestStartTime = Date.now();
        if (actualMessage.is_echo)
            return this.normalizer.processEcho(normalized);
        const messageId = actualMessage.mid || `${senderId}:${requestStartTime}`;
        const dedupKey = `dedup:${messageId}`;
        const [dedupResult, adminPause, , lastMsgTsRaw] = await this.redis.pipeline()
            .set(dedupKey, '1', 'EX', 300, 'NX')
            .get(`admin_pause:${senderId}`)
            .get(`spam_block:${senderId}`)
            .get(`last_msg_ts:${senderId}`)
            .exec();
        if (dedupResult[1] !== 'OK') {
            this.logger.debug(`Skipping duplicate webhook event for message ${messageId}`);
            return;
        }
        if (adminPause[1])
            return;
        const spam = await this.state.checkSpam(senderId);
        if (spam.blocked) {
            const token = await this.getToken(pageId, platform);
            if (token)
                await this.metaApi.sendMessage(pageId, senderId, spam.message || 'Blocked', token);
            return;
        }
        const lastMsgTs = parseInt(lastMsgTsRaw[1] || '0');
        if (requestStartTime - lastMsgTs > 3600000)
            await this.redis.del(`order_session:${senderId}`);
        this.redis.set(`last_msg_ts:${senderId}`, requestStartTime.toString(), 86400);
        if (actualMessage.image) {
            this.processVisualAgent(normalized, [actualMessage.image], pageId, actualMessage.text || '', platform, requestStartTime);
        }
        else if (actualMessage.audio) {
            this.processVoiceAgent(normalized, actualMessage.audio, pageId, platform);
        }
        else {
            const history = await this.redis.getHistory(senderId, 6);
            let intentState = this.router.detectIntentFastPath(actualMessage.text || '', history);
            if (intentState.intent === 'Other')
                intentState.intent = await this.router.getHistoryIntentFallback(senderId);
            if (intentState.intent === 'Ordering' || intentState.intent === 'Buying') {
                this.processOrderAgent(normalized, pageId, platform, actualMessage.text || '');
            }
            else {
                this.processTextAgent(normalized, pageId, platform, actualMessage.text || '');
            }
        }
    }
    async processOrderAgent(normalized, pageId, platform, messageText) {
        await this.lifecycle.executeAgentLifecycle('Order Agent', normalized.senderId, pageId, platform, messageText, async (ctx) => {
            await this.handleOrderAgentLogic(normalized, pageId, platform, messageText, ctx);
        });
    }
    async handleOrderAgentLogic(normalized, pageId, platform, messageText, ctx) {
        const agent = await this.aiAgentService.getActiveAgentByName('Order Agent');
        const history = await this.redis.getHistory(normalized.senderId, 15);
        let productContext = [];
        const [session, currentProductIdsStr, lastProductId] = await Promise.all([
            this.redis.get(`order_session:${normalized.senderId}`),
            this.redis.get(`current_products:${normalized.senderId}`),
            this.redis.get(`last_product:${normalized.senderId}`)
        ]);
        const idsToFetch = new Set();
        if (session)
            idsToFetch.add(JSON.parse(session).productId);
        if (lastProductId)
            idsToFetch.add(lastProductId);
        if (currentProductIdsStr) {
            const ids = JSON.parse(currentProductIdsStr);
            ids.forEach((id) => idsToFetch.add(id));
        }
        if (idsToFetch.size > 0) {
            const products = await Promise.all(Array.from(idsToFetch).map(id => this.productService.findOne(id)));
            productContext = products.filter(p => !!p).map(p => this.orderLogic.buildProductContext(p));
        }
        const { text: aiResponse, toolCalls } = await this.geminiResponse.generateOrderResponse(messageText, productContext, history, ctx.customer.preferences, agent?.model);
        let handledByToolResponse = false;
        let isDraftUpdated = false;
        if (toolCalls && toolCalls.length > 0) {
            for (const call of toolCalls) {
                const { success, error, response: toolText } = await this.orderLogic.handleToolCall(call, ctx.customer.id);
                if (success) {
                    if (call.name === 'update_order_draft') {
                        isDraftUpdated = true;
                        const pId = call.args?.productId || lastProductId;
                        await this.redis.set(`order_session:${normalized.senderId}`, JSON.stringify({ productId: pId }), 3600);
                    }
                    else if (call.name === 'place_order') {
                        await this.redis.del(`order_session:${normalized.senderId}`);
                    }
                    if (toolText) {
                        await this.lifecycle.sendOptimizedResponse(pageId, normalized.senderId, toolText, ctx.token, ctx.conversation.id, platform);
                        handledByToolResponse = true;
                    }
                }
                else if (!success && error) {
                    this.logger.error(`❌ Tool execution failed for ${normalized.senderId}: ${error}`);
                }
            }
        }
        if (aiResponse && aiResponse.trim() !== '') {
            if (aiResponse.includes('[INTERNAL_HANDOFF]')) {
                this.logger.debug(`🔄 Internal handoff from Order Agent for ${normalized.senderId}`);
                return this.handleTextAgentLogic(normalized, pageId, platform, messageText, ctx);
            }
            await this.lifecycle.sendOptimizedResponse(pageId, normalized.senderId, aiResponse, ctx.token, ctx.conversation.id, platform);
        }
        else if (toolCalls && toolCalls.some((c) => c.name === 'update_order_draft') && !handledByToolResponse) {
            const fallbackResponse = await this.orderLogic.generateDraftStatusResponse(ctx.customer.id);
            await this.lifecycle.sendOptimizedResponse(pageId, normalized.senderId, fallbackResponse, ctx.token, ctx.conversation.id, platform);
        }
        if (aiResponse && aiResponse.includes('[ORDER_READY:')) {
            const { success } = await this.orderLogic.extractAndProcessOrder(aiResponse, ctx.customer.id);
            if (success) {
                await this.redis.del(`order_session:${normalized.senderId}`);
                await this.lifecycle.sendOptimizedResponse(pageId, normalized.senderId, "✅ Your order has been placed! (Legacy Tag Detection)", ctx.token, ctx.conversation.id, platform);
            }
        }
    }
    async processTextAgent(normalized, pageId, platform, messageText) {
        await this.lifecycle.executeAgentLifecycle('Text Agent', normalized.senderId, pageId, platform, messageText, async (ctx) => {
            await this.handleTextAgentLogic(normalized, pageId, platform, messageText, ctx);
        });
    }
    async handleTextAgentLogic(normalized, pageId, platform, messageText, ctx) {
        const [agent, history] = await Promise.all([
            this.aiAgentService.getActiveAgentByName('Text Agent'),
            this.redis.getHistory(normalized.senderId, 10)
        ]);
        const cats = { 'Business Info': ['hours', 'location'], 'Shipping': ['delivery', 'fee'] };
        for (const [k, v] of Object.entries(cats)) {
            if (v.some((kw) => messageText.toLowerCase().includes(kw))) {
                const match = await this.faqService.findFaqMatch(messageText, k);
                if (match) {
                    const resp = this.faqService.getFaqResponse(match, ctx.customer.name);
                    await this.lifecycle.sendOptimizedResponse(pageId, normalized.senderId, resp, ctx.token, ctx.conversation.id, platform);
                    return;
                }
            }
        }
        const emotion = await this.geminiBehaviour.analyzeEmotionAndIntent(messageText, history, 'gemini-2.0-flash');
        let results = [];
        if (emotion?.search_queries && emotion.search_queries.length > 0) {
            this.logger.debug(`Detected product queries: ${emotion.search_queries.join(', ')}`);
            const searchPromises = emotion.search_queries.map((q) => this.productService.searchProducts(q));
            const allResults = await Promise.all(searchPromises);
            const uniqueIds = new Set();
            for (const arr of allResults) {
                for (const prod of arr) {
                    if (!uniqueIds.has(prod.id)) {
                        uniqueIds.add(prod.id);
                        results.push(prod);
                    }
                }
            }
            results = results.slice(0, 5);
        }
        else if (emotion?.intent === 'Browsing' || emotion?.intent === 'Buying') {
            results = await this.productService.searchProducts(messageText);
        }
        else {
            this.logger.debug(`Skipping database search for non-product intent: ${emotion?.intent}`);
        }
        if (results.length > 0) {
            this.redis.set(`last_product:${normalized.senderId}`, results[0].id, 3600);
            this.redis.set(`current_products:${normalized.senderId}`, JSON.stringify(results.map(p => p.id)), 3600);
        }
        this.cartService.handleCartLogic(ctx.customer.id, emotion, results);
        const aiResponse = await this.geminiResponse.generateSalesResponse(messageText, results, history, ctx.customer.preferences || '', false, emotion, agent?.model);
        const finalMsg = aiResponse.replace(/\[INTERNAL_HANDOFF\]/g, '').trim();
        await this.lifecycle.sendOptimizedResponse(pageId, normalized.senderId, finalMsg, ctx.token, ctx.conversation.id, platform);
        if ((await this.redis.incrementMessageCount(normalized.senderId)) % 5 === 0) {
            const profile = await this.geminiBehaviour.extractBehavioralProfile(history, ctx.customer.preferences || '');
            if (profile)
                await this.customerService.update(ctx.customer.id, { preferences: profile });
        }
    }
    async processVisualAgent(normalized, imageUrls, pageId, userText, platform, startTime) {
        await this.lifecycle.executeAgentLifecycle('Visual Agent', normalized.senderId, pageId, platform, userText || '(Image)', async (ctx) => {
            const agent = await this.aiAgentService.getActiveAgentByName('Visual Agent');
            const history = await this.redis.getHistory(normalized.senderId, 10);
            let allMatches = [];
            for (const url of imageUrls) {
                const buffer = (await (0, rxjs_1.lastValueFrom)(this.httpService.get(url, { responseType: 'arraybuffer', headers: { 'Authorization': `Bearer ${ctx.token}` } }))).data;
                const embedding = await this.geminiMultimodal.generateMultimodalEmbedding(userText || 'Analyze item', buffer, 'image/jpeg', agent?.model);
                const matches = await this.pinecone.query(embedding, 3);
                allMatches.push(...matches);
            }
            if (allMatches.length > 0) {
                const products = allMatches.sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 3).map(m => m.metadata);
                this.cartService.handleCartLogic(ctx.customer.id, {
                    product_interest: 'DISCUSSING',
                    intent: 'Browsing',
                    frustration_level: 0,
                    urgency: 'Low',
                    style: 'Detailed'
                }, products);
                const resp = await this.geminiResponse.generateSalesResponse(`Visual results for: ${userText}`, products, history, ctx.customer.preferences || '', false, null, agent?.model);
                await this.lifecycle.sendOptimizedResponse(pageId, normalized.senderId, resp, ctx.token, ctx.conversation.id, platform);
            }
            else {
                await this.metaApi.sendMessage(pageId, normalized.senderId, "I couldn't find a match for that image.", ctx.token);
            }
        });
    }
    async processVoiceAgent(normalized, audioUrl, pageId, platform) {
        await this.lifecycle.executeAgentLifecycle('Voice Agent', normalized.senderId, pageId, platform, '(Voice Message)', async (ctx) => {
            const agent = await this.aiAgentService.getActiveAgentByName('Voice Agent');
            const history = await this.redis.getHistory(normalized.senderId, 10);
            const buffer = (await (0, rxjs_1.lastValueFrom)(this.httpService.get(audioUrl, { responseType: 'arraybuffer', headers: { 'Authorization': `Bearer ${ctx.token}` } }))).data;
            const { response } = await this.geminiMultimodal.processAudioMessage(buffer, 'audio/mp4', [], history, ctx.customer.preferences || '', agent?.model);
            await this.lifecycle.sendOptimizedResponse(pageId, normalized.senderId, response, ctx.token, ctx.conversation.id, platform);
        });
    }
    async pauseAiForCustomer(customerId, durationMinutes = 30) {
        await this.redis.set(`admin_pause:${customerId}`, '1', durationMinutes * 60);
        this.logger.log(`🛑 AI paused for customer ${customerId} via Admin API for ${durationMinutes} mins`);
    }
    async resumeAiForCustomer(customerId) {
        await this.redis.del(`admin_pause:${customerId}`);
        this.logger.log(`▶️ AI resumed for customer ${customerId} via Admin API`);
    }
    async getToken(pageId, platform) {
        if (platform === 'WHATSAPP')
            return this.configService.get('WHATSAPP_ACCESS_TOKEN') || null;
        return this.lifecycle.getTokenOnly(pageId);
    }
    async processOrchestratedBatch(messages) {
        if (messages.length === 0)
            return;
        const firstMsg = messages[0];
        const { senderId, pageId, platform } = firstMsg;
        const validMessages = [];
        for (const msg of messages) {
            if (msg.referral?.ref) {
                const refText = `[SYSTEM: User arrived via referral link. Reference: ${msg.referral.ref}, Source: ${msg.referral.source || 'UNKNOWN'}]`;
                if (msg.message) {
                    msg.message.text = msg.message.text ? `${msg.message.text}\n\n${refText}` : refText;
                }
                else {
                    msg.message = { text: refText, is_echo: false };
                    msg.type = 'MESSAGE';
                }
            }
            if (msg.type !== 'MESSAGE' || !msg.message)
                continue;
            if (msg.message.is_echo) {
                this.normalizer.processEcho(msg);
                continue;
            }
            const messageId = msg.message.mid || `${senderId}:${Date.now()}`;
            const dedupKey = `dedup:${messageId}`;
            const isNew = await this.redis.setNX(dedupKey, '1', 300);
            if (!isNew)
                continue;
            validMessages.push(msg);
        }
        if (validMessages.length === 0)
            return;
        const [adminPause, lastMsgTsRaw] = await this.redis.pipeline()
            .get(`admin_pause:${senderId}`)
            .get(`last_msg_ts:${senderId}`)
            .exec();
        if (adminPause[1])
            return;
        const spam = await this.state.checkSpam(senderId);
        if (spam.blocked) {
            const token = await this.getToken(pageId, platform);
            if (token)
                await this.metaApi.sendMessage(pageId, senderId, spam.message || 'Blocked', token);
            return;
        }
        const requestStartTime = Date.now();
        const lastMsgTs = parseInt(lastMsgTsRaw[1] || '0');
        if (requestStartTime - lastMsgTs > 3600000)
            await this.redis.del(`order_session:${senderId}`);
        this.redis.set(`last_msg_ts:${senderId}`, requestStartTime.toString(), 86400);
        const imageMessages = [];
        const audioMessages = [];
        const textMessages = [];
        for (const msg of validMessages) {
            const m = msg.message;
            if (m.image) {
                imageMessages.push(msg);
            }
            else if (m.audio) {
                audioMessages.push(msg);
            }
            else if (m.text) {
                textMessages.push(msg);
            }
        }
        this.logger.log(`🧠 Orchestrator classified ${validMessages.length} messages: ${imageMessages.length} image, ${audioMessages.length} audio, ${textMessages.length} text`);
        const allUserTexts = textMessages.map(m => m.message.text).filter(Boolean);
        if (imageMessages.length > 0) {
            const allImageUrls = imageMessages.map(m => m.message.image).filter(Boolean);
            const extraContext = allUserTexts.length > 0
                ? allUserTexts.join('\n')
                : imageMessages[0].message.text || '';
            this.logger.log(`🎨 Visual Agent leads with ${allImageUrls.length} images + "${extraContext.slice(0, 50)}..."`);
            await this.processVisualAgent({ senderId, ...imageMessages[0] }, allImageUrls, pageId, extraContext, platform, requestStartTime);
            const imageRelatedPatterns = /\b(price|cost|dam|how much|size|color|details|eta|koto|ki|ache|dekhao)\b/i;
            const remainingTexts = textMessages.filter(m => !imageRelatedPatterns.test(m.message.text));
            textMessages.length = 0;
            textMessages.push(...remainingTexts);
        }
        if (audioMessages.length > 0) {
            this.logger.log(`🎤 Voice Agent processing ${audioMessages.length} audio messages`);
            for (const audioMsg of audioMessages) {
                await this.processVoiceAgent({ senderId, ...audioMsg }, audioMsg.message.audio, pageId, platform);
            }
        }
        if (textMessages.length > 0) {
            const combinedText = textMessages.map(m => m.message.text).join('\n');
            this.logger.log(`💬 Text Agent processing ${textMessages.length} message(s): "${combinedText.slice(0, 80)}..."`);
            const history = await this.redis.getHistory(senderId, 6);
            let intentState = this.router.detectIntentFastPath(combinedText, history);
            if (intentState.intent === 'Other')
                intentState.intent = await this.router.getHistoryIntentFallback(senderId);
            const carrier = textMessages[0];
            if (intentState.intent === 'Ordering' || intentState.intent === 'Buying') {
                await this.processOrderAgent({ senderId, ...carrier }, pageId, platform, combinedText);
            }
            else {
                await this.processTextAgent({ senderId, ...carrier }, pageId, platform, combinedText);
            }
        }
    }
};
exports.MetaWebhookService = MetaWebhookService;
exports.MetaWebhookService = MetaWebhookService = MetaWebhookService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService,
        webhook_normalizer_service_1.WebhookNormalizerService,
        webhook_state_service_1.WebhookStateService,
        intent_router_service_1.IntentRouterService,
        agent_lifecycle_service_1.AgentLifecycleService,
        order_logic_service_1.OrderLogicService,
        gemini_behaviour_service_1.GeminiBehaviourService,
        gemini_response_service_1.GeminiResponseService,
        gemini_multimodal_service_1.GeminiMultimodalService,
        redis_service_1.RedisService,
        product_service_1.ProductService,
        faq_service_1.FaqService,
        ai_agent_service_1.AiAgentService,
        pinecone_service_1.PineconeService,
        customer_service_1.CustomerService,
        cart_service_1.CartService,
        meta_api_service_1.MetaApiService,
        axios_1.HttpService])
], MetaWebhookService);
//# sourceMappingURL=meta-webhook.service.js.map