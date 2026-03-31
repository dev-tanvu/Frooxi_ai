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
var StoreService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.StoreService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
let StoreService = StoreService_1 = class StoreService {
    prisma;
    logger = new common_1.Logger(StoreService_1.name);
    configCache = null;
    configCacheExpiry = 0;
    rulesCache = null;
    rulesCacheExpiry = 0;
    CACHE_TTL = 5 * 60 * 1000;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async onModuleInit() {
        await this.ensureConfigExists();
    }
    async ensureConfigExists() {
        const configCount = await this.prisma.storeConfig.count();
        if (configCount === 0) {
            this.logger.log('🌱 Initializing default store configuration...');
            await this.prisma.storeConfig.create({
                data: {
                    storeName: 'Frooxi',
                    currency: 'BDT',
                    businessDetails: 'Frooxi is a premium fashion and product discovery platform.',
                },
            });
        }
    }
    async getConfig() {
        if (this.configCache && Date.now() < this.configCacheExpiry) {
            return this.configCache;
        }
        let retries = 3;
        while (retries > 0) {
            try {
                this.configCache = await this.prisma.storeConfig.findFirst();
                this.configCacheExpiry = Date.now() + this.CACHE_TTL;
                return this.configCache;
            }
            catch (err) {
                retries--;
                if (retries === 0) {
                    this.logger.error(`Database connection failed in getConfig: ${err.message}`);
                    return { businessDetails: 'Frooxi', defaultSystem: true };
                }
                await new Promise(res => setTimeout(res, 1000));
            }
        }
    }
    async updateConfig(data) {
        const config = await this.getConfig();
        if (!config)
            throw new Error('Store configuration not found');
        this.configCache = null;
        return this.prisma.storeConfig.update({
            where: { id: config.id },
            data,
        });
    }
    async findAllRules() {
        return this.prisma.storeRule.findMany({
            orderBy: { updatedAt: 'desc' },
        });
    }
    async findActiveRules() {
        if (this.rulesCache && Date.now() < this.rulesCacheExpiry) {
            return this.rulesCache;
        }
        let retries = 3;
        while (retries > 0) {
            try {
                this.rulesCache = await this.prisma.storeRule.findMany({
                    where: { active: true },
                });
                this.rulesCacheExpiry = Date.now() + this.CACHE_TTL;
                return this.rulesCache;
            }
            catch (err) {
                retries--;
                if (retries === 0) {
                    this.logger.error(`Database connection failed in findActiveRules: ${err.message}`);
                    return [];
                }
                await new Promise(res => setTimeout(res, 1000));
            }
        }
    }
    async createRule(data) {
        this.rulesCache = null;
        return this.prisma.storeRule.create({ data });
    }
    async updateRule(id, data) {
        this.rulesCache = null;
        return this.prisma.storeRule.update({
            where: { id },
            data,
        });
    }
    async deleteRule(id) {
        this.rulesCache = null;
        return this.prisma.storeRule.delete({
            where: { id },
        });
    }
};
exports.StoreService = StoreService;
exports.StoreService = StoreService = StoreService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], StoreService);
//# sourceMappingURL=store.service.js.map