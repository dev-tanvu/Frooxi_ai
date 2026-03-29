import { Module } from '@nestjs/common';
import { AiAgentController } from './ai-agent.controller';
import { AiAgentService } from './ai-agent.service';
// import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [
    // PrismaModule, // Temporarily commented out
  ],
  controllers: [AiAgentController],
  providers: [AiAgentService],
  exports: [AiAgentService],
})
export class AiAgentModule {}
