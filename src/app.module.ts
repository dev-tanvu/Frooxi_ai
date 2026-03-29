import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AiModule } from './ai/ai.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { MetaWebhookModule } from './meta-webhook/meta-webhook.module';
import { RedisModule } from './redis/redis.module';
import { ProductModule } from './product/product.module';
import { StoreModule } from './store/store.module';
import { CustomerModule } from './customer/customer.module';
import { ConversationModule } from './conversation/conversation.module';
import { ShippingModule } from './shipping/shipping.module';
import { OrderModule } from './order/order.module';
import { ProactiveModule } from './proactive/proactive.module';
import { CleanupModule } from './cleanup/cleanup.module';
import { FaqModule } from './faq/faq.module';
import { DebugModule } from './debug/debug.module';
import { AiAgentModule } from './ai-agent/ai-agent.module';
import { SettingsModule } from './settings/settings.module';
import { CommonModule } from './common/common.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{
      ttl: 60000,
      limit: 30, // 30 requests per minute by default
    }]),
    PrismaModule,
    MetaWebhookModule,
    AiModule,
    RedisModule,
    ProductModule,
    StoreModule,
    CustomerModule,
    ConversationModule,
    ShippingModule,
    OrderModule,
    ProactiveModule,
    CleanupModule,
    FaqModule,
    DebugModule,
    AiAgentModule,
    SettingsModule,
    CommonModule
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule { }
