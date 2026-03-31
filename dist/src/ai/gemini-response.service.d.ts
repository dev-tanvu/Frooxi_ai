import { StoreService } from '../store/store.service';
import { AiAgentService } from '../ai-agent/ai-agent.service';
import { GeminiService, EmotionState } from './gemini.service';
export declare class GeminiResponseService {
    private storeService;
    private aiAgentService;
    private gemini;
    private readonly logger;
    constructor(storeService: StoreService, aiAgentService: AiAgentService, gemini: GeminiService);
    generateSalesResponse(prompt: string, products: any[], history?: string[], customerMemory?: string, isOrdering?: boolean, emotionState?: EmotionState | null, modelName?: string): Promise<string>;
    private readonly orderTools;
    generateOrderResponse(prompt: string, products: any[], history?: string[], customerMemory?: string, modelName?: string): Promise<{
        text: string;
        toolCalls?: any[];
    }>;
}
