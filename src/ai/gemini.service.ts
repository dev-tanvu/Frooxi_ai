import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { StoreService } from '../store/store.service';
import { AiAgentService } from '../ai-agent/ai-agent.service';

export interface EmotionState {
    frustration_level: number; // 0.0 to 1.0
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

@Injectable()
export class GeminiService {
    private readonly logger = new Logger(GeminiService.name);
    private genAI: GoogleGenerativeAI;
    private model: any;
    private embeddingModel: any;
    private defaultModelName: string;
    private defaultEmbeddingModelName: string;

    constructor(
        private configService: ConfigService,
        @Inject(forwardRef(() => StoreService))
        private storeService: StoreService,
        private aiAgentService: AiAgentService,
    ) {
        const apiKey = this.configService.get<string>('GEMINI_API_KEY');
        const modelName = this.configService.get<string>('GEMINI_MODEL') || 'gemini-1.5-flash';
        const embeddingModelName = this.configService.get<string>('GEMINI_EMBEDDING_MODEL') || 'gemini-embedding-2-preview';

        if (!apiKey) {
            throw new Error('GEMINI_API_KEY is not defined in environment variables');
        }

        this.genAI = new GoogleGenerativeAI(apiKey);
        this.defaultModelName = modelName;
        this.defaultEmbeddingModelName = embeddingModelName;
        this.model = this.genAI.getGenerativeModel({ model: modelName });
        this.embeddingModel = this.genAI.getGenerativeModel({ model: embeddingModelName });
    }

    public getTextModel(modelName?: string, tools?: any[]) {
        const modelOptions: any = { 
            model: modelName || this.defaultModelName 
        };
        
        if (tools && tools.length > 0) {
            modelOptions.tools = tools;
        }
        
        return this.genAI.getGenerativeModel(modelOptions);
    }

    public getEmbeddingModel(modelName?: string) {
        return this.genAI.getGenerativeModel({ model: modelName || this.defaultEmbeddingModelName });
    }

    public getDefaultModel() {
        return this.model;
    }
}
