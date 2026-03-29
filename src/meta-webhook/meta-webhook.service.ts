import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { GeminiService, EmotionState } from '../ai/gemini.service';
import { MetaApiService } from './meta-api.service';
import { RedisService } from '../redis/redis.service';
import { PineconeService } from '../ai/pinecone.service';
import { HttpService } from '@nestjs/axios';
import { lastValueFrom } from 'rxjs';
import { ProductService } from '../product/product.service';
import { OrderService } from '../order/order.service';
import { CustomerService } from '../customer/customer.service';
import { FaqService } from '../faq/faq.service';
import { AiAgentService } from '../ai-agent/ai-agent.service';
import { SettingsService } from '../settings/settings.service';
import { EncryptionService } from '../common/encryption.service';

@Injectable()
export class MetaWebhookService {
    private readonly logger = new Logger(MetaWebhookService.name);
    private readonly appId: string;
    private aiAgentTableMissingWarned = false;

    // Maps customerId to a timestamp when the AI should be allowed to talk again
    private adminOverrides = new Map<string, number>();
    private readonly OVERRIDE_DURATION = 30 * 60 * 1000; // 30 minutes
    private typingHeartbeats = new Map<string, any>();
    private lastUserMessageTimestamp = new Map<string, number>();
    private readonly CONFIDENCE_THRESHOLD = 0.75;

    // ======== CONCURRENCY GUARD ========
    private activeAiTasks = 0;
    private readonly MAX_CONCURRENT_TASKS = 50;
    private readonly MAX_QUEUE_SIZE = 200;
    private waitingQueue: Array<{ resolve: () => void; senderId: string }> = [];

    public pauseAiForCustomer(customerId: string, durationMinutes: number = 30) {
        this.adminOverrides.set(customerId, Date.now() + durationMinutes * 60 * 1000);
        this.logger.log(`🛑 AI paused for customer ${customerId} via Admin API for ${durationMinutes} mins`);
    }

    public resumeAiForCustomer(customerId: string) {
        this.adminOverrides.delete(customerId);
        this.logger.log(`▶️ AI resumed for customer ${customerId} via Admin API`);
    }

    constructor(
        private configService: ConfigService,
        private prisma: PrismaService,
        private gemini: GeminiService,
        private metaApi: MetaApiService,
        private redis: RedisService,
        private pinecone: PineconeService,
        private httpService: HttpService,
        private productService: ProductService,
        private orderService: OrderService,
        private customerService: CustomerService,
        private faqService: FaqService,
        private aiAgentService: AiAgentService,
        private settingsService: SettingsService,
        private encryption: EncryptionService,
    ) {
        this.appId = this.configService.get<string>('META_APP_ID') || '';
    }

    /**
     * CONCURRENCY GUARD: Acquire a processing slot
     * Prevents OOM crashes by strictly limiting concurrent AI requests.
     */
    private async acquireAiSlot(senderId: string, pageId: string, pageAccessToken: string): Promise<void> {
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
        
        // Let the user know they are in a queue
        const queueMsg = "We're experiencing unusually high traffic! You're in a short queue, I'll reply in just a moment... ⏳";
        this.metaApi.sendMessage(pageId, senderId, queueMsg, pageAccessToken).catch(() => {});

        return new Promise((resolve) => {
            this.waitingQueue.push({ resolve, senderId });
        });
    }

    /**
     * CONCURRENCY GUARD: Release a processing slot
     */
    private releaseAiSlot(senderId: string) {
        if (this.waitingQueue.length > 0) {
            const next = this.waitingQueue.shift();
            if (next) {
                this.logger.log(`🚦 Slot transferred from ${senderId} to ${next.senderId}. Queue remaining: ${this.waitingQueue.length}`);
                next.resolve();
            }
        } else {
            this.activeAiTasks = Math.max(0, this.activeAiTasks - 1);
            this.logger.log(`🚦 Slot released by ${senderId}. Active tasks: ${this.activeAiTasks}/${this.MAX_CONCURRENT_TASKS}`);
        }
    }

    async handleWebhookEvent(event: any) {
        // Detect platform from entry object (attached by controller)
        const objectType = event.objectType || 'page';
        
        let normalized: any;
        if (objectType === 'whatsapp_business' || objectType === 'whatsapp_business_account') {
            normalized = await this.normalizeWhatsAppEvent(event);
        } else {
            normalized = this.normalizeMessengerEvent(event);
        }

        if (!normalized) return;

        const { senderId, pageId, message, platform } = normalized;
        const requestStartTime = Date.now();

        // ======== STEP 1: ECHO CHECK (instant) ========
        if (message.is_echo) {
            if (platform === 'WHATSAPP') return;
            const echoAppId = message.app_id?.toString();
            if (echoAppId === this.appId) return;
            return this.processEcho(event.messaging[0], pageId);
        }

        // ======== STEP 2: TOKEN RESOLUTION ========
        const envWaid = this.configService.get<string>('WHATSAPP_PHONE_NUMBER_ID') || '';
        const envToken = this.configService.get<string>('WHATSAPP_ACCESS_TOKEN');
        let token = null;

        if (platform === 'WHATSAPP' && (pageId === envWaid || !pageId) && envToken) {
            token = envToken;
        } else {
            const integration = await this.prisma.metaIntegration.findUnique({ where: { pageId } }).catch(() => null);
            token = integration ? this.encryption.decrypt(integration.pageAccessToken) : null;
        }

        // ======== STEP 3: TYPING + SPAM ========
        const spamResult = await this.checkSpam(senderId);
        if (token && (platform === 'MESSENGER' || platform === 'INSTAGRAM')) {
            this.metaApi.markSeen(pageId, senderId, token).catch(() => {});
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

        // ======== STEP 4: ADMIN OVERRIDE ========
        const lockTime = this.adminOverrides.get(senderId);
        if (lockTime && Date.now() < lockTime) {
            this.stopTypingHeartbeat(senderId);
            return;
        }

        // ======== STEP 5: THE ADVANCED SPLITTER (Head Agent / Router) ========
        const hasImage = !!message.image;
        const hasAudio = !!message.audio;
        const messageText = message.text || '';

        // 5a. Conversation Recency Check
        const lastTimestamp = this.lastUserMessageTimestamp.get(senderId) || 0;
        const timeSinceLastMessage = requestStartTime - lastTimestamp;
        const FRESH_CONVERSATION_THRESHOLD = 1 * 60 * 60 * 1000; // 1 hour
        const isFreshConversation = timeSinceLastMessage > FRESH_CONVERSATION_THRESHOLD;
        this.lastUserMessageTimestamp.set(senderId, requestStartTime);

        if (isFreshConversation) {
            this.logger.log(`🆕 Fresh conversation detected for ${senderId} (${Math.round(timeSinceLastMessage / 60000)}m gap). Clearing stale context.`);
            await this.redis.del(`order_session:${senderId}`).catch(() => {});
        }

        // 5b. Intent Detection (centralized — runs ONCE for all agents)
        let intent: string = 'Other';
        
        if (!hasImage && !hasAudio && messageText) {
            // Check context from history for ongoing flows
            const history = await this.redis.getHistory(senderId, 2);

            // Fast-path intent for text messages
            const fastIntent = this.detectIntentFastPath(messageText, history);
            intent = fastIntent.intent;
            
            // If fast-path is unclear, check Redis for active order session
            if (intent === 'Other') {
                const orderSession = await this.redis.get(`order_session:${senderId}`);
                if (orderSession) {
                    intent = 'Ordering';
                    this.logger.log(`📦 Active order session found for ${senderId}. Routing to Order Agent.`);
                }
            }
        }

        this.logger.log(`🧠 HEAD AGENT DECISION [${platform}]: senderId=${senderId} | intent=${intent} | hasImage=${hasImage} | hasAudio=${hasAudio} | fresh=${isFreshConversation}`);

        // ======== STEP 6: AGENT AVAILABILITY + ROUTING ========
        const mockMessaging = { sender: { id: senderId } };

        // Route 1: ORDER AGENT (Buying/Ordering intent on text messages)
        if ((intent === 'Buying' || intent === 'Ordering') && !hasImage && !hasAudio) {
            const orderAgentActive = await this.isAgentActive('Order Agent');
            if (!orderAgentActive) {
                // Fallback to Text Agent if Order Agent is off
                this.logger.warn(`⚠️ Order Agent is OFF. Falling back to Text Agent for ${senderId}.`);
            } else {
                this.logger.log(`📦 ROUTING → Order Agent for ${senderId}`);
                this.processOrderAgent(mockMessaging, pageId, platform, messageText).catch(err => {
                    this.logger.error(`❌ Order Agent Error: ${err.message}`);
                });
                return;
            }
        }

        // Route 2: VISUAL AGENT (has image)
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

        // Route 3: VOICE AGENT (has audio)
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

        // Route 4: TEXT AGENT (default — info only)
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

    private normalizeMessengerEvent(event: any) {
        const messaging = event.messaging?.[0];
        if (!messaging) return null;

        // Ignore read, delivery, and typing events
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
                image: attachments.find((a: any) => a.type === 'image')?.payload?.url,
                audio: attachments.find((a: any) => a.type === 'audio')?.payload?.url,
                audioDuration: attachments.find((a: any) => a.type === 'audio')?.payload?.duration || 0,
                is_echo: message.is_echo,
                app_id: message.app_id,
                type: 'text' // Assuming messenger messages are text unless specified
            }
        };
    }

    private async normalizeWhatsAppEvent(event: any) {
        const changes = event.changes?.[0]?.value;
        const waMessage = changes?.messages?.[0];
        if (!waMessage) return null;

        const senderId = waMessage.from;
        const pageId = changes.metadata?.phone_number_id;
        const platform = 'WHATSAPP';
        const envWaid = this.configService.get<string>('WHATSAPP_PHONE_NUMBER_ID') || '';
        const envToken = this.configService.get<string>('WHATSAPP_ACCESS_TOKEN');
        
        let token = null;

        // PRIORITIZE .env Token for WhatsApp to allow instant updates without DB migration issues
        if (platform === 'WHATSAPP' && (pageId === envWaid || !pageId) && envToken) {
            token = envToken;
            this.logger.log(`🔄 Using prioritized WhatsApp environment credentials for Page ID: ${pageId || 'global'}`);
        } else {
            let integration = null;
            try {
                integration = await this.prisma.metaIntegration.findUnique({ where: { pageId } });
            } catch (dbError) {
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
                image: '' as string,
                audio: '' as string,
                audioDuration: 0,
                is_echo: false,
                type: waMessage.type
            }
        };

        // Extract Text vs Caption
        if (waMessage.type === 'text') {
            normalized.message.text = waMessage.text?.body || '';
        } else if (waMessage.image?.caption) {
            normalized.message.text = waMessage.image.caption;
        } else if (waMessage.video?.caption) {
            normalized.message.text = waMessage.video.caption;
        } else if (waMessage.document?.caption) {
            normalized.message.text = waMessage.document.caption;
        }

        // Use direct URL if available (Messenger-style)
        if (waMessage.type === 'image' && waMessage.image?.url) {
            normalized.message.image = waMessage.image.url;
            this.logger.log(`🖼️ Using direct WhatsApp image URL from webhook.`);
        } else if (waMessage.type === 'audio' && waMessage.audio?.url) {
            normalized.message.audio = waMessage.audio.url;
            this.logger.log(`🎙️ Using direct WhatsApp audio URL from webhook.`);
        } 
        // Fallback: Resolve Media IDs if present
        else if (waMessage.type === 'image' && waMessage.image?.id && token) {
            normalized.message.image = await this.metaApi.getWhatsAppMediaUrl(waMessage.image.id, token);
        } else if (waMessage.type === 'audio' && waMessage.audio?.id && token) {
            normalized.message.audio = await this.metaApi.getWhatsAppMediaUrl(waMessage.audio.id, token);
        }

        return normalized;
    }

    private async sendDirectPlatformResponse(platform: string, pageId: string, senderId: string, text: string, token: string) {
        if (platform === 'WHATSAPP') {
            return this.metaApi.sendWhatsAppMessage(pageId, senderId, text, token);
        } else {
            return this.metaApi.sendMessage(pageId, senderId, text, token);
        }
    }

    /**
     * SPAM CHECK — Unified check for all agents (in-memory, instant)
     * Returns blocked status + message to send if blocked
     */
    private async checkSpam(senderId: string): Promise<{ blocked: boolean; reason: string; message: string }> {
        // Ensure user is not globally blocked via DB settings
        const settings = await this.settingsService.getSpamProtectionSettings();
        const spamWarningStr = "⚠️ You've been temporarily blocked due to excessive messaging. Please wait and try again later.";
        const maxMessages = settings.maxRequestsPer30Seconds || 5;
        const blockDuration = (settings.blockDuration || 10) * 60 * 1000; // Convert minutes to milliseconds
        const timeWindow = 30 * 1000; // 30 seconds

        // Check active block
        if (this.spamBlocks.has(senderId)) {
            const blockUntil = this.spamBlocks.get(senderId)!;
            if (Date.now() < blockUntil) {
                const minutesLeft = Math.ceil((blockUntil - Date.now()) / (60 * 1000));
                return {
                    blocked: true,
                    reason: `Blocked for ${minutesLeft}m`,
                    message: `⚠️ You are currently blocked for ${minutesLeft} more minute(s) due to spamming.`
                };
            } else {
                this.spamBlocks.delete(senderId);
                this.userMessageTimestamps.delete(senderId);
            }
        }

        // Count recent messages
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

    /**
     * FAST PATH: Rule-based intent detection for 80% of common cases
     * Eliminates AI calls for simple, predictable patterns
     */
    private detectIntentFastPath(messageText: string, history: string[]): EmotionState {
        const text = messageText.toLowerCase().trim();
        
        // Context-aware overriding based on the AI's last message
        if (history && history.length > 0) {
            const lastMessage = history[history.length - 1];
            // If the AI just asked to start an order, force parsing of the user's response as Ordering
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
        
        // High-confidence patterns (80% of cases)
        const patterns = {
            // Greeting intent (handle simple greetings)
            greeting: [
                /^(hi|hello|hey|good morning|good afternoon|good evening|yo|sup|what's up)/i,
                /^(how are you|howdy|greetings|namaste|salam)/i
            ],
            
            // Buying/Ordering intent
            buying: [
                /^(buy|order|want|need|get|take)\s+(this|it|one|that|some)/i,
                /\b(how much|price|cost)\b.*\?/i,
                /\b(size|color|in stock)\b.*\?/i,
                /\b(delivery|shipping) (fee|cost|time|charges)\b/i,
                /\b(place|confirm|complete)\s+order\b/i
            ],
            
            // Browsing intent
            browsing: [
                /^(show|see|looking for|search|find)\s+/i,
                /\b(do you have|got any)\b.*\?/i,
                /\b(more|another|different|other)\s+(pics?|photos?|images?|options?)\b/i,
                /\b(t-shirt|shirt|pants|jeans|jacket|dress|hoodie|clothing)\b/i
            ],
            
            // Support intent
            support: [
                /(help|problem|issue|wrong|broken|damage)/i,
                /(refund|return|exchange|cancel)/i,
                /(where is|track|status).*order/i,
                /\b(complain|disappointed|unsatisfied)\b/i
            ],
            
            // Handoff intent
            handoff: [
                /(human|person|agent|representative|support team)/i,
                /(talk to|speak with|call me)/i,
                /\b(manager|supervisor|admin)\b/i
            ]
        };
        
        // Check each pattern category
        for (const [intent, regexList] of Object.entries(patterns)) {
            for (const regex of regexList) {
                if (regex.test(text)) {
                    return {
                        frustration_level: 0,
                        intent: intent.charAt(0).toUpperCase() + intent.slice(1) as EmotionState['intent'],
                        urgency: 'Low',
                        style: text.length > 50 ? 'Detailed' : 'Short',
                        search_queries: this.extractSearchQueries(text, intent)
                    };
                }
            }
        }
        
        // Fallback for unclear cases
        return {
            frustration_level: 0,
            intent: 'Other',
            urgency: 'Low',
            style: text.length > 50 ? 'Detailed' : 'Short',
            search_queries: []
        };
    }
    
    /**
     * Extract product search queries from message
     */
    private extractSearchQueries(text: string, intent: string): string[] {
        if (intent !== 'browsing' && intent !== 'buying') return [];
        
        const productKeywords = [
            't-shirt', 'shirt', 'pants', 'jeans', 'jacket', 'dress', 'hoodie',
            'sweater', 'coat', 'shorts', 'skirt', 'top', 'blouse', 'polo'
        ];
        
        const colors = ['red', 'blue', 'green', 'black', 'white', 'yellow', 'pink', 'purple', 'brown', 'gray'];
        const queries: string[] = [];
        
        // Extract product mentions
        for (const product of productKeywords) {
            if (text.includes(product)) {
                queries.push(product);
            }
        }
        
        // Extract color mentions
        for (const color of colors) {
            if (text.includes(color)) {
                const productQuery = queries[0] || 'item';
                queries.push(`${color} ${productQuery}`);
            }
        }
        
        return queries.slice(0, 2); // Limit to 2 queries
    }

    private async processEcho(echoEvent: any, pageId: string) {
        const customerId = echoEvent.recipient.id;
        this.logger.log(`👨‍💼 Human admin message detected for customer ${customerId} on page ${pageId}. Suppressing AI.`);
        this.adminOverrides.set(customerId, Date.now() + this.OVERRIDE_DURATION);
    }

    private async getOrCreateContext(pageId: string, senderId: string, platform: 'MESSENGER' | 'INSTAGRAM' | 'WHATSAPP') {
        let integration = await this.prisma.metaIntegration.findUnique({ where: { pageId } });
        
        // Auto-provision WhatsApp integration if missing but present in .env
        if (!integration && platform === 'WHATSAPP') {
            const envWaid = this.configService.get<string>('WHATSAPP_PHONE_NUMBER_ID');
            const envToken = this.configService.get<string>('WHATSAPP_ACCESS_TOKEN');
            const envWabaId = this.configService.get<string>('WHATSAPP_BUSINESS_ACCOUNT_ID');

            if (pageId === envWaid && envToken) {
                this.logger.log(`🌱 Auto-provisioning WhatsApp integration for page ${pageId}`);
                // Find any user to associate with
                const firstUser = await this.prisma.user.findFirst();
                if (firstUser) {
                    integration = await this.prisma.metaIntegration.create({
                        data: {
                            pageId,
                            pageAccessToken: envToken,
                            userId: firstUser.id,
                            wabaId: envWabaId,
                            businessName: 'WhatsApp Business'
                        } as any
                    });
                }
            }
        }

        if (!integration) {
            throw new Error(`Integration for page ${pageId} not found`);
        }

        // Sync token with .env if applicable for WhatsApp
        if (platform === 'WHATSAPP') {
            const envToken = this.configService.get<string>('WHATSAPP_ACCESS_TOKEN');
            if (envToken && integration.pageAccessToken !== envToken) {
                this.logger.log(`💾 Syncing WhatsApp token in DB for page ${pageId}`);
                await this.prisma.metaIntegration.update({
                    where: { id: integration.id },
                    data: { pageAccessToken: this.encryption.encrypt(envToken) }
                }).catch(e => this.logger.error(`Failed to sync token: ${e.message}`));
                integration.pageAccessToken = envToken;
            }
        }

        // 1. Get or Create Customer (Internal record)
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

        // 2. Get or Create Conversation
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

    private async persistMessage(conversationId: string, sender: 'USER' | 'AGENT', content: string) {
        await this.prisma.message.create({
            data: {
                conversationId,
                sender,
                content: content.length > 2000 ? content.substring(0, 1997) + '...' : content
            }
        });
    }

    // ====== SPAM PROTECTION ======
    private userMessageTimestamps = new Map<string, number[]>();
    private spamBlocks = new Map<string, number>();

    /**
     * ORDER AGENT: Dedicated order collection handler.
     * Only handles buying/ordering intent. Collects customer details and fires ORDER_READY.
     */
    private async processOrderAgent(messaging: any, pageId: string, platform: 'MESSENGER' | 'INSTAGRAM' | 'WHATSAPP', messageText: string) {
        const senderId = messaging.sender.id;

        try {
            const { integration, customer, conversation } = await this.getOrCreateContext(pageId, senderId, platform);
            const pageToken = integration.pageAccessToken;

            await this.acquireAiSlot(senderId, pageId, pageToken);

            const [orderAgent, history] = await Promise.all([
                this.aiAgentService.getActiveAgentByName('Order Agent'),
                this.redis.getHistory(senderId, 15), // More history for order context
            ]);

            const orderModelName = orderAgent?.model;
            const customerMemory = customer.preferences || '';

            // Persist user message
            await Promise.all([
                this.persistMessage(conversation.id, 'USER', messageText),
                this.redis.addMessage(senderId, 'USER', messageText)
            ]);

            // Resolve the product the user wants to order
            let productContext: any[] = [];

            // Priority 1: Check if there's an active order session with a specific product
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
                } catch {}
            }

            // Priority 2: Use the last discussed product from Redis
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

            // Priority 3: Check if there's an existing placed order
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

            // Priority 4: Try to search from the message text itself
            if (productContext.length === 0 && messageText) {
                const searchResults = await this.productService.searchProducts(messageText);
                if (searchResults.length > 0) {
                    productContext = [this.buildProductContext(searchResults[0])];
                    this.logger.log(`📦 Order Agent: Found product via search: ${searchResults[0].name}`);
                }
            }

            // Set/refresh the order session in Redis (15 minute TTL)
            if (productContext.length > 0) {
                const sessionData = { productId: (productContext[0] as any).id, startedAt: Date.now() };
                await this.redis.set(`order_session:${senderId}`, JSON.stringify(sessionData), 900).catch(() => {});
            }

            // Generate response using the dedicated Order Agent prompt
            const aiResponseText = await this.gemini.generateOrderResponse(
                messageText,
                productContext,
                history,
                customerMemory,
                orderModelName
            );

            // Extract and process order tags
            this.logger.log(`📦 Order Agent RAW (first 500): ${aiResponseText.substring(0, 500)}`);
            const isOrderReady = aiResponseText.includes('[ORDER_READY:');
            this.logger.log(`📋 Order Agent Tag Detection: ORDER_READY=${isOrderReady}`);
            await this.extractAndProcessOrder(aiResponseText, customer.id);

            let finalResponseText = aiResponseText;

            // If order was placed, clear the order session
            if (isOrderReady) {
                await this.redis.del(`order_session:${senderId}`).catch(() => {});
                this.logger.log(`✅ Order placed. Clearing order session for ${senderId}.`);
                
                // Append thank you message and prompt for more browsing
                finalResponseText += "\n\n🎉 Thank you so much for your order! It has been successfully placed.\n\nWould you like to check out some more items from our store? 🛍️";
            }

            // Send response
            await this.sendOptimizedResponse(pageId, senderId, finalResponseText, integration.pageAccessToken, conversation.id, platform);

            if (platform === 'MESSENGER' || platform === 'INSTAGRAM') {
                this.stopTypingHeartbeat(senderId);
            }
        } catch (error) {
            this.logger.error(`Order Agent System Error: ${error.message}`);
            this.stopTypingHeartbeat(senderId);
        } finally {
            this.releaseAiSlot(senderId);
        }
    }

    /**
     * TEXT AGENT: Info-only agent. Responds to product questions, browsing, and general inquiries.
     * Does NOT handle orders — that is the Order Agent's responsibility.
     */
    private async processTextAgent(messaging: any, pageId: string, platform: 'MESSENGER' | 'INSTAGRAM' | 'WHATSAPP', messageText: string) {
        const senderId = messaging.sender.id;

        try {
            const initialContext = await this.getOrCreateContext(pageId, senderId, platform);
            const pageToken = initialContext.integration.pageAccessToken;
            
            await this.acquireAiSlot(senderId, pageId, pageToken);

            // ======== PARALLEL: Fetch all independent data ========
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

            // Persist user message
            await Promise.all([
                this.persistMessage(conversation.id, 'USER', messageText),
                this.redis.addMessage(senderId, 'USER', messageText)
            ]);

            // ======== FAQ FAST PATH ========
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

            // ======== EMOTION ANALYSIS (for persona/tone only — NOT for routing) ========
            let emotionState: EmotionState;
            const fastIntent = this.detectIntentFastPath(messageText, history);
            
            if (fastIntent.intent !== 'Other') {
                emotionState = fastIntent;
            } else {
                emotionState = await this.gemini.analyzeEmotionAndIntent(messageText, history, behaviourModelName);
            }

            // Cache emotion for next interaction
            if (emotionState.frustration_level > 0) {
                this.redis.set(`emotion:${senderId}`, JSON.stringify({
                    frustration_level: emotionState.frustration_level,
                    intent: emotionState.intent,
                    timestamp: Date.now()
                }), 600).catch(() => {});
            }

            // Apply previous frustration carry-over
            if (cachedEmotion) {
                try {
                    const prevEmotion = JSON.parse(cachedEmotion);
                    if (prevEmotion.frustration_level >= 3) {
                        emotionState.frustration_level = Math.max(emotionState.frustration_level, prevEmotion.frustration_level - 1);
                    }
                } catch {}
            }

            // Handoff detection
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

            // ======== PRODUCT SEARCH (info only — no ordering logic) ========
            let searchResults: any[] = [];
            
            // Follow-up detection (stock, material, photos, etc.)
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

            // Discovery search
            if (searchResults.length === 0) {
                searchResults = await this.getCachedSearchResults(messageText, emotionState);
                
                // Last resort: use last discussed product
                if (searchResults.length === 0 && lastProductId) {
                    this.logger.log(`🔄 Search empty, falling back to last product ${lastProductId}`);
                    const p = await this.productService.findOne(lastProductId);
                    if (p) {
                        searchResults = [this.buildProductContext(p)];
                    }
                }
            }

            // Persist product context for follow-ups
            if (searchResults.length > 0) {
                const primary = searchResults[0] as any;
                this.redis.set(`last_product:${senderId}`, primary.id, 86400).catch(() => {});
            }

            // ======== AI RESPONSE (info only — no isOrdering flag) ========
            const aiResponseText = await this.gemini.generateSalesResponse(
                messageText, 
                searchResults, 
                history, 
                customerMemory,
                false, // Never in ordering mode — that's the Order Agent's job
                emotionState,
                textModelName
            );

            // ======== SEND RESPONSE ========
            await this.sendOptimizedResponse(pageId, senderId, aiResponseText, integration.pageAccessToken, conversation.id, platform);

            // ======== BACKGROUND: Profile extraction ========
            const msgCount = await this.redis.incrementMessageCount(senderId);
            if (msgCount % 5 === 0) {
                const behaviourActive = await this.isAgentActive('Behaviour Agent');
                if (behaviourActive) {
                    this.extractAndSaveProfile(customer, senderId, behaviourModelName).catch(err =>
                        this.logger.error(`Background profile extraction failed: ${err.message}`)
                    );
                }
            }
        } catch (error) {
            this.logger.error(`Text Agent System Error: ${error.message}`);
            this.stopTypingHeartbeat(senderId);
        } finally {
            this.releaseAiSlot(senderId);
        }
    }

    /**
     * Build a consistent product context object with metadata
     */
    private buildProductContext(p: any): any {
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

    /**
     * CACHED PRODUCT SEARCH FOR PERFORMANCE
     * Reduces database queries by caching frequent searches
     */
    private async getCachedSearchResults(messageText: string, emotionState: EmotionState): Promise<any[]> {
        const cacheKey = `search:${messageText.toLowerCase().trim()}`;
        
        try {
            // Try to get from cache first (5-minute TTL)
            const cached = await this.redis.get(cacheKey);
            if (cached) {
                this.logger.log(`🎯 Cache hit for search: ${messageText.substring(0, 30)}...`);
                return JSON.parse(cached);
            }

            // Cache miss - perform search
            let searchResults: any[] = [];
            if (emotionState.search_queries && emotionState.search_queries.length > 0) {
                this.logger.log(`🔍 Compound Text Queries Detected: ${emotionState.search_queries.join(', ')}`);
                for (const q of emotionState.search_queries) {
                    const rawResults = await this.productService.searchProducts(q);
                    searchResults.push(...rawResults);
                }
                // Deduplicate
                const uniqueIds = new Set();
                const deduped = [];
                for (const p of searchResults) {
                    if (!uniqueIds.has(p.id)) {
                        uniqueIds.add(p.id);
                        deduped.push(p);
                    }
                }
                searchResults = deduped.slice(0, 6); // Max 6 total
            } else {
                searchResults = await this.productService.searchProducts(messageText);
            }

            // Cache the results for 5 minutes (only cache non-empty results)
            if (searchResults.length > 0) {
                await this.redis.set(cacheKey, JSON.stringify(searchResults), 300);
                this.logger.log(`💾 Cached ${searchResults.length} search results for: ${messageText.substring(0, 30)}...`);
            }

            return searchResults;
        } catch (error) {
            this.logger.error(`❌ Cached search failed, falling back to direct search: ${error.message}`);
            return await this.productService.searchProducts(messageText);
        }
    }

    // ====== HEARTBEAT ======
    private startTypingHeartbeat(pageId: string, senderId: string, token: string) {
        this.stopTypingHeartbeat(senderId); // Clean up existing
        
        // Trigger immediately
        this.metaApi.typingOn(pageId, senderId, token).catch(() => {});
        
        const interval = setInterval(() => {
            this.metaApi.typingOn(pageId, senderId, token).catch(() => {});
        }, 15000); // Facebook's typing_on lasts ~20s
        
        this.typingHeartbeats.set(senderId, interval);
    }

    private stopTypingHeartbeat(senderId: string) {
        const interval = this.typingHeartbeats.get(senderId);
        if (interval) {
            clearInterval(interval);
            this.typingHeartbeats.delete(senderId);
        }
    }

    /**
     * OPTIMIZED RESPONSE SENDING
     * Handles typing indicators, parallel processing, and efficient message delivery
     */
    private async sendOptimizedResponse(pageId: string, senderId: string, text: string, token: string, conversationId: string, platform: 'MESSENGER' | 'INSTAGRAM' | 'WHATSAPP') {
        try {
            // Decrypt token if it wasn't already decrypted (for safety)
            let decryptedToken = token;
            try {
                decryptedToken = this.encryption.decrypt(token);
            } catch (e) {
                // Already decrypted
            }

            // Standardize Text (Remove order tags before sending to end user)
            const cleanText = this.stripMarkdown(text);
            
            // Log interaction
            await this.persistMessage(conversationId, 'AGENT', text);
            await this.redis.addMessage(senderId, 'AGENT', text);

            // Handle Image Extraction from AI response if any
            const imageUrls = this.extractImageUrls(text);
            const textWithoutUrls = this.removeImageUrls(cleanText);

            if (platform === 'MESSENGER' || platform === 'INSTAGRAM') {
                // Send logic for Messenger...
                if (imageUrls.length > 0) {
                    await this.metaApi.sendBatchImages(pageId, senderId, imageUrls, decryptedToken);
                }
                if (textWithoutUrls) {
                    await this.metaApi.sendMessageWithRetry(pageId, senderId, textWithoutUrls, decryptedToken);
                }
            } else if (platform === 'WHATSAPP') {
                // Send logic for WhatsApp
                if (imageUrls.length > 0) {
                    // Send first image as primary, then others if any
                    // WhatsApp Cloud API usually sends them one by one
                    for (const url of imageUrls) {
                        await this.metaApi.sendWhatsAppImage(pageId, senderId, url, decryptedToken);
                    }
                }
                if (textWithoutUrls) {
                    await this.metaApi.sendWhatsAppMessage(pageId, senderId, textWithoutUrls, decryptedToken);
                }
            }
        } catch (error) {
            this.logger.error(`Response Send Error [${platform}]: ${error.message}`);
        }
    }

    private async handleBatchImages(pageId: string, recipientId: string, links: string[], token: string) {
        if (!links || links.length === 0) return;
        
        const uniqueLinks = [...new Set(links)];
        this.logger.log(`🖼️ Delivering ${uniqueLinks.length} images in batch...`);
        try {
            await this.metaApi.sendBatchImages(pageId, recipientId, uniqueLinks, token);
        } catch (err) {
            this.logger.error(`❌ Failed to send batch images: ${err.message}. Falling back to sequential.`);
            // Fallback to sequential if batch fails (Meta might reject plural 'attachments' for send API)
            for (const url of uniqueLinks) {
                try {
                    await this.metaApi.sendImage(pageId, recipientId, url, token);
                    await new Promise(resolve => setTimeout(resolve, 800));
                } catch (seqErr) {
                    this.logger.error(`❌ Sequential fallback failed for ${url}: ${seqErr.message}`);
                }
            }
        }
    }

     /**
      * VISUAL AGENT: Info-only agent. Identifies products from images and provides details.
      * Does NOT handle orders — that is the Order Agent's responsibility.
      */
     private async processVisualAgent(messaging: any, imageUrls: string[], pageId: string, userText: string = '', platform: 'MESSENGER' | 'INSTAGRAM' | 'WHATSAPP' = 'MESSENGER', requestStartTime: number = Date.now()) {
        const senderId = messaging.sender.id;
        
        try {
            // Task Expiry Check
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

            // Persist User Activity
            const logText = (userText || '(Sent Image for search)').trim();
            await this.persistMessage(conversation.id, 'USER', `[VisualSearch] ${logText}`);
            await this.redis.addMessage(senderId, 'USER', `[Sent Image] ${logText}`);

            // FAQ check for caption text
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

            // Download and Embed each image
            let allMatches = [];
            for (let i = 0; i < imageUrls.length; i++) {
                const imageUrl = imageUrls[i];
                this.logger.log(`🧠 Generating Embedding for image ${i + 1}/${imageUrls.length}...`);
                const imageBuffer = await this.downloadImage(imageUrl, integration.pageAccessToken);
                const imageEmbedding = await this.gemini.generateMultimodalEmbedding(
                    userText || 'Analyze this clothing item',
                    imageBuffer,
                    'image/jpeg',
                    visualEmbeddingModelName,
                );

                const matches = await this.pinecone.query(imageEmbedding, 5);
                if (matches && matches.length > 0) {
                    allMatches.push(...matches);
                }
            }

            if (allMatches.length > 0) {
                // Deduplicate and sort by score
                const uniqueIds = new Set();
                const uniqueMatches = [];
                for (const m of allMatches) {
                    if (!uniqueIds.has(m.id)) {
                        uniqueIds.add(m.id);
                        uniqueMatches.push(m);
                    }
                }
                uniqueMatches.sort((a, b) => (b.score || 0) - (a.score || 0));
                
                const bestMatch: any = uniqueMatches[0];
                bestMatch.score = bestMatch.score || 0;
                const score = bestMatch.score * 100;
                this.logger.log(`🔍 Top Vector Match: ${score.toFixed(2)}%`);

                // Confidence Guard
                let promptContext = `The user sent an image. I found a match with ${score.toFixed(1)}% confidence.`;
                if (bestMatch.score < this.CONFIDENCE_THRESHOLD) {
                    promptContext = `The user sent an image. The visual match is WEAK (${score.toFixed(1)}%). 
                    DO NOT state it is definitively the item. Instead, offer it as a strong possibility and ask 
                    "Is this what you're looking for?" or describe it as "something similar you might like."`;
                    this.logger.log(`⚠️ Weak Match (${score.toFixed(1)}%) - Using cautious prompt.`);
                }

                // Use top matches as product context (info only — no ordering)
                const products = uniqueMatches.slice(0, 3).map(m => m.metadata);

                const promptPrefix = imageUrls.length > 1 
                      ? `The user sent ${imageUrls.length} images. Here are the best visual matches.`
                      : promptContext;

                const aiResponseText = await this.gemini.generateSalesResponse(
                    `${promptPrefix} User query: "${userText}"`,
                    products,
                    history,
                    customerMemory,
                    false, // Never in ordering mode
                    null,  // No emotion state needed for visual
                    textModelName
                );

                // Persist the best match product for follow-ups
                if (products.length > 0 && (products[0] as any).id) {
                    this.redis.set(`last_product:${senderId}`, (products[0] as any).id, 86400).catch(() => {});
                }

                await this.sendOptimizedResponse(pageId, senderId, aiResponseText, integration.pageAccessToken, conversation.id, platform);
                this.stopTypingHeartbeat(senderId);

            } else {
                // No match
                const noMatchMsg = "I couldn't find an exact match for that item in our current inventory. Could you tell me more about what you're looking for?";
                await this.sendDirectPlatformResponse(platform, pageId, senderId, noMatchMsg, integration.pageAccessToken);
                await this.persistMessage(conversation.id, 'AGENT', noMatchMsg);
                await this.redis.addMessage(senderId, 'AGENT', noMatchMsg);
                this.stopTypingHeartbeat(senderId);
            }

            // Background: Profile extraction
            const msgCount = await this.redis.incrementMessageCount(senderId);
            if (msgCount % 5 === 0) {
                const behaviourActive = await this.isAgentActive('Behaviour Agent');
                if (behaviourActive) {
                    this.extractAndSaveProfile(customer, senderId).catch(err => 
                        this.logger.error(`Background profile extraction failed: ${err.message}`)
                    );
                }
            }
        } catch (error) {
            this.logger.error(`Visual Agent System Error: ${error.message}`);
            this.stopTypingHeartbeat(senderId);
        } finally {
            this.releaseAiSlot(senderId);
        }
    }

    /**
     * VOICE AGENT: Responds to audio attachments using Gemini audio processing.
     */
    private async processVoiceAgent(messaging: any, audioAttachment: any, pageId: string, platform: 'MESSENGER' | 'INSTAGRAM' | 'WHATSAPP' = 'MESSENGER') {
        const senderId = messaging.sender.id;
        const audioUrl = audioAttachment.payload.url;
        const durationMs = audioAttachment.payload.duration || 0;

        this.logger.log(`🎙️ Voice Agent processing [${platform}] for ${senderId}. URL: ${audioUrl.substring(0, 50)}...`);

        try {
            const { integration, customer, conversation } = await this.getOrCreateContext(pageId, senderId, platform);
            
            // 1. Duration Check (60s limit)
            if (durationMs > 60000) {
                this.logger.warn(`⚠️ Voice note too long: ${durationMs}ms from ${senderId}`);
                const rejectionMsg = "I am sorry, I can't listen to voice notes longer than 60 seconds. I am connecting you with our support team who will help you further! 🙏";
                await this.metaApi.sendMessage(pageId, senderId, rejectionMsg, integration.pageAccessToken);
                await this.prisma.notification.create({
                    data: {
                        type: 'HANDOFF',
                        message: `Voice note limit exceeded (${Math.round(durationMs/1000)}s). Customer needs human help.`,
                        customerId: customer.id
                    }
                });
                this.stopTypingHeartbeat(senderId);
                return;
            }

            // Wait for AI slot before downloading and AI processing
            await this.acquireAiSlot(senderId, pageId, integration.pageAccessToken);

            const voiceAgent = await this.aiAgentService.getActiveAgentByName('Voice Agent');
            const voiceModelName = voiceAgent?.model;

            // Fetch History context
            const history = await this.redis.getHistory(senderId, 10);
            const customerMemory = customer.preferences || 'No specific preferences known yet.';

            // 2. Download Audio
            this.logger.log(`📥 Downloading audio for ${senderId}...`);
            const audioBuffer = await this.downloadFile(audioUrl, integration.pageAccessToken);
            
            // Basic size-based duration safety if duration was 0
            if (durationMs === 0 && audioBuffer.length > 2 * 1024 * 1024) { // Roughly > 2MB is probably > 1min
                this.logger.warn(`⚠️ Large audio file detected without duration: ${audioBuffer.length} bytes`);
                // Fallback: proceed but log warning.
            }

            // 3. Process with Gemini
            this.logger.log(`🧠 Calling Gemini Voice Processing...`);
            // Determine Mime Type from URL or default to audio/mp4
            const mimeType = audioUrl.toLowerCase().includes('.ogg') ? 'audio/ogg' : 'audio/mp4';
            
            // Product Discovery (same logic as text agent - fetch likely search results)
            // For voice, we don't have text yet, so we'll fetch general best sellers or empty
            const products = await this.productService.searchProducts(''); 

            const { transcription, response: aiResponse } = await this.gemini.processAudioMessage(
                audioBuffer,
                mimeType,
                products.slice(0, 5),
                history,
                customerMemory,
                voiceModelName
            );

            this.logger.log(`📝 Voice Transcription: "${transcription}"`);

            // 4. Persist User Activity (Transcription is now our user message)
            await this.persistMessage(conversation.id, 'USER', `[Voice]: ${transcription}`);
            await this.redis.addMessage(senderId, 'USER', `[Voice]: ${transcription}`);

            // 5. Send Response
            await this.sendOptimizedResponse(pageId, senderId, aiResponse, integration.pageAccessToken, conversation.id, platform);

            if (platform === 'MESSENGER' || platform === 'INSTAGRAM') {
                this.stopTypingHeartbeat(senderId);
            }
        } catch (error) {
            this.logger.error(`Voice Agent System Error: ${error.message}`);
            if (platform === 'MESSENGER' || platform === 'INSTAGRAM') {
                this.stopTypingHeartbeat(senderId);
            }
        } finally {
            this.releaseAiSlot(senderId);
        }
    }

    private async downloadFile(url: string, token?: string): Promise<Buffer> {
        const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
        const response = await lastValueFrom(this.httpService.get(url, { responseType: 'arraybuffer', headers }));
        return Buffer.from(response.data);
    }

    private async extractAndProcessOrder(aiResponseText: string, customerId: string) {
        const readyJson = this.extractTagJson(aiResponseText, 'ORDER_READY');
        const updateJson = this.extractTagJson(aiResponseText, 'ORDER_UPDATE');
        
        if (readyJson) {
            try {
                const orderData = JSON.parse(readyJson);
                this.logger.log(`🎯 ORDER_READY DETECTED: Creating order for customer ${customerId}`);
                
                let createdOrders;
                if (orderData.deliveries && Array.isArray(orderData.deliveries)) {
                    createdOrders = await this.orderService.createOrdersFromCart(orderData, customerId);
                } else {
                    // Fallback for single item
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
            } catch (err) {
                this.logger.error(`❌ Failed to process ORDER_READY tag: ${err.message}`);
            }
        } else if (updateJson) {
            try {
                const updateData = JSON.parse(updateJson);
                this.logger.log(`🔄 ORDER_UPDATE DETECTED: Updating latest pending order for ${customerId}`);
                
                const latestOrder = await this.orderService.findLatestPendingOrder(customerId);
                if (latestOrder) {
                    if (updateData.deliveries && Array.isArray(updateData.deliveries)) {
                        await this.prisma.order.delete({ where: { id: latestOrder.id } }).catch(e => this.logger.warn(`Could not delete old order: ${e.message}`));
                        await this.orderService.createOrdersFromCart(updateData, customerId);
                        this.logger.log(`✅ Cart successfully updated via replacement.`);
                    } else {
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
                } else {
                    this.logger.warn(`⚠️ No pending order found to update for customer ${customerId}`);
                }
            } catch (err) {
                this.logger.error(`❌ Failed to process ORDER_UPDATE tag: ${err.message}`);
            }
        }
    }

    /**
     * Extracts JSON from tags like [ORDER_READY: {...}] using balanced brace matching.
     * This correctly handles nested JSON with arrays and objects.
     */
    private extractTagJson(text: string, tagName: string): string | null {
        const marker = `[${tagName}:`;
        const startIdx = text.indexOf(marker);
        if (startIdx === -1) return null;

        // Find the first '{' after the marker
        const jsonStart = text.indexOf('{', startIdx + marker.length);
        if (jsonStart === -1) return null;

        // Count balanced braces to find the matching closing '}'
        let depth = 0;
        for (let i = jsonStart; i < text.length; i++) {
            if (text[i] === '{') depth++;
            else if (text[i] === '}') depth--;
            if (depth === 0) {
                return text.substring(jsonStart, i + 1);
            }
        }
        return null; // Unbalanced braces
    }

    /**
     * Remove markdown-style special characters (Meta/Facebook doesn't support them well)
     */
    private stripMarkdown(text: string): string {
        // Remove tags like [ORDER_READY: {...}] or [ORDER_UPDATE: {...}] using balanced brace matching
        let clean = text;
        for (const tag of ['ORDER_READY', 'ORDER_UPDATE', 'ORDER_SPLIT']) {
            const marker = `[${tag}:`;
            let idx = clean.indexOf(marker);
            while (idx !== -1) {
                const jsonStart = clean.indexOf('{', idx);
                if (jsonStart === -1) break;
                // Find balanced closing
                let depth = 0;
                let end = jsonStart;
                for (let i = jsonStart; i < clean.length; i++) {
                    if (clean[i] === '{') depth++;
                    else if (clean[i] === '}') depth--;
                    if (depth === 0) { end = i; break; }
                }
                // Find the closing ']'
                const closingBracket = clean.indexOf(']', end);
                const removeEnd = closingBracket !== -1 ? closingBracket + 1 : end + 1;
                clean = clean.substring(0, idx) + clean.substring(removeEnd);
                idx = clean.indexOf(marker);
            }
        }
        // Remove standard markdown
        clean = clean.replace(/[*_~`#$]/g, '');
        // Clean up double newlines
        return clean.trim();
    }

    /**
     * Detect if message is an info request and return category
     */
    private detectInfoCategory(messageText: string): string | null {
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

    private async downloadImage(url: string, token?: string): Promise<Buffer> {
        const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
        const response = await lastValueFrom(this.httpService.get(url, { responseType: 'arraybuffer', headers }));
        return Buffer.from(response.data);
    }

    /**
     * Check if an agent is active (simplified approach for now)
     */
    private async isAgentActive(agentId: string): Promise<boolean> {
        try {
            const agent = await this.prisma.aiAgent.findUnique({
                where: { name: agentId },
            });

            // If the agent row doesn't exist, default to active to avoid hard-blocking.
            return agent?.isActive ?? true;
            
        } catch (error) {
            const e = error as any;
            if (e?.code === 'P2021') {
                if (!this.aiAgentTableMissingWarned) {
                    this.aiAgentTableMissingWarned = true;
                    this.logger.warn('ai_agents table missing; defaulting agent availability to active. Run Prisma migrations.');
                }
                return true;
            }
            this.logger.error(`Failed to check agent status for ${agentId}: ${e?.message ?? String(error)}`);
            return true; // Default to active on error
        }
    }

    /**
     * Generate message for unavailable agent
     */
    private async getAgentUnavailableMessage(agentName: string, customerName?: string | undefined): Promise<string> {
        const DEFAULT_UNAVAILABLE = "I'm sorry, but that AI service is currently temporarily unavailable for maintenance.\n\n🔧 Our team is working to restore it as soon as possible.\n\n📞 I'm connecting you with our admin team who can assist you right away.\n\nThank you for your patience! 😊";
        try {
            const agent = await this.aiAgentService.getAgentByName(agentName);
            if (agentName === 'Behaviour Agent') {
                return ''; // User requested no unavailable message for behaviour agent
            }
            
            // Use unavailableMessage (dedicated OFF message), fallback to default
            const message = agent?.unavailableMessage || DEFAULT_UNAVAILABLE;
            return message;
        } catch (error) {
            this.logger.error(`Error fetching unavailable message for ${agentName}:`, error);
            return DEFAULT_UNAVAILABLE;
        }
    }

    /**
     * Notify admin about inactive agent usage
     */
    private async notifyAdminAboutInactiveAgent(agentName: string, senderId: string, messageText: string, customer: any): Promise<void> {
        try {
            // Create notification for admin
            await this.prisma.notification.create({
                data: {
                    type: 'AGENT_UNAVAILABLE',
                    message: `Customer ${customer.name || senderId} tried to use ${agentName} but it's inactive. Message: "${messageText}"`,
                    customerId: customer.id
                }
            });
            
            this.logger.log(`🔔 Admin notified about inactive ${agentName} usage by customer ${customer.name || senderId}`);
            
            // In a real implementation, you might also send:
            // - Email notification
            // - Slack notification
            // - Push notification to admin dashboard
            // - WebSocket real-time notification
            
        } catch (error) {
            this.logger.error(`Failed to notify admin about inactive agent: ${error.message}`);
        }
    }

    /**
     * Background hook to extract persistent behavioral traits from conversation history.
     */
    private async extractAndSaveProfile(customer: any, senderId: string, modelName?: string) {
        try {
            this.logger.log(`🧠 Triggering Semantic Memory extraction for customer ${customer.id}`);
            const history = await this.redis.getHistory(senderId, 20); // Analyze last 20 messages
            const newProfile = await this.gemini.extractBehavioralProfile(history, customer.preferences || '', modelName);
            
            if (newProfile && newProfile !== customer.preferences) {
                await this.customerService.update(customer.id, { preferences: newProfile });
                this.logger.log(`💾 Updated Semantic Memory: ${newProfile}`);
            }
        } catch (e) {
            this.logger.error(`Failed to extract profile: ${e.message}`);
        }
    }
    /**
     * Extracts all URLs from a given text.
     */
    private extractImageUrls(text: string): string[] {
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        return text.match(urlRegex) || [];
    }

    /**
     * Removes all URLs from a given text.
     */
    private removeImageUrls(text: string): string {
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        return text.replace(urlRegex, '').trim();
    }
}
