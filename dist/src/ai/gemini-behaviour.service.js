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
var GeminiBehaviourService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.GeminiBehaviourService = void 0;
const common_1 = require("@nestjs/common");
const store_service_1 = require("../store/store.service");
const ai_agent_service_1 = require("../ai-agent/ai-agent.service");
const gemini_service_1 = require("./gemini.service");
let GeminiBehaviourService = GeminiBehaviourService_1 = class GeminiBehaviourService {
    storeService;
    aiAgentService;
    gemini;
    logger = new common_1.Logger(GeminiBehaviourService_1.name);
    constructor(storeService, aiAgentService, gemini) {
        this.storeService = storeService;
        this.aiAgentService = aiAgentService;
        this.gemini = gemini;
    }
    async analyzeEmotionAndIntent(prompt, history = [], modelName) {
        try {
            const contextStr = history.length > 0 ? `Recent History:\n${history.join('\n')}\n\n` : '';
            const defaultPrompt = `
You are the "Emotional Brain" of an AI sales agent. Your job is NOT to reply to the user, but to analyze their behavior and intent.
Analyze the following user message and context, and output ONLY a JSON object with the following schema exactly. Do not use markdown blocks like \`\`\`json. 

{
  "frustration_level": float, // 0.0 (happy/neutral) to 1.0 (very angry/impatient)
  "intent": "Browsing" | "Support" | "Ordering" | "Buying" | "Handoff" | "Other", // Browsing (products), Support (complaining), Ordering/Buying (wants purchase), Handoff (asks for real human agent/admin)
  "urgency": "Low" | "Medium" | "High",
  "style": "Short" | "Detailed" | "Casual" | "Formal", // How does the user type? Are they brief? Do they write long paragraphs?
  "search_queries": [], // Array of string queries if the user is asking for products. Example: ["blue shirt", "black pants"]. Empty array if no products mentioned.
  "product_interest": "NONE" | "DISCUSSING" | "CONFIRMED" | "REMOVING" | "CLEAR_ALL", // NONE: no product; DISCUSSING: asking details/info; CONFIRMED: says "I want this", "save this", "buy this"; REMOVING: says "remove", "delete", "take it off"; CLEAR_ALL: "empty my cart", "clear everything"
  "quantity": number, // Extracted numerical quantity. Default to 1 if unspecified.
  "quantity_operation": "INCREMENT" | "SET", // INCREMENT: "add 2 more", "give me another". SET: "make it 3 total", "I just want 1". Default to INCREMENT.
  "size": string | null, // e.g. "XL", "Medium". Exact match string.
  "color": string | null // e.g. "Red", "Blue". Exact match string.
}
`.trim();
            const agent = await this.aiAgentService.getActiveAgentByName('Head Agent');
            const basePrompt = agent?.prompt || defaultPrompt;
            const fullPrompt = `
${basePrompt}

MESSAGE TO ANALYZE:
${contextStr}
User: ${prompt}
            `.trim();
            const result = await this.gemini.getTextModel(modelName || agent?.model).generateContent(fullPrompt);
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
            const contextStr = history.join('\n');
            const defaultPrompt = `
You are the "Memory Extraction" module.
Analyze the following conversation history and extract any actionable, persistent behavioral traits or preferences about the user.
Keep it concise. If no new traits are found, return the CURRENT PROFILE exactly as is.
DO NOT include situational facts like "user is angry today" or "user wants a blue shirt right now".
DO include facts like "prefers brief answers", "likes black clothing", "hates high shipping costs".
`.trim();
            const agent = await this.aiAgentService.getActiveAgentByName('Head Agent');
            const basePrompt = agent?.instructionPrompt || defaultPrompt;
            const fullPrompt = `
${basePrompt}

CURRENT PROFILE:
${currentProfile || 'None'}

CONVERSATION HISTORY:
${contextStr}

OUTPUT ONLY the updated profile text. If there are no meaningful updates, exact output the CURRENT PROFILE.
            `.trim();
            const result = await this.gemini.getTextModel(modelName || agent?.model).generateContent(fullPrompt);
            return result.response.text().trim();
        }
        catch (error) {
            this.logger.error(`Profile Extraction Failed: ${error.message}`);
            return currentProfile;
        }
    }
};
exports.GeminiBehaviourService = GeminiBehaviourService;
exports.GeminiBehaviourService = GeminiBehaviourService = GeminiBehaviourService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [store_service_1.StoreService,
        ai_agent_service_1.AiAgentService,
        gemini_service_1.GeminiService])
], GeminiBehaviourService);
//# sourceMappingURL=gemini-behaviour.service.js.map