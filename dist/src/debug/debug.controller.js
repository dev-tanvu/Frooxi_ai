"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DebugController = void 0;
const common_1 = require("@nestjs/common");
const faq_service_1 = require("../faq/faq.service");
const api_key_guard_1 = require("../ai/api-key.guard");
let DebugController = class DebugController {
    faqService;
    constructor(faqService) {
        this.faqService = faqService;
    }
    async testFaq(message) {
        const result = await this.faqService.findFaqMatch(message);
        return {
            message,
            result,
            timestamp: new Date().toISOString()
        };
    }
};
exports.DebugController = DebugController;
__decorate([
    (0, common_1.Get)('faq-test'),
    __param(0, (0, common_1.Query)('message')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], DebugController.prototype, "testFaq", null);
exports.DebugController = DebugController = __decorate([
    (0, common_1.Controller)('debug'),
    (0, common_1.UseGuards)(api_key_guard_1.ApiKeyGuard),
    __metadata("design:paramtypes", [faq_service_1.FaqService])
], DebugController);
//# sourceMappingURL=debug.controller.js.map