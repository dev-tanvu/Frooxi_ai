import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WebhookNormalizerService } from './webhook-normalizer.service';
import { WebhookStateService } from './webhook-state.service';
import { IntentRouterService } from './intent-router.service';
import { AgentLifecycleService } from './agent-lifecycle.service';
import { OrderLogicService } from './order-logic.service';
import { GeminiBehaviourService } from '../ai/gemini-behaviour.service';
import { GeminiResponseService } from '../ai/gemini-response.service';
import { GeminiMultimodalService } from '../ai/gemini-multimodal.service';
import { RedisService } from '../redis/redis.service';
import { ProductService } from '../product/product.service';
import { FaqService } from '../faq/faq.service';
import { AiAgentService } from '../ai-agent/ai-agent.service';
import { PineconeService } from '../ai/pinecone.service';
import { CustomerService } from '../customer/customer.service';
import { CartService } from '../cart/cart.service';
import { MetaApiService } from './meta-api.service';
import { HttpService } from '@nestjs/axios';
import { lastValueFrom } from 'rxjs';

@Injectable()
export class MetaWebhookService {
    private readonly logger = new Logger(MetaWebhookService.name);
    private readonly appId: string;

    constructor(
        private configService: ConfigService,
        private normalizer: WebhookNormalizerService,
        private state: WebhookStateService,
        private router: IntentRouterService,
        private lifecycle: AgentLifecycleService,
        private orderLogic: OrderLogicService,
        private geminiBehaviour: GeminiBehaviourService,
        private geminiResponse: GeminiResponseService,
        private geminiMultimodal: GeminiMultimodalService,
        private redis: RedisService,
        private productService: ProductService,
        private faqService: FaqService,
        private aiAgentService: AiAgentService,
        private pinecone: PineconeService,
        private customerService: CustomerService,
        private cartService: CartService,
        private metaApi: MetaApiService,
        private httpService: HttpService,
    ) {
        this.appId = this.configService.get<string>('META_APP_ID') || '';
    }

    async handleWebhookEvent(event: any) {
        const objectType = event.objectType || 'page';
        let normalized = (objectType === 'whatsapp_business' || objectType === 'whatsapp_business_account')
            ? await this.normalizer.normalizeWhatsAppEvent(event)
            : this.normalizer.normalizeMessengerEvent(event);

        if (!normalized) return;

        const { senderId, pageId, message, platform, type, referral } = normalized as any;

        if (referral && referral.ref) {
            const refText = `[SYSTEM: User arrived via referral link. Reference: ${referral.ref}, Source: ${referral.source || 'UNKNOWN'}]`;
            if (message) {
                message.text = message.text ? `${message.text}\n\n${refText}` : refText;
            } else {
                normalized.message = { text: refText, is_echo: false } as any;
                normalized.type = 'MESSAGE';
            }
        }
        
        // This service method primarily handles conversation logic (Text/Visual/Order agents)
        if (normalized.type !== 'MESSAGE') return;
        if (!normalized.message) return;

        const actualMessage = normalized.message;

        const requestStartTime = Date.now();

        if (actualMessage.is_echo) return this.normalizer.processEcho(normalized);

        // ⚡ PERF: Single pipeline for dedup + state checks (1 round-trip instead of 2)
        const messageId = actualMessage.mid || `${senderId}:${requestStartTime}`;
        const dedupKey = `dedup:${messageId}`;
        
        const [dedupResult, adminPause, , lastMsgTsRaw] = await this.redis.pipeline()
            .set(dedupKey, '1', 'EX', 300, 'NX')  // dedup check
            .get(`admin_pause:${senderId}`)
            .get(`spam_block:${senderId}`)
            .get(`last_msg_ts:${senderId}`)
            .exec() as any[];

        // Dedup: if SET NX returned null, it already existed
        if (dedupResult[1] !== 'OK') {
            this.logger.debug(`Skipping duplicate webhook event for message ${messageId}`);
            return;
        }

        if (adminPause[1]) return; // Admin paused

        // Spam Check (P5 via WebhookStateService)
        const spam = await this.state.checkSpam(senderId);
        if (spam.blocked) {
            const token = await this.getToken(pageId, platform);
            if (token) await this.metaApi.sendMessage(pageId, senderId, spam.message || 'Blocked', token);
            return;
        }

        // Session reset logic
        const lastMsgTs = parseInt(lastMsgTsRaw[1] || '0');
        if (requestStartTime - lastMsgTs > 3600000) await this.redis.del(`order_session:${senderId}`);
        // ⚡ PERF: Fire-and-forget timestamp update
        this.redis.set(`last_msg_ts:${senderId}`, requestStartTime.toString(), 86400);

        // Routing
        if (actualMessage.image) {
            this.processVisualAgent(normalized, [actualMessage.image], pageId, actualMessage.text || '', platform, requestStartTime);
        } else if (actualMessage.audio) {
            this.processVoiceAgent(normalized, actualMessage.audio, pageId, platform);
        } else {
            const history = await this.redis.getHistory(senderId, 6);
            let intentState = this.router.detectIntentFastPath(actualMessage.text || '', history);
            if (intentState.intent === 'Other') intentState.intent = await this.router.getHistoryIntentFallback(senderId);

            if (intentState.intent === 'Ordering' || intentState.intent === 'Buying') {
                this.processOrderAgent(normalized, pageId, platform, actualMessage.text || '');
            } else {
                this.processTextAgent(normalized, pageId, platform, actualMessage.text || '');
            }
        }
    }

    private async processOrderAgent(normalized: any, pageId: string, platform: any, messageText: string) {
        await this.lifecycle.executeAgentLifecycle('Order Agent', normalized.senderId, pageId, platform, messageText, async (ctx) => {
            await this.handleOrderAgentLogic(normalized, pageId, platform, messageText, ctx);
        });
    }

    private async handleOrderAgentLogic(normalized: any, pageId: string, platform: any, messageText: string, ctx: any) {
        const agent = await this.aiAgentService.getActiveAgentByName('Order Agent');
        const history = await this.redis.getHistory(normalized.senderId, 15);

        let productContext: any[] = [];
        const [session, currentProductIdsStr, lastProductId] = await Promise.all([
            this.redis.get(`order_session:${normalized.senderId}`),
            this.redis.get(`current_products:${normalized.senderId}`),
            this.redis.get(`last_product:${normalized.senderId}`)
        ]);

        const idsToFetch = new Set<string>();
        if (session) idsToFetch.add(JSON.parse(session).productId);
        if (lastProductId) idsToFetch.add(lastProductId);
        if (currentProductIdsStr) {
            const ids = JSON.parse(currentProductIdsStr);
            ids.forEach((id: string) => idsToFetch.add(id));
        }

        if (idsToFetch.size > 0) {
            const products = await Promise.all(Array.from(idsToFetch).map(id => this.productService.findOne(id)));
            productContext = products.filter(p => !!p).map(p => this.orderLogic.buildProductContext(p));
        }

        const { text: aiResponse, toolCalls } = await this.geminiResponse.generateOrderResponse(messageText, productContext, history, ctx.customer.preferences, agent?.model);

        let handledByToolResponse = false;
        let isDraftUpdated = false;

        // 1. Process Tool Calls (Function Calling)
        if (toolCalls && toolCalls.length > 0) {
            for (const call of toolCalls) {
                const { success, error, response: toolText } = await this.orderLogic.handleToolCall(call, ctx.customer.id);
                
                if (success) {
                    if (call.name === 'update_order_draft') {
                        isDraftUpdated = true;
                        const pId = call.args?.productId || lastProductId;
                        await this.redis.set(`order_session:${normalized.senderId}`, JSON.stringify({ productId: pId }), 3600);
                    } else if (call.name === 'place_order') {
                        await this.redis.del(`order_session:${normalized.senderId}`);
                    }

                    if (toolText) {
                        await this.lifecycle.sendOptimizedResponse(pageId, normalized.senderId, toolText, ctx.token, ctx.conversation.id, platform);
                        handledByToolResponse = true;
                    }
                } else if (!success && error) {
                    this.logger.error(`❌ Tool execution failed for ${normalized.senderId}: ${error}`);
                }
            }
        }

        // 2. Handle Text Response (The dialogue part)
        if (aiResponse && aiResponse.trim() !== '') {
            // INTERNAL HANDOFF: If the order agent realizes it is the wrong agent, hand off to text agent
            if (aiResponse.includes('[INTERNAL_HANDOFF]')) {
                this.logger.debug(`🔄 Internal handoff from Order Agent for ${normalized.senderId}`);
                return this.handleTextAgentLogic(normalized, pageId, platform, messageText, ctx);
            }

            await this.lifecycle.sendOptimizedResponse(pageId, normalized.senderId, aiResponse, ctx.token, ctx.conversation.id, platform);
        } else if (toolCalls && toolCalls.some((c: any) => c.name === 'update_order_draft') && !handledByToolResponse) {
            // AI frequently fails to provide a conversational text response when emitting tool calls.
            // If it omitted it, provide a programmatic fallback asking for the next missing piece of info.
            const fallbackResponse = await this.orderLogic.generateDraftStatusResponse(ctx.customer.id);
            await this.lifecycle.sendOptimizedResponse(pageId, normalized.senderId, fallbackResponse, ctx.token, ctx.conversation.id, platform);
        }

        // 3. Legacy Fallback (Optional, but kept safe for now)
        if (aiResponse && aiResponse.includes('[ORDER_READY:')) {
             const { success } = await this.orderLogic.extractAndProcessOrder(aiResponse, ctx.customer.id);
             if (success) {
                 await this.redis.del(`order_session:${normalized.senderId}`);
                 await this.lifecycle.sendOptimizedResponse(pageId, normalized.senderId, "✅ Your order has been placed! (Legacy Tag Detection)", ctx.token, ctx.conversation.id, platform);
             }
        }
    }

    private async processTextAgent(normalized: any, pageId: string, platform: any, messageText: string) {
        await this.lifecycle.executeAgentLifecycle('Text Agent', normalized.senderId, pageId, platform, messageText, async (ctx) => {
            await this.handleTextAgentLogic(normalized, pageId, platform, messageText, ctx);
        });
    }

    private async handleTextAgentLogic(normalized: any, pageId: string, platform: any, messageText: string, ctx: any) {
        const [agent, history] = await Promise.all([
            this.aiAgentService.getActiveAgentByName('Text Agent'),
            this.redis.getHistory(normalized.senderId, 10)
        ]);

        // FAQ
        const cats: any = { 'Business Info': ['hours', 'location'], 'Shipping': ['delivery', 'fee'] };
        for (const [k, v] of Object.entries(cats)) {
            if ((v as string[]).some((kw: string) => messageText.toLowerCase().includes(kw))) {
                const match = await this.faqService.findFaqMatch(messageText, k);
                if (match) {
                    const resp = this.faqService.getFaqResponse(match, ctx.customer.name!);
                    await this.lifecycle.sendOptimizedResponse(pageId, normalized.senderId, resp, ctx.token, ctx.conversation.id, platform);
                    return;
                }
            }
        }

        // 1. Analyze intent first (Lightning fast with flash-lite)
        const emotion = await this.geminiBehaviour.analyzeEmotionAndIntent(messageText, history, 'gemini-2.0-flash');

        let results: any[] = [];

        // 2. Smart RAG: ONLY search the database if the AI detected product search queries
        if (emotion?.search_queries && emotion.search_queries.length > 0) {
            this.logger.debug(`Detected product queries: ${emotion.search_queries.join(', ')}`);
            // Search for the exact items the AI intelligently extracted
            const searchPromises = emotion.search_queries.map((q: string) => this.productService.searchProducts(q));
            const allResults = await Promise.all(searchPromises);

            // Flatten and deduplicate matching context
            const uniqueIds = new Set();
            for (const arr of allResults) {
                for (const prod of arr) {
                    if (!uniqueIds.has(prod.id)) {
                        uniqueIds.add(prod.id);
                        results.push(prod);
                    }
                }
            }
            results = results.slice(0, 5); // Limit injected products context
        } else if (emotion?.intent === 'Browsing' || emotion?.intent === 'Buying') {
            // Fallback: If it thinks they are browsing but no queries extracted, use raw text
            results = await this.productService.searchProducts(messageText);
        } else {
            this.logger.debug(`Skipping database search for non-product intent: ${emotion?.intent}`);
        }

        if (results.length > 0) {
            // ⚡ PERF: Fire-and-forget product context caching
            this.redis.set(`last_product:${normalized.senderId}`, results[0].id, 3600);
            this.redis.set(`current_products:${normalized.senderId}`, JSON.stringify(results.map(p => p.id)), 3600);
        }

        // SMART CART: Parallel, non-blocking cart logic
        this.cartService.handleCartLogic(ctx.customer.id, emotion, results);

        const aiResponse = await this.geminiResponse.generateSalesResponse(messageText, results, history, ctx.customer.preferences || '', false, emotion, agent?.model);

        // If the AI somehow included the tag (shouldn't happen for sales but just in case)
        const finalMsg = aiResponse.replace(/\[INTERNAL_HANDOFF\]/g, '').trim();
        await this.lifecycle.sendOptimizedResponse(pageId, normalized.senderId, finalMsg, ctx.token, ctx.conversation.id, platform);

        if ((await this.redis.incrementMessageCount(normalized.senderId)) % 5 === 0) {
            const profile = await this.geminiBehaviour.extractBehavioralProfile(history, ctx.customer.preferences || '');
            if (profile) await this.customerService.update(ctx.customer.id, { preferences: profile });
        }
    }

    private async processVisualAgent(normalized: any, imageUrls: string[], pageId: string, userText: string, platform: any, startTime: number) {
        await this.lifecycle.executeAgentLifecycle('Visual Agent', normalized.senderId, pageId, platform, userText || '(Image)', async (ctx) => {
            const agent = await this.aiAgentService.getActiveAgentByName('Visual Agent');
            const history = await this.redis.getHistory(normalized.senderId, 10);

            let allMatches = [];
            for (const url of imageUrls) {
                const buffer = (await lastValueFrom(this.httpService.get(url, { responseType: 'arraybuffer', headers: { 'Authorization': `Bearer ${ctx.token}` } }))).data;
                const embedding = await this.geminiMultimodal.generateMultimodalEmbedding(userText || 'Analyze item', buffer, 'image/jpeg', agent?.model);
                const matches = await this.pinecone.query(embedding, 3);
                allMatches.push(...matches);
            }

            if (allMatches.length > 0) {
                const products = allMatches.sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 3).map(m => m.metadata);
                
                // SMART CART: Potential Interest detection for Visual search
                this.cartService.handleCartLogic(ctx.customer.id, { 
                    product_interest: 'DISCUSSING', 
                    intent: 'Browsing',
                    frustration_level: 0,
                    urgency: 'Low',
                    style: 'Detailed'
                }, products);

                const resp = await this.geminiResponse.generateSalesResponse(`Visual results for: ${userText}`, products, history, ctx.customer.preferences || '', false, null, agent?.model);
                await this.lifecycle.sendOptimizedResponse(pageId, normalized.senderId, resp, ctx.token, ctx.conversation.id, platform);
            } else {
                await this.metaApi.sendMessage(pageId, normalized.senderId, "I couldn't find a match for that image.", ctx.token);
            }
        });
    }

    private async processVoiceAgent(normalized: any, audioUrl: string, pageId: string, platform: any) {
        await this.lifecycle.executeAgentLifecycle('Voice Agent', normalized.senderId, pageId, platform, '(Voice Message)', async (ctx) => {
            const agent = await this.aiAgentService.getActiveAgentByName('Voice Agent');
            const history = await this.redis.getHistory(normalized.senderId, 10);
            const buffer = (await lastValueFrom(this.httpService.get(audioUrl, { responseType: 'arraybuffer', headers: { 'Authorization': `Bearer ${ctx.token}` } }))).data;

            const { response } = await this.geminiMultimodal.processAudioMessage(buffer, 'audio/mp4', [], history, ctx.customer.preferences || '', agent?.model);
            await this.lifecycle.sendOptimizedResponse(pageId, normalized.senderId, response, ctx.token, ctx.conversation.id, platform);
        });
    }

    public async pauseAiForCustomer(customerId: string, durationMinutes: number = 30) {
        await this.redis.set(`admin_pause:${customerId}`, '1', durationMinutes * 60);
        this.logger.log(`🛑 AI paused for customer ${customerId} via Admin API for ${durationMinutes} mins`);
    }

    public async resumeAiForCustomer(customerId: string) {
        await this.redis.del(`admin_pause:${customerId}`);
        this.logger.log(`▶️ AI resumed for customer ${customerId} via Admin API`);
    }

    private async getToken(pageId: string, platform: string): Promise<string | null> {
        if (platform === 'WHATSAPP') return this.configService.get<string>('WHATSAPP_ACCESS_TOKEN') || null;
        return this.lifecycle.getTokenOnly(pageId);
    }

    // ===================================================================
    // 🧠 ORCHESTRATOR: Process a batch of buffered messages intelligently
    // ===================================================================

    /**
     * Receives ALL buffered messages for a user and processes them as a coordinated batch.
     * 
     * Classification logic:
     * - If any message has an IMAGE → Visual Agent leads (gets text context too)
     * - If any message has AUDIO → Voice Agent leads
     * - Multiple text messages → Combined into a single prompt for the appropriate agent
     * 
     * Cross-agent awareness: Agents run sequentially. The conversation history
     * naturally provides context (what was already answered) to subsequent agents.
     */
    public async processOrchestratedBatch(messages: any[]) {
        if (messages.length === 0) return;

        // Use the first message for common metadata
        const firstMsg = messages[0];
        const { senderId, pageId, platform } = firstMsg;

        // ===== Pre-processing: referrals, echoes, dedup, spam =====
        const validMessages: any[] = [];
        for (const msg of messages) {
            // Inject referral context
            if (msg.referral?.ref) {
                const refText = `[SYSTEM: User arrived via referral link. Reference: ${msg.referral.ref}, Source: ${msg.referral.source || 'UNKNOWN'}]`;
                if (msg.message) {
                    msg.message.text = msg.message.text ? `${msg.message.text}\n\n${refText}` : refText;
                } else {
                    msg.message = { text: refText, is_echo: false };
                    msg.type = 'MESSAGE';
                }
            }

            if (msg.type !== 'MESSAGE' || !msg.message) continue;
            if (msg.message.is_echo) {
                this.normalizer.processEcho(msg);
                continue;
            }

            // Dedup check
            const messageId = msg.message.mid || `${senderId}:${Date.now()}`;
            const dedupKey = `dedup:${messageId}`;
            const isNew = await this.redis.setNX(dedupKey, '1', 300);
            if (!isNew) continue;

            validMessages.push(msg);
        }

        if (validMessages.length === 0) return;

        // ===== State checks (admin pause, spam) =====
        const [adminPause, lastMsgTsRaw] = await this.redis.pipeline()
            .get(`admin_pause:${senderId}`)
            .get(`last_msg_ts:${senderId}`)
            .exec() as any[];

        if (adminPause[1]) return;

        const spam = await this.state.checkSpam(senderId);
        if (spam.blocked) {
            const token = await this.getToken(pageId, platform);
            if (token) await this.metaApi.sendMessage(pageId, senderId, spam.message || 'Blocked', token);
            return;
        }

        // Session reset
        const requestStartTime = Date.now();
        const lastMsgTs = parseInt(lastMsgTsRaw[1] || '0');
        if (requestStartTime - lastMsgTs > 3600000) await this.redis.del(`order_session:${senderId}`);
        this.redis.set(`last_msg_ts:${senderId}`, requestStartTime.toString(), 86400);

        // ===== CLASSIFY MESSAGES =====
        const imageMessages: any[] = [];
        const audioMessages: any[] = [];
        const textMessages: any[] = [];

        for (const msg of validMessages) {
            const m = msg.message;
            if (m.image) {
                imageMessages.push(msg);
            } else if (m.audio) {
                audioMessages.push(msg);
            } else if (m.text) {
                textMessages.push(msg);
            }
        }

        this.logger.log(`🧠 Orchestrator classified ${validMessages.length} messages: ${imageMessages.length} image, ${audioMessages.length} audio, ${textMessages.length} text`);

        // Collect all user text (used as extra context for Visual/Audio agents)
        const allUserTexts = textMessages.map(m => m.message.text).filter(Boolean);

        // ===== EXECUTE AGENTS IN ORDER =====

        // 1. VISUAL AGENT (takes priority — user sent an image)
        if (imageMessages.length > 0) {
            const allImageUrls = imageMessages.map(m => m.message.image).filter(Boolean);
            // Combine any text messages as extra context for the visual agent
            const extraContext = allUserTexts.length > 0
                ? allUserTexts.join('\n')
                : imageMessages[0].message.text || '';

            this.logger.log(`🎨 Visual Agent leads with ${allImageUrls.length} images + "${extraContext.slice(0, 50)}..."`);
            await this.processVisualAgent(
                { senderId, ...imageMessages[0] },
                allImageUrls,
                pageId,
                extraContext,
                platform,
                requestStartTime
            );

            // If text messages were purely about the image (price?, details?), they've been
            // consumed as context. Clear them so they don't re-trigger the Text Agent.
            // The Text Agent will only run for genuinely different topics.
            const imageRelatedPatterns = /\b(price|cost|dam|how much|size|color|details|eta|koto|ki|ache|dekhao)\b/i;
            const remainingTexts = textMessages.filter(m => !imageRelatedPatterns.test(m.message.text));
            textMessages.length = 0;
            textMessages.push(...remainingTexts);
        }

        // 2. AUDIO/VOICE AGENT
        if (audioMessages.length > 0) {
            this.logger.log(`🎤 Voice Agent processing ${audioMessages.length} audio messages`);
            for (const audioMsg of audioMessages) {
                await this.processVoiceAgent(
                    { senderId, ...audioMsg },
                    audioMsg.message.audio,
                    pageId,
                    platform
                );
            }
        }

        // 3. TEXT AGENT (handles remaining text messages that weren't consumed by Visual)
        if (textMessages.length > 0) {
            // Combine multiple text messages into a single input
            const combinedText = textMessages.map(m => m.message.text).join('\n');
            this.logger.log(`💬 Text Agent processing ${textMessages.length} message(s): "${combinedText.slice(0, 80)}..."`);

            const history = await this.redis.getHistory(senderId, 6);
            let intentState = this.router.detectIntentFastPath(combinedText, history);
            if (intentState.intent === 'Other') intentState.intent = await this.router.getHistoryIntentFallback(senderId);

            // Use the first text message's normalized data as the carrier
            const carrier = textMessages[0];

            if (intentState.intent === 'Ordering' || intentState.intent === 'Buying') {
                await this.processOrderAgent(
                    { senderId, ...carrier },
                    pageId,
                    platform,
                    combinedText
                );
            } else {
                await this.processTextAgent(
                    { senderId, ...carrier },
                    pageId,
                    platform,
                    combinedText
                );
            }
        }
    }
}
