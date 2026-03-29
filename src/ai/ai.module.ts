import { Module, Global } from '@nestjs/common';
import { GeminiService } from './gemini.service';
import { PineconeService } from './pinecone.service';
import { AiController } from './ai.controller';
import { StoreModule } from '../store/store.module';
import { FaqModule } from '../faq/faq.module';
import { AiAgentModule } from '../ai-agent/ai-agent.module';

@Global()
@Module({
    imports: [StoreModule, FaqModule, AiAgentModule],
    providers: [GeminiService, PineconeService],
    controllers: [AiController],
    exports: [GeminiService, PineconeService],
})
export class AiModule { }
