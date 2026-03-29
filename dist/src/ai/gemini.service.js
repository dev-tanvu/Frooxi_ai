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
var GeminiService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.GeminiService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const generative_ai_1 = require("@google/generative-ai");
const store_service_1 = require("../store/store.service");
const ai_agent_service_1 = require("../ai-agent/ai-agent.service");
let GeminiService = GeminiService_1 = class GeminiService {
    configService;
    storeService;
    aiAgentService;
    logger = new common_1.Logger(GeminiService_1.name);
    genAI;
    model;
    embeddingModel;
    defaultModelName;
    defaultEmbeddingModelName;
    constructor(configService, storeService, aiAgentService) {
        this.configService = configService;
        this.storeService = storeService;
        this.aiAgentService = aiAgentService;
        const apiKey = this.configService.get('GEMINI_API_KEY');
        const modelName = this.configService.get('GEMINI_MODEL') || 'gemini-1.5-flash';
        const embeddingModelName = this.configService.get('GEMINI_EMBEDDING_MODEL') || 'gemini-embedding-2-preview';
        if (!apiKey) {
            throw new Error('GEMINI_API_KEY is not defined in environment variables');
        }
        this.genAI = new generative_ai_1.GoogleGenerativeAI(apiKey);
        this.defaultModelName = modelName;
        this.defaultEmbeddingModelName = embeddingModelName;
        this.model = this.genAI.getGenerativeModel({ model: modelName });
        this.embeddingModel = this.genAI.getGenerativeModel({ model: embeddingModelName });
    }
    getTextModel(modelName) {
        return this.genAI.getGenerativeModel({ model: modelName || this.defaultModelName });
    }
    getEmbeddingModel(modelName) {
        return this.genAI.getGenerativeModel({ model: modelName || this.defaultEmbeddingModelName });
    }
    async analyzeEmotionAndIntent(prompt, history = [], modelName) {
        try {
            const config = await this.storeService.getConfig();
            const contextStr = history.length > 0 ? `Recent History:\n${history.join('\n')}\n\n` : '';
            const defaultPrompt = `
You are the "Emotional Brain" of an AI sales agent. Your job is NOT to reply to the user, but to analyze their behavior and intent.
Analyze the following user message and context, and output ONLY a JSON object with the following schema exactly. Do not use markdown blocks like \`\`\`json. 

{
  "frustration_level": float, // 0.0 (happy/neutral) to 1.0 (very angry/impatient)
  "intent": "Browsing" | "Support" | "Ordering" | "Buying" | "Handoff" | "Other", // Browsing (products), Support (complaining), Ordering/Buying (wants purchase), Handoff (asks for real human agent/admin)
  "urgency": "Low" | "Medium" | "High",
  "style": "Short" | "Detailed" | "Casual" | "Formal", // How does the user type? Are they brief? Do they write long paragraphs?
  "search_queries": [] // Array of string queries if the user is asking for products. Example: ["blue shirt", "black pants"]. Empty array if no products mentioned.
}
`.trim();
            const agent = await this.aiAgentService.getActiveAgentByName('Behaviour Agent');
            const basePrompt = agent?.prompt || defaultPrompt;
            const fullPrompt = `
${basePrompt}

MESSAGE TO ANALYZE:
${contextStr}
User: ${prompt}
            `.trim();
            const result = await this.getTextModel(modelName || agent?.model).generateContent(fullPrompt);
            const responseText = result.response.text().trim();
            let cleanJson = responseText;
            const startIdx = cleanJson.indexOf('{');
            const endIdx = cleanJson.lastIndexOf('}');
            if (startIdx !== -1 && endIdx !== -1) {
                cleanJson = cleanJson.substring(startIdx, endIdx + 1);
            }
            return JSON.parse(cleanJson);
        }
        catch (error) {
            this.logger.error(`Emotion Analysis Failed: ${error.message}. Returning default state.`);
            return {
                frustration_level: 0,
                intent: 'Browsing',
                urgency: 'Low',
                style: 'Casual',
                search_queries: []
            };
        }
    }
    async extractBehavioralProfile(history, currentProfile = '', modelName) {
        try {
            const config = await this.storeService.getConfig();
            const contextStr = history.join('\n');
            const defaultPrompt = `
You are the "Memory Extraction" module.
Analyze the following conversation history and extract any actionable, persistent behavioral traits or preferences about the user.
Keep it concise. If no new traits are found, return the CURRENT PROFILE exactly as is.
DO NOT include situational facts like "user is angry today" or "user wants a blue shirt right now".
DO include facts like "prefers brief answers", "likes black clothing", "hates high shipping costs".
`.trim();
            const agent = await this.aiAgentService.getActiveAgentByName('Behaviour Agent');
            const basePrompt = agent?.instructionPrompt || defaultPrompt;
            const fullPrompt = `
${basePrompt}

CURRENT PROFILE:
${currentProfile || 'None'}

CONVERSATION HISTORY:
${contextStr}

OUTPUT ONLY the updated profile text. If there are no meaningful updates, exact output the CURRENT PROFILE.
            `.trim();
            const result = await this.getTextModel(modelName || agent?.model).generateContent(fullPrompt);
            return result.response.text().trim();
        }
        catch (error) {
            this.logger.error(`Profile Extraction Failed: ${error.message}`);
            return currentProfile;
        }
    }
    async generateSalesResponse(prompt, products, history = [], customerMemory = '', isOrdering = false, emotionState = null, modelName) {
        try {
            const [config, activeRules] = await Promise.all([
                this.storeService.getConfig(),
                this.storeService.findActiveRules()
            ]);
            if (!config)
                return 'Store is not configured.';
            const productContext = products.length > 0
                ? `\n\nAVAILABLE_PRODUCTS_DATA: ${JSON.stringify(products)}`
                : '\n\nNO_EXACT_MATCHES_FOUND.';
            const memoryContext = customerMemory
                ? `\n\nCUSTOMER_MEMORY: ${customerMemory}`
                : '';
            const rulesContext = activeRules.length > 0
                ? `\n\nSTORE_POLICIES_AND_FAQ:\n${activeRules.map((r) => `- ${r.title}: ${r.content}`).join('\n')}`
                : '';
            const emotionContext = emotionState ? `
[EMOTIONAL INTELLIGENCE & PERSONA]
User Intent: ${emotionState.intent}
Frustration Level: ${emotionState.frustration_level}/1.0
Conversational Style: ${emotionState.style}
Urgency: ${emotionState.urgency}

[PERSONA RULES - CRITICAL]
1. THE 70/30 RULE: Ensure 70% of your tone is active listening, building rapport, and showing empathy. Only 30% should be product pitching. Feel human.
2. MIRRORING: The user clearly prefers a ${emotionState.style} style. Mirror their sentence length and energy. Do not be overly verbose if they are brief.
3. FRUSTRATION: If frustration > 0.6, prioritize de-escalating the situation. Apologize sincerely.
4. OBJECTION HANDLING: 
   - Price: Emphasize premium quality and value.
   - Shipping: Reassure fast delivery.
5. PROACTIVE CLOSING: If the user is actively discussing a product, end with a direct closing question about THAT specific product ONLY. Examples: "Would you like me to prepare an order for this?", "Should we get this sent your way today?", "Which color would you like to grab?". NEVER suggest or mention a different product.
` : '';
            const defaultInstructions = `
[INFO AGENT INSTRUCTION]
1. You are an INFORMATION-ONLY agent. Provide product details, answer questions, and help customers browse.
2. [CRITICAL] USE ONLY PLAIN TEXT. NO BOLD (**), NO ITALICS (_), NO HEADERS (#). Use simple dashes (-) for lists.
3. [ABSOLUTE BAN]: You are FORBIDDEN from suggesting unrelated products. Talk about ONLY what the user is asking about.
4. If exact products are found, mention ONLY those. Do not dump the catalog.
5. If the user wants to buy/order, respond with: "Excellent choice! Let me get that order started for you." The system will route them to the order agent.
6. Mention delivery info if relevant: "Inside Dhaka delivery 70 BDT, Outside Dhaka 130 BDT".
7. Each product's details should include its image URLs when first mentioned.
8. [CRITICAL - PRODUCT METADATA]: Each product in AVAILABLE_PRODUCTS_DATA contains a 'metadata' object with rich details. YOU MUST check this object to answer specific questions about stock, materials, brands, etc.
`.trim();
            const agent = await this.aiAgentService.getActiveAgentByName('Text Agent');
            if (!agent)
                return 'Service is temporarily unavailable.';
            const instructions = agent.instructionPrompt || defaultInstructions;
            const contextStr = history.length > 0 ? `Recent History:\n${history.join('\n')}` : '';
            const fullPrompt = `
${agent.prompt}
${config.businessDetails ? `\nBUSINESS: ${config.businessDetails}` : ''}
${emotionContext}
${instructions}
${rulesContext}
${memoryContext}
${productContext}

${contextStr}
User: ${prompt}
            `.trim();
            const result = await this.getTextModel(modelName || agent.model).generateContent(fullPrompt);
            const response = await result.response;
            return response.text();
        }
        catch (error) {
            this.logger.error(`Sales Generation Failed: ${error.message}`);
            return 'I am having trouble processing that right now.';
        }
    }
    async generateOrderResponse(prompt, products, history = [], customerMemory = '', modelName) {
        try {
            const [config, activeRules] = await Promise.all([
                this.storeService.getConfig(),
                this.storeService.findActiveRules()
            ]);
            if (!config)
                return 'Store is not configured.';
            const productContext = products.length > 0
                ? `\n\nAVAILABLE_PRODUCTS_DATA: ${JSON.stringify(products)}`
                : '\n\nNO_PRODUCT_CONTEXT_AVAILABLE.';
            const memoryContext = customerMemory
                ? `\n\nCUSTOMER_MEMORY: ${customerMemory}`
                : '';
            const rulesContext = activeRules.length > 0
                ? `\n\nSTORE_POLICIES:\n${activeRules.map((r) => `- ${r.title}: ${r.content}`).join('\n')}`
                : '';
            const agent = await this.aiAgentService.getActiveAgentByName('Order Agent');
            if (!agent)
                return 'Our ordering system is temporarily unavailable. Please try again shortly.';
            const contextStr = history.length > 0 ? `Recent History:\n${history.join('\n')}` : '';
            const fullPrompt = `
${agent.prompt}
${config.businessDetails ? `\nBUSINESS: ${config.businessDetails}` : ''}
${agent.instructionPrompt || ''}
${rulesContext}
${memoryContext}
${productContext}

${contextStr}
User: ${prompt}
            `.trim();
            const result = await this.getTextModel(modelName || agent.model).generateContent(fullPrompt);
            const response = await result.response;
            return response.text();
        }
        catch (error) {
            this.logger.error(`Order Response Generation Failed: ${error.message}`);
            return 'I am having trouble processing your order right now. Please try again.';
        }
    }
    async analyzeImage(imageBuffer, mimeType, prompt) {
        try {
            const result = await this.model.generateContent([
                prompt,
                { inlineData: { data: imageBuffer.toString('base64'), mimeType } },
            ]);
            const response = await result.response;
            return response.text();
        }
        catch (error) {
            this.logger.error(`Gemini Image Analysis Failed: ${error.message}`);
            throw error;
        }
    }
    async generateEmbedding(text, modelName) {
        try {
            const result = await this.getEmbeddingModel(modelName).embedContent(text);
            return result.embedding.values;
        }
        catch (error) {
            this.logger.error(`Gemini Embedding Generation Failed: ${error.message}`);
            throw error;
        }
    }
    async generateMultimodalEmbedding(text, imageBuffer, mimeType, modelName) {
        try {
            this.logger.log(`🎨 Generating visual description for embedding fallback...`);
            const visualDescription = await this.analyzeImage(imageBuffer, mimeType, "Describe this product in detail for search indexing, focusing on category, color, material, and key features.");
            const combinedText = `[Product Description]: ${visualDescription} ${text ? `\n[User Query]: ${text}` : ''}`;
            this.logger.log(`🧠 Generating text embedding for combined description...`);
            return await this.generateEmbedding(combinedText, modelName);
        }
        catch (error) {
            this.logger.error(`Gemini Multimodal Embedding Failed: ${error.message}`);
            if (text)
                return await this.generateEmbedding(text, modelName);
            throw error;
        }
    }
    async processAudioMessage(audioBuffer, mimeType, products, history = [], customerMemory = '', modelName) {
        try {
            const agent = await this.aiAgentService.getActiveAgentByName('Voice Agent');
            const [config, activeRules] = await Promise.all([
                this.storeService.getConfig(),
                this.storeService.findActiveRules()
            ]);
            const contextStr = history.length > 0 ? `Recent History:\n${history.join('\n')}` : '';
            const productContext = products.length > 0
                ? `\n\nAVAILABLE_PRODUCTS_DATA: ${JSON.stringify(products)}`
                : '\n\nNO_EXACT_MATCHES_FOUND.';
            const fullPrompt = `
${agent?.prompt}
${config?.businessDetails ? `\nBUSINESS: ${config.businessDetails}` : ''}
${agent?.instructionPrompt}
${activeRules.length > 0 ? `\n\nSTORE_POLICIES_AND_FAQ:\n${activeRules.map((r) => `- ${r.title}: ${r.content}`).join('\n')}` : ''}
${customerMemory ? `\n\nCUSTOMER_MEMORY: ${customerMemory}` : ''}
${productContext}
${contextStr}

[AUDIO ANALYSIS TASK]
1. Respond in the user's language found in the audio.
2. Provide your response as a JSON object with this EXACT schema:
{
  "transcription": "What the user said in the audio",
  "response": "Your salesman reply in their language"
}
`.trim();
            const result = await this.getTextModel(modelName || agent?.model).generateContent([
                {
                    inlineData: {
                        data: audioBuffer.toString('base64'),
                        mimeType: mimeType
                    }
                },
                { text: fullPrompt }
            ]);
            const text = result.response.text().trim();
            let cleanJson = text;
            const startIdx = cleanJson.indexOf('{');
            const endIdx = cleanJson.lastIndexOf('}');
            if (startIdx !== -1 && endIdx !== -1) {
                cleanJson = cleanJson.substring(startIdx, endIdx + 1);
            }
            const parsed = JSON.parse(cleanJson);
            return {
                transcription: parsed.transcription || 'Audio message received',
                response: parsed.response || 'I am sorry, I could not process your voice note right now.'
            };
        }
        catch (error) {
            this.logger.error(`Voice Processing Failed: ${error.message}`);
            throw error;
        }
    }
};
exports.GeminiService = GeminiService;
exports.GeminiService = GeminiService = GeminiService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, common_1.Inject)((0, common_1.forwardRef)(() => store_service_1.StoreService))),
    __metadata("design:paramtypes", [config_1.ConfigService,
        store_service_1.StoreService,
        ai_agent_service_1.AiAgentService])
], GeminiService);
//# sourceMappingURL=gemini.service.js.map