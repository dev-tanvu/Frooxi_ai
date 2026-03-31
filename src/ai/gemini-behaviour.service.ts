import { Injectable, Logger } from '@nestjs/common';
import { StoreService } from '../store/store.service';
import { AiAgentService } from '../ai-agent/ai-agent.service';
import { GeminiService, EmotionState } from './gemini.service';

@Injectable()
export class GeminiBehaviourService {
    private readonly logger = new Logger(GeminiBehaviourService.name);

    constructor(
        private storeService: StoreService,
        private aiAgentService: AiAgentService,
        private gemini: GeminiService,
    ) { }

    /**
     * THE EMOTIONAL BRAIN
     * Analyzes the user's message and recent history to determine their current emotional state, intent, and conversational style.
     */
    async analyzeEmotionAndIntent(prompt: string, history: string[] = [], modelName?: string): Promise<EmotionState> {
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

            // Robust JSON extraction
            let cleanJson = responseText;
            const startIdx = cleanJson.indexOf('{');
            const endIdx = cleanJson.lastIndexOf('}');
            if (startIdx !== -1 && endIdx !== -1) {
                cleanJson = cleanJson.substring(startIdx, endIdx + 1);
            }

            return JSON.parse(cleanJson) as EmotionState;
        } catch (error) {
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

    /**
     * PERSISTENT SEMANTIC MEMORY
     * Analyzes conversation history to extract persistent behavioral traits.
     */
    async extractBehavioralProfile(history: string[], currentProfile: string = '', modelName?: string): Promise<string> {
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
        } catch (error) {
            this.logger.error(`Profile Extraction Failed: ${error.message}`);
            return currentProfile;
        }
    }
}
