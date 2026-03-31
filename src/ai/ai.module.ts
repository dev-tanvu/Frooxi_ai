import { Module, Global } from '@nestjs/common';
import { GeminiService } from './gemini.service';
import { GeminiBehaviourService } from './gemini-behaviour.service';
import { GeminiResponseService } from './gemini-response.service';
import { GeminiMultimodalService } from './gemini-multimodal.service';
import { PineconeService } from './pinecone.service';
import { AiController } from './ai.controller';
import { StoreModule } from '../store/store.module';
import { FaqModule } from '../faq/faq.module';
import { AiAgentModule } from '../ai-agent/ai-agent.module';

@Global()
@Module({
    imports: [StoreModule, FaqModule, AiAgentModule],
    providers: [
        GeminiService, 
        GeminiBehaviourService, 
        GeminiResponseService, 
        GeminiMultimodalService, 
        PineconeService
    ],
    controllers: [AiController],
    exports: [
        GeminiService, 
        GeminiBehaviourService, 
        GeminiResponseService, 
        GeminiMultimodalService, 
        PineconeService
    ],
})
export class AiModule { }
