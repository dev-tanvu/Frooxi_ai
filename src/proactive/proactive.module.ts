import { Module } from '@nestjs/common';
import { ProactiveService } from './proactive.service';
import { MetaWebhookModule } from '../meta-webhook/meta-webhook.module';

@Module({
  imports: [MetaWebhookModule],
  providers: [ProactiveService]
})
export class ProactiveModule {}
