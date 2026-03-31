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
var ProactiveProcessor_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProactiveProcessor = void 0;
const bullmq_1 = require("@nestjs/bullmq");
const common_1 = require("@nestjs/common");
const proactive_service_1 = require("./proactive.service");
let ProactiveProcessor = ProactiveProcessor_1 = class ProactiveProcessor extends bullmq_1.WorkerHost {
    proactiveService;
    logger = new common_1.Logger(ProactiveProcessor_1.name);
    constructor(proactiveService) {
        super();
        this.proactiveService = proactiveService;
    }
    async process(job) {
        this.logger.log(`⚙️ Processing proactive task: ${job.name}`);
        try {
            switch (job.name) {
                case 'handle-abandoned-carts':
                    await this.proactiveService.handleAbandonedCarts();
                    break;
                case 'handle-feedback-loop':
                    await this.proactiveService.handlePostPurchaseFeedback();
                    break;
                default:
                    this.logger.warn(`Unknown job: ${job.name}`);
            }
        }
        catch (error) {
            this.logger.error(`❌ Proactive job ${job.name} failed: ${error.message}`, error.stack);
            throw error;
        }
    }
};
exports.ProactiveProcessor = ProactiveProcessor;
exports.ProactiveProcessor = ProactiveProcessor = ProactiveProcessor_1 = __decorate([
    (0, bullmq_1.Processor)('proactive'),
    __metadata("design:paramtypes", [proactive_service_1.ProactiveService])
], ProactiveProcessor);
//# sourceMappingURL=proactive.processor.js.map