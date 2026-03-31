import { StoreService } from '../store/store.service';
import { AiAgentService } from '../ai-agent/ai-agent.service';
import { GeminiService } from './gemini.service';
export declare class GeminiMultimodalService {
    private storeService;
    private aiAgentService;
    private gemini;
    private readonly logger;
    constructor(storeService: StoreService, aiAgentService: AiAgentService, gemini: GeminiService);
    analyzeImage(imageBuffer: Buffer, mimeType: string, prompt: string): Promise<string>;
    generateEmbedding(text: string, modelName?: string): Promise<number[]>;
    generateMultimodalEmbedding(text: string, imageBuffer: Buffer, mimeType: string, modelName?: string): Promise<number[]>;
    processAudioMessage(audioBuffer: Buffer, mimeType: string, products: any[], history?: string[], customerMemory?: string, modelName?: string): Promise<{
        transcription: string;
        response: string;
    }>;
}
