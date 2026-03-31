import { StoreService } from '../store/store.service';
import { AiAgentService } from '../ai-agent/ai-agent.service';
import { GeminiService, EmotionState } from './gemini.service';
export declare class GeminiBehaviourService {
    private storeService;
    private aiAgentService;
    private gemini;
    private readonly logger;
    constructor(storeService: StoreService, aiAgentService: AiAgentService, gemini: GeminiService);
    analyzeEmotionAndIntent(prompt: string, history?: string[], modelName?: string): Promise<EmotionState>;
    extractBehavioralProfile(history: string[], currentProfile?: string, modelName?: string): Promise<string>;
}
