import { ConfigService } from '@nestjs/config';
import { StoreService } from '../store/store.service';
import { AiAgentService } from '../ai-agent/ai-agent.service';
export interface EmotionState {
    frustration_level: number;
    intent: 'Browsing' | 'Support' | 'Ordering' | 'Buying' | 'Handoff' | 'Greeting' | 'Other';
    urgency: 'Low' | 'Medium' | 'High';
    style: 'Short' | 'Detailed' | 'Casual' | 'Formal';
    search_queries?: string[];
    product_interest?: 'NONE' | 'DISCUSSING' | 'CONFIRMED' | 'REMOVING' | 'CLEAR_ALL';
    quantity?: number;
    quantity_operation?: 'INCREMENT' | 'SET';
    size?: string;
    color?: string;
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
    getTextModel(modelName?: string, tools?: any[]): import("@google/generative-ai").GenerativeModel;
    getEmbeddingModel(modelName?: string): import("@google/generative-ai").GenerativeModel;
    getDefaultModel(): any;
}
