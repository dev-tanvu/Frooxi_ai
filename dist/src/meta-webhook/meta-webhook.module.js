"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MetaWebhookModule = void 0;
const common_1 = require("@nestjs/common");
const axios_1 = require("@nestjs/axios");
const meta_webhook_controller_1 = require("./meta-webhook.controller");
const meta_webhook_service_1 = require("./meta-webhook.service");
const meta_api_service_1 = require("./meta-api.service");
const product_module_1 = require("../product/product.module");
const order_module_1 = require("../order/order.module");
const customer_module_1 = require("../customer/customer.module");
const faq_module_1 = require("../faq/faq.module");
const ai_agent_module_1 = require("../ai-agent/ai-agent.module");
const settings_module_1 = require("../settings/settings.module");
let MetaWebhookModule = class MetaWebhookModule {
};
exports.MetaWebhookModule = MetaWebhookModule;
exports.MetaWebhookModule = MetaWebhookModule = __decorate([
    (0, common_1.Module)({
        imports: [axios_1.HttpModule, product_module_1.ProductModule, order_module_1.OrderModule, customer_module_1.CustomerModule, faq_module_1.FaqModule, ai_agent_module_1.AiAgentModule, settings_module_1.SettingsModule],
        controllers: [meta_webhook_controller_1.MetaWebhookController],
        providers: [meta_webhook_service_1.MetaWebhookService, meta_api_service_1.MetaApiService],
        exports: [meta_webhook_service_1.MetaWebhookService, meta_api_service_1.MetaApiService]
    })
], MetaWebhookModule);
//# sourceMappingURL=meta-webhook.module.js.map