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
exports.AiAgentController = void 0;
const common_1 = require("@nestjs/common");
const ai_agent_service_1 = require("./ai-agent.service");
const api_key_guard_1 = require("../ai/api-key.guard");
let AiAgentController = class AiAgentController {
    aiAgentService;
    constructor(aiAgentService) {
        this.aiAgentService = aiAgentService;
    }
    async getAllAgents() {
        return await this.aiAgentService.getAllAgents();
    }
    async getActiveAgents() {
        return await this.aiAgentService.getActiveAgents();
    }
    async getBestAgent() {
        return await this.aiAgentService.getBestAgent();
    }
    async getSystemMessages() {
        return await this.aiAgentService.getSystemPredefinedMessages();
    }
    async updateSystemMessages(body) {
        return await this.aiAgentService.updateSystemPredefinedMessages(body);
    }
    async getAgentById(id) {
        return await this.aiAgentService.getAgentById(id);
    }
    async updateAgent(id, updateAgentDto) {
        return await this.aiAgentService.updateAgent(id, updateAgentDto);
    }
    async toggleAgent(id) {
        return await this.aiAgentService.toggleAgentStatus(id);
    }
    async updateAgentStatus(id, body) {
        return await this.aiAgentService.updateAgentStatus(id, body.isActive);
    }
    async updateAgentStats(id, stats) {
        return await this.aiAgentService.updateAgentStats(id, stats.conversationCount, stats.messageCount);
    }
};
exports.AiAgentController = AiAgentController;
__decorate([
    (0, common_1.Get)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AiAgentController.prototype, "getAllAgents", null);
__decorate([
    (0, common_1.Get)('active'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AiAgentController.prototype, "getActiveAgents", null);
__decorate([
    (0, common_1.Get)('best'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AiAgentController.prototype, "getBestAgent", null);
__decorate([
    (0, common_1.Get)('system-messages'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AiAgentController.prototype, "getSystemMessages", null);
__decorate([
    (0, common_1.Put)('system-messages'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AiAgentController.prototype, "updateSystemMessages", null);
__decorate([
    (0, common_1.Get)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AiAgentController.prototype, "getAgentById", null);
__decorate([
    (0, common_1.Put)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], AiAgentController.prototype, "updateAgent", null);
__decorate([
    (0, common_1.Put)(':id/toggle'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AiAgentController.prototype, "toggleAgent", null);
__decorate([
    (0, common_1.Put)(':id/status'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], AiAgentController.prototype, "updateAgentStatus", null);
__decorate([
    (0, common_1.Put)(':id/stats'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], AiAgentController.prototype, "updateAgentStats", null);
exports.AiAgentController = AiAgentController = __decorate([
    (0, common_1.Controller)('ai-agents'),
    (0, common_1.UseGuards)(api_key_guard_1.ApiKeyGuard),
    __metadata("design:paramtypes", [ai_agent_service_1.AiAgentService])
], AiAgentController);
//# sourceMappingURL=ai-agent.controller.js.map