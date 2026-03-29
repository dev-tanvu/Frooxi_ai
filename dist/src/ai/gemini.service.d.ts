import { ConfigService } from '@nestjs/config';
import { StoreService } from '../store/store.service';
import { AiAgentService } from '../ai-agent/ai-agent.service';
export interface EmotionState {
    frustration_level: number;
    intent: 'Browsing' | 'Support' | 'Ordering' | 'Buying' | 'Handoff' | 'Greeting' | 'Other';
    urgency: 'Low' | 'Medium' | 'High';
    style: 'Short' | 'Detailed' | 'Casual' | 'Formal';
    search_queries?: string[];
}
export declare class GeminiService {
    private configService;
    private storeService;
    private aiAgentService;
    private readonly logger;
    private genAI;
    private model;
    private embeddingModel;
    private defaultModelName;
    private defaultEmbeddingModelName;
    constructor(configService: ConfigService, storeService: StoreService, aiAgentService: AiAgentService);
    private getTextModel;
    private getEmbeddingModel;
    analyzeEmotionAndIntent(prompt: string, history?: string[], modelName?: string): Promise<EmotionState>;
    extractBehavioralProfile(history: string[], currentProfile?: string, modelName?: string): Promise<string>;
    generateSalesResponse(prompt: string, products: any[], history?: string[], customerMemory?: string, isOrdering?: boolean, emotionState?: EmotionState | null, modelName?: string): Promise<string>;
    generateOrderResponse(prompt: string, products: any[], history?: string[], customerMemory?: string, modelName?: string): Promise<string>;
    analyzeImage(imageBuffer: Buffer, mimeType: string, prompt: string): Promise<string>;
    generateEmbedding(text: string, modelName?: string): Promise<number[]>;
    generateMultimodalEmbedding(text: string, imageBuffer: Buffer, mimeType: string, modelName?: string): Promise<number[]>;
    processAudioMessage(audioBuffer: Buffer, mimeType: string, products: any[], history?: string[], customerMemory?: string, modelName?: string): Promise<{
        transcription: string;
        response: string;
    }>;
}
