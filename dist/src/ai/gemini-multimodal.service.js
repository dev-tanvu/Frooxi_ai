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
var GeminiMultimodalService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.GeminiMultimodalService = void 0;
const common_1 = require("@nestjs/common");
const store_service_1 = require("../store/store.service");
const ai_agent_service_1 = require("../ai-agent/ai-agent.service");
const gemini_service_1 = require("./gemini.service");
let GeminiMultimodalService = GeminiMultimodalService_1 = class GeminiMultimodalService {
    storeService;
    aiAgentService;
    gemini;
    logger = new common_1.Logger(GeminiMultimodalService_1.name);
    constructor(storeService, aiAgentService, gemini) {
        this.storeService = storeService;
        this.aiAgentService = aiAgentService;
        this.gemini = gemini;
    }
    async analyzeImage(imageBuffer, mimeType, prompt) {
        try {
            const result = await this.gemini.getDefaultModel().generateContent([
                prompt,
                { inlineData: { data: imageBuffer.toString('base64'), mimeType } },
            ]);
            return result.response.text();
        }
        catch (error) {
            this.logger.error(`Gemini Image Analysis Failed: ${error.message}`);
            throw error;
        }
    }
    async generateEmbedding(text, modelName) {
        try {
            const result = await this.gemini.getEmbeddingModel(modelName).embedContent(text);
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
            const result = await this.gemini.getTextModel(modelName || agent?.model).generateContent([
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
exports.GeminiMultimodalService = GeminiMultimodalService;
exports.GeminiMultimodalService = GeminiMultimodalService = GeminiMultimodalService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [store_service_1.StoreService,
        ai_agent_service_1.AiAgentService,
        gemini_service_1.GeminiService])
], GeminiMultimodalService);
//# sourceMappingURL=gemini-multimodal.service.js.map