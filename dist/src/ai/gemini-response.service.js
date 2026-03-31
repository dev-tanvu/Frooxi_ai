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
var GeminiResponseService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.GeminiResponseService = void 0;
const common_1 = require("@nestjs/common");
const store_service_1 = require("../store/store.service");
const ai_agent_service_1 = require("../ai-agent/ai-agent.service");
const gemini_service_1 = require("./gemini.service");
let GeminiResponseService = GeminiResponseService_1 = class GeminiResponseService {
    storeService;
    aiAgentService;
    gemini;
    logger = new common_1.Logger(GeminiResponseService_1.name);
    constructor(storeService, aiAgentService, gemini) {
        this.storeService = storeService;
        this.aiAgentService = aiAgentService;
        this.gemini = gemini;
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
            const result = await this.gemini.getTextModel(modelName || agent.model).generateContent(fullPrompt);
            return result.response.text();
        }
        catch (error) {
            this.logger.error(`Sales Generation Failed: ${error.message}`);
            return 'I am having trouble processing that right now.';
        }
    }
    orderTools = [
        {
            functionDeclarations: [
                {
                    name: 'update_order_draft',
                    description: 'Update the customer\'s order draft with collected information. Call this whenever the user provides a name, phone, address, or product details.',
                    parameters: {
                        type: 'object',
                        properties: {
                            customerName: { type: 'string', description: 'The customer\'s full name.' },
                            phone: { type: 'string', description: 'The customer\'s contact phone number.' },
                            address: { type: 'string', description: 'The full delivery address.' },
                            productId: { type: 'string', description: 'The EXACT Product ID from AVAILABLE_PRODUCTS_DATA.' },
                            size: { type: 'string', description: 'The chosen size (e.g., M, L, XL).' },
                            color: { type: 'string', description: 'The chosen color.' },
                            quantity: { type: 'number', description: 'The number of items.' }
                        }
                    }
                },
                {
                    name: 'place_order',
                    description: 'Finalize and create the actual order in the database. Call this ONLY after the user has seen the full summary and said "confirm" or "yes".',
                    parameters: {
                        type: 'object',
                        properties: {
                            confirmed: { type: 'boolean', description: 'Must be true to proceed.' }
                        },
                        required: ['confirmed']
                    }
                },
                {
                    name: 'edit_placed_order',
                    description: 'Modify an order that has already been placed in the database. Use this ONLY if the user wants to change their details (Name, Phone, Address, Size, Color) AFTER the order was already finalized.',
                    parameters: {
                        type: 'object',
                        properties: {
                            customerName: { type: 'string' },
                            phone: { type: 'string' },
                            address: { type: 'string' },
                            productId: { type: 'string', description: 'The product ID to update.' },
                            size: { type: 'string' },
                            color: { type: 'string' },
                            quantity: { type: 'number' }
                        }
                    }
                }
            ]
        }
    ];
    async generateOrderResponse(prompt, products, history = [], customerMemory = '', modelName) {
        try {
            const [config, activeRules] = await Promise.all([
                this.storeService.getConfig(),
                this.storeService.findActiveRules()
            ]);
            if (!config)
                return { text: 'Store is not configured.' };
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
            if (!agent) {
                return { text: 'Our ordering system is temporarily unavailable. Please try again shortly.' };
            }
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
            const model = this.gemini.getTextModel(modelName || agent.model, this.orderTools);
            const result = await model.generateContent(fullPrompt);
            const response = result.response;
            let text = '';
            try {
                text = response.text();
            }
            catch (e) { }
            return {
                text: text,
                toolCalls: response.functionCalls()
            };
        }
        catch (error) {
            this.logger.error(`Order Response Generation Failed: ${error.message}`);
            return { text: 'I am having trouble processing your order right now. Please try again.' };
        }
    }
};
exports.GeminiResponseService = GeminiResponseService;
exports.GeminiResponseService = GeminiResponseService = GeminiResponseService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [store_service_1.StoreService,
        ai_agent_service_1.AiAgentService,
        gemini_service_1.GeminiService])
], GeminiResponseService);
//# sourceMappingURL=gemini-response.service.js.map