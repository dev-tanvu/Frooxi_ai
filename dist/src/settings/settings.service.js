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
var SettingsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SettingsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
let SettingsService = SettingsService_1 = class SettingsService {
    prisma;
    logger = new common_1.Logger(SettingsService_1.name);
    spamCache = null;
    spamCacheExpiry = 0;
    SPAM_CACHE_TTL = 60 * 1000;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async getSetting(key) {
        const setting = await this.prisma.systemSettings.findUnique({
            where: { key, isActive: true }
        });
        return setting?.value || null;
    }
    async setSetting(key, value, category) {
        await this.prisma.systemSettings.upsert({
            where: { key },
            update: { value, category },
            create: { key, value, category }
        });
    }
    async getSettingsByCategory(category) {
        const settings = await this.prisma.systemSettings.findMany({
            where: { category, isActive: true }
        });
        const result = {};
        settings.forEach((setting) => {
            try {
                result[setting.key] = JSON.parse(setting.value);
            }
            catch {
                result[setting.key] = setting.value;
            }
        });
        return result;
    }
    async getDataRetentionSettings() {
        const defaults = {
            redisMessageRetention: 24,
            redisConversationRetention: 72,
            databaseMessageRetention: 90,
            databaseConversationRetention: 365,
            autoCleanupEnabled: true,
            cleanupFrequency: 24
        };
        const settings = await this.getSettingsByCategory('data-retention');
        return { ...defaults, ...settings };
    }
    async updateDataRetentionSettings(settings) {
        for (const [key, value] of Object.entries(settings)) {
            await this.setSetting(key, JSON.stringify(value), 'data-retention');
        }
    }
    async getSpamProtectionSettings() {
        if (this.spamCache && Date.now() < this.spamCacheExpiry) {
            return this.spamCache;
        }
        const defaults = {
            maxRequestsPer30Seconds: 5,
            maxRequestsPerMinute: 10,
            maxRequestsPerHour: 100,
            blockDuration: 60,
            enableIpBlocking: true,
            enableUserBlocking: true,
            spamKeywords: ['spam', 'abuse', 'fake', 'bot'],
            blockedUsers: [],
            blockedIps: []
        };
        const settings = await this.getSettingsByCategory('spam-protection');
        this.spamCache = { ...defaults, ...settings };
        this.spamCacheExpiry = Date.now() + this.SPAM_CACHE_TTL;
        return this.spamCache;
    }
    async updateSpamProtectionSettings(settings) {
        this.spamCache = null;
        for (const [key, value] of Object.entries(settings)) {
            await this.setSetting(key, JSON.stringify(value), 'spam-protection');
        }
    }
    async getDeliveryZones() {
        return await this.prisma.shippingZone.findMany({
            orderBy: [{ price: 'asc' }, { name: 'asc' }]
        });
    }
    async getDeliveryPriceByZone(zoneName) {
        const zone = await this.prisma.shippingZone.findFirst({
            where: {
                name: { contains: zoneName, mode: 'insensitive' },
                active: true
            }
        });
        return zone ? { price: zone.price, currency: 'BDT' } : null;
    }
    async getCurrencies() {
        return await this.prisma.currency.findMany({
            orderBy: [{ priority: 'desc' }, { code: 'asc' }]
        });
    }
    async createCurrency(data) {
        return await this.prisma.currency.create({
            data: {
                code: data.code.toUpperCase(),
                name: data.name,
                symbol: data.symbol,
                exchangeRate: data.exchangeRate,
                priority: data.priority || 0
            }
        });
    }
    async updateCurrency(id, data) {
        if (data.isDefault) {
            await this.prisma.currency.updateMany({
                where: { NOT: { id } },
                data: { isDefault: false }
            });
        }
        return await this.prisma.currency.update({
            where: { id },
            data
        });
    }
    async deleteCurrency(id) {
        return await this.prisma.currency.delete({
            where: { id }
        });
    }
    async getDefaultCurrency() {
        return await this.prisma.currency.findFirst({
            where: { isDefault: true, isActive: true }
        });
    }
    async convertCurrency(amount, fromCurrency, toCurrency) {
        const from = await this.prisma.currency.findFirst({
            where: { code: fromCurrency.toUpperCase(), isActive: true }
        });
        const to = await this.prisma.currency.findFirst({
            where: { code: toCurrency.toUpperCase(), isActive: true }
        });
        if (!from || !to) {
            throw new Error('Currency not found');
        }
        const amountInBase = amount * from.exchangeRate;
        const result = amountInBase / to.exchangeRate;
        return Math.round(result * 100) / 100;
    }
    async getGeneralSettings() {
        const defaults = {
            aiEnabled: true,
            maintenanceMode: false,
            debugMode: false,
            defaultLanguage: 'en',
            timezone: 'Asia/Dhaka'
        };
        const settings = await this.getSettingsByCategory('general');
        return { ...defaults, ...settings };
    }
    async updateGeneralSettings(settings) {
        for (const [key, value] of Object.entries(settings)) {
            await this.setSetting(key, JSON.stringify(value), 'general');
        }
    }
    async initializeDefaultSettings() {
        this.logger.log('🔧 Initializing default system settings...');
        await this.updateDataRetentionSettings({
            redisMessageRetention: 24,
            redisConversationRetention: 72,
            databaseMessageRetention: 90,
            databaseConversationRetention: 365,
            autoCleanupEnabled: true,
            cleanupFrequency: 24
        });
        await this.updateSpamProtectionSettings({
            maxRequestsPer30Seconds: 5,
            maxRequestsPerMinute: 10,
            maxRequestsPerHour: 100,
            blockDuration: 60,
            enableIpBlocking: true,
            enableUserBlocking: true,
            spamKeywords: ['spam', 'abuse', 'fake', 'bot'],
            blockedUsers: [],
            blockedIps: []
        });
        const existingCurrencies = await this.getCurrencies();
        if (existingCurrencies.length === 0) {
            await this.createCurrency({ code: 'BDT', name: 'Bangladeshi Taka', symbol: '৳', exchangeRate: 1, priority: 10 });
            await this.createCurrency({ code: 'USD', name: 'US Dollar', symbol: '$', exchangeRate: 120, priority: 8 });
            await this.createCurrency({ code: 'EUR', name: 'Euro', symbol: '€', exchangeRate: 130, priority: 7 });
            const bdt = await this.prisma.currency.findFirst({ where: { code: 'BDT' } });
            if (bdt) {
                await this.updateCurrency(bdt.id, { isDefault: true });
            }
        }
        await this.updateGeneralSettings({
            aiEnabled: true,
            maintenanceMode: false,
            debugMode: false,
            defaultLanguage: 'en',
            timezone: 'Asia/Dhaka'
        });
        this.logger.log('✅ Default system settings initialized successfully');
    }
};
exports.SettingsService = SettingsService;
exports.SettingsService = SettingsService = SettingsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], SettingsService);
//# sourceMappingURL=settings.service.js.map