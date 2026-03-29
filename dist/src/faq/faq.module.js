"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FaqModule = void 0;
const common_1 = require("@nestjs/common");
const faq_controller_1 = require("./faq.controller");
const faq_service_1 = require("./faq.service");
const prisma_module_1 = require("../prisma/prisma.module");
let FaqModule = class FaqModule {
};
exports.FaqModule = FaqModule;
exports.FaqModule = FaqModule = __decorate([
    (0, common_1.Module)({
        imports: [prisma_module_1.PrismaModule],
        controllers: [faq_controller_1.FaqController],
        providers: [faq_service_1.FaqService],
        exports: [faq_service_1.FaqService],
    })
], FaqModule);
//# sourceMappingURL=faq.module.js.map