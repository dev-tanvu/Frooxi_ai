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
var GeminiService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.GeminiService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const generative_ai_1 = require("@google/generative-ai");
const store_service_1 = require("../store/store.service");
const ai_agent_service_1 = require("../ai-agent/ai-agent.service");
let GeminiService = GeminiService_1 = class GeminiService {
    configService;
    storeService;
    aiAgentService;
    logger = new common_1.Logger(GeminiService_1.name);
    genAI;
    model;
    embeddingModel;
    defaultModelName;
    defaultEmbeddingModelName;
    constructor(configService, storeService, aiAgentService) {
        this.configService = configService;
        this.storeService = storeService;
        this.aiAgentService = aiAgentService;
        const apiKey = this.configService.get('GEMINI_API_KEY');
        const modelName = this.configService.get('GEMINI_MODEL') || 'gemini-1.5-flash';
        const embeddingModelName = this.configService.get('GEMINI_EMBEDDING_MODEL') || 'gemini-embedding-2-preview';
        if (!apiKey) {
            throw new Error('GEMINI_API_KEY is not defined in environment variables');
        }
        this.genAI = new generative_ai_1.GoogleGenerativeAI(apiKey);
        this.defaultModelName = modelName;
        this.defaultEmbeddingModelName = embeddingModelName;
        this.model = this.genAI.getGenerativeModel({ model: modelName });
        this.embeddingModel = this.genAI.getGenerativeModel({ model: embeddingModelName });
    }
    getTextModel(modelName, tools) {
        const modelOptions = {
            model: modelName || this.defaultModelName
        };
        if (tools && tools.length > 0) {
            modelOptions.tools = tools;
        }
        return this.genAI.getGenerativeModel(modelOptions);
    }
    getEmbeddingModel(modelName) {
        return this.genAI.getGenerativeModel({ model: modelName || this.defaultEmbeddingModelName });
    }
    getDefaultModel() {
        return this.model;
    }
};
exports.GeminiService = GeminiService;
exports.GeminiService = GeminiService = GeminiService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, common_1.Inject)((0, common_1.forwardRef)(() => store_service_1.StoreService))),
    __metadata("design:paramtypes", [config_1.ConfigService,
        store_service_1.StoreService,
        ai_agent_service_1.AiAgentService])
], GeminiService);
//# sourceMappingURL=gemini.service.js.map