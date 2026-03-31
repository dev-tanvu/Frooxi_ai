import { Injectable, Logger } from '@nestjs/common';
import { StoreService } from '../store/store.service';
import { AiAgentService } from '../ai-agent/ai-agent.service';
import { GeminiService } from './gemini.service';

@Injectable()
export class GeminiMultimodalService {
    private readonly logger = new Logger(GeminiMultimodalService.name);

    constructor(
        private storeService: StoreService,
        private aiAgentService: AiAgentService,
        private gemini: GeminiService,
    ) { }

    async analyzeImage(imageBuffer: Buffer, mimeType: string, prompt: string): Promise<string> {
        try {
            const result = await this.gemini.getDefaultModel().generateContent([
                prompt,
                { inlineData: { data: imageBuffer.toString('base64'), mimeType } },
            ]);
            return result.response.text();
        } catch (error) {
            this.logger.error(`Gemini Image Analysis Failed: ${error.message}`);
            throw error;
        }
    }

    async generateEmbedding(text: string, modelName?: string): Promise<number[]> {
        try {
            const result = await this.gemini.getEmbeddingModel(modelName).embedContent(text);
            return result.embedding.values;
        } catch (error) {
            this.logger.error(`Gemini Embedding Generation Failed: ${error.message}`);
            throw error;
        }
    }

    async generateMultimodalEmbedding(text: string, imageBuffer: Buffer, mimeType: string, modelName?: string): Promise<number[]> {
        try {
            this.logger.log(`🎨 Generating visual description for embedding fallback...`);
            const visualDescription = await this.analyzeImage(imageBuffer, mimeType, "Describe this product in detail for search indexing, focusing on category, color, material, and key features.");
            
            const combinedText = `[Product Description]: ${visualDescription} ${text ? `\n[User Query]: ${text}` : ''}`;
            this.logger.log(`🧠 Generating text embedding for combined description...`);
            
            return await this.generateEmbedding(combinedText, modelName);
        } catch (error) {
            this.logger.error(`Gemini Multimodal Embedding Failed: ${error.message}`);
            if (text) return await this.generateEmbedding(text, modelName);
            throw error;
        }
    }

    async processAudioMessage(
        audioBuffer: Buffer,
        mimeType: string,
        products: any[],
        history: string[] = [],
        customerMemory: string = '',
        modelName?: string
    ): Promise<{ transcription: string; response: string }> {
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
${activeRules.length > 0 ? `\n\nSTORE_POLICIES_AND_FAQ:\n${activeRules.map((r: any) => `- ${r.title}: ${r.content}`).join('\n')}` : ''}
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
            // Clean JSON
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
        } catch (error) {
            this.logger.error(`Voice Processing Failed: ${error.message}`);
            throw error;
        }
    }
}
