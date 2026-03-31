import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { MetaWebhookController } from './meta-webhook.controller';
import { MetaWebhookService } from './meta-webhook.service';
import { MetaApiService } from './meta-api.service';
import { WebhookNormalizerService } from './webhook-normalizer.service';
import { WebhookStateService } from './webhook-state.service';
import { IntentRouterService } from './intent-router.service';
import { AgentLifecycleService } from './agent-lifecycle.service';
import { OrderLogicService } from './order-logic.service';
import { ProductModule } from '../product/product.module';
import { OrderModule } from '../order/order.module';
import { CustomerModule } from '../customer/customer.module';
import { FaqModule } from '../faq/faq.module';
import { AiAgentModule } from '../ai-agent/ai-agent.module';
import { SettingsModule } from '../settings/settings.module';
import { CommonModule } from '../common/common.module';
import { CartModule } from '../cart/cart.module';
import { BullModule } from '@nestjs/bullmq';
import { WebhookProcessor } from './webhook.processor';

@Module({
  imports: [
    HttpModule, 
    ProductModule, 
    OrderModule, 
    CustomerModule, 
    FaqModule, 
    AiAgentModule, 
    SettingsModule,
    CommonModule,
    CartModule,
    BullModule.registerQueue({ name: 'webhook' }),
  ],
  controllers: [MetaWebhookController],
  providers: [
    MetaWebhookService, 
    MetaApiService,
    WebhookNormalizerService,
    WebhookStateService,
    IntentRouterService,
    AgentLifecycleService,
    OrderLogicService,
    WebhookProcessor
  ],
  exports: [
    MetaWebhookService, 
    MetaApiService
  ]
})
export class MetaWebhookModule { }
