import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { MetaWebhookController } from './meta-webhook.controller';
import { MetaWebhookService } from './meta-webhook.service';
import { MetaApiService } from './meta-api.service';
import { ProductModule } from '../product/product.module';
import { OrderModule } from '../order/order.module';
import { CustomerModule } from '../customer/customer.module';
import { FaqModule } from '../faq/faq.module';
import { AiAgentModule } from '../ai-agent/ai-agent.module';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [HttpModule, ProductModule, OrderModule, CustomerModule, FaqModule, AiAgentModule, SettingsModule],
  controllers: [MetaWebhookController],
  providers: [MetaWebhookService, MetaApiService],
  exports: [MetaWebhookService, MetaApiService]
})
export class MetaWebhookModule { }
