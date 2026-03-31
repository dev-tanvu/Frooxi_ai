import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ProactiveService } from './proactive.service';
import { ProactiveProcessor } from './proactive.processor';
import { MetaWebhookModule } from '../meta-webhook/meta-webhook.module';

@Module({
  imports: [
    MetaWebhookModule,
    BullModule.registerQueue({ name: 'proactive' }),
  ],
  providers: [ProactiveService, ProactiveProcessor],
  exports: [ProactiveService]
})
export class ProactiveModule {}
