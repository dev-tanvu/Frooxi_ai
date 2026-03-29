"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const schedule_1 = require("@nestjs/schedule");
const throttler_1 = require("@nestjs/throttler");
const core_1 = require("@nestjs/core");
const ai_module_1 = require("./ai/ai.module");
const app_controller_1 = require("./app.controller");
const app_service_1 = require("./app.service");
const prisma_module_1 = require("./prisma/prisma.module");
const meta_webhook_module_1 = require("./meta-webhook/meta-webhook.module");
const redis_module_1 = require("./redis/redis.module");
const product_module_1 = require("./product/product.module");
const store_module_1 = require("./store/store.module");
const customer_module_1 = require("./customer/customer.module");
const conversation_module_1 = require("./conversation/conversation.module");
const shipping_module_1 = require("./shipping/shipping.module");
const order_module_1 = require("./order/order.module");
const proactive_module_1 = require("./proactive/proactive.module");
const cleanup_module_1 = require("./cleanup/cleanup.module");
const faq_module_1 = require("./faq/faq.module");
const debug_module_1 = require("./debug/debug.module");
const ai_agent_module_1 = require("./ai-agent/ai-agent.module");
const settings_module_1 = require("./settings/settings.module");
const common_module_1 = require("./common/common.module");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule.forRoot({ isGlobal: true }),
            schedule_1.ScheduleModule.forRoot(),
            throttler_1.ThrottlerModule.forRoot([{
                    ttl: 60000,
                    limit: 30,
                }]),
            prisma_module_1.PrismaModule,
            meta_webhook_module_1.MetaWebhookModule,
            ai_module_1.AiModule,
            redis_module_1.RedisModule,
            product_module_1.ProductModule,
            store_module_1.StoreModule,
            customer_module_1.CustomerModule,
            conversation_module_1.ConversationModule,
            shipping_module_1.ShippingModule,
            order_module_1.OrderModule,
            proactive_module_1.ProactiveModule,
            cleanup_module_1.CleanupModule,
            faq_module_1.FaqModule,
            debug_module_1.DebugModule,
            ai_agent_module_1.AiAgentModule,
            settings_module_1.SettingsModule,
            common_module_1.CommonModule
        ],
        controllers: [app_controller_1.AppController],
        providers: [
            app_service_1.AppService,
            {
                provide: core_1.APP_GUARD,
                useClass: throttler_1.ThrottlerGuard,
            },
        ],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map