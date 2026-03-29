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
exports.SettingsController = void 0;
const common_1 = require("@nestjs/common");
const settings_service_1 = require("./settings.service");
const api_key_guard_1 = require("../ai/api-key.guard");
let SettingsController = class SettingsController {
    settingsService;
    constructor(settingsService) {
        this.settingsService = settingsService;
    }
    async getAllSettings() {
        return {
            dataRetention: await this.settingsService.getDataRetentionSettings(),
            spamProtection: await this.settingsService.getSpamProtectionSettings(),
            general: await this.settingsService.getGeneralSettings(),
            deliveryZones: await this.settingsService.getDeliveryZones(),
            currencies: await this.settingsService.getCurrencies()
        };
    }
    async getDataRetentionSettings() {
        return await this.settingsService.getDataRetentionSettings();
    }
    async updateDataRetentionSettings(settings) {
        await this.settingsService.updateDataRetentionSettings(settings);
        return { message: 'Data retention settings updated successfully' };
    }
    async getSpamProtectionSettings() {
        return await this.settingsService.getSpamProtectionSettings();
    }
    async updateSpamProtectionSettings(settings) {
        await this.settingsService.updateSpamProtectionSettings(settings);
        return { message: 'Spam protection settings updated successfully' };
    }
    async getGeneralSettings() {
        return await this.settingsService.getGeneralSettings();
    }
    async updateGeneralSettings(settings) {
        await this.settingsService.updateGeneralSettings(settings);
        return { message: 'General settings updated successfully' };
    }
    async getDeliveryZones() {
        return await this.settingsService.getDeliveryZones();
    }
    async getDeliveryPrice(zone) {
        return await this.settingsService.getDeliveryPriceByZone(zone);
    }
    async getCurrencies() {
        return await this.settingsService.getCurrencies();
    }
    async createCurrency(data) {
        return await this.settingsService.createCurrency(data);
    }
    async updateCurrency(id, data) {
        return await this.settingsService.updateCurrency(id, data);
    }
    async deleteCurrency(id) {
        await this.settingsService.deleteCurrency(id);
        return { message: 'Currency deleted successfully' };
    }
    async getDefaultCurrency() {
        return await this.settingsService.getDefaultCurrency();
    }
    async convertCurrency(amount, from, to) {
        const result = await this.settingsService.convertCurrency(amount, from, to);
        return { amount, from, to, result };
    }
    async initializeDefaultSettings() {
        await this.settingsService.initializeDefaultSettings();
        return { message: 'Default settings initialized successfully' };
    }
};
exports.SettingsController = SettingsController;
__decorate([
    (0, common_1.Get)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], SettingsController.prototype, "getAllSettings", null);
__decorate([
    (0, common_1.Get)('data-retention'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], SettingsController.prototype, "getDataRetentionSettings", null);
__decorate([
    (0, common_1.Put)('data-retention'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], SettingsController.prototype, "updateDataRetentionSettings", null);
__decorate([
    (0, common_1.Get)('spam-protection'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], SettingsController.prototype, "getSpamProtectionSettings", null);
__decorate([
    (0, common_1.Put)('spam-protection'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], SettingsController.prototype, "updateSpamProtectionSettings", null);
__decorate([
    (0, common_1.Get)('general'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], SettingsController.prototype, "getGeneralSettings", null);
__decorate([
    (0, common_1.Put)('general'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], SettingsController.prototype, "updateGeneralSettings", null);
__decorate([
    (0, common_1.Get)('delivery-zones'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], SettingsController.prototype, "getDeliveryZones", null);
__decorate([
    (0, common_1.Get)('delivery-price'),
    __param(0, (0, common_1.Query)('zone')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], SettingsController.prototype, "getDeliveryPrice", null);
__decorate([
    (0, common_1.Get)('currencies'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], SettingsController.prototype, "getCurrencies", null);
__decorate([
    (0, common_1.Post)('currencies'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], SettingsController.prototype, "createCurrency", null);
__decorate([
    (0, common_1.Put)('currencies/:id'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], SettingsController.prototype, "updateCurrency", null);
__decorate([
    (0, common_1.Delete)('currencies/:id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], SettingsController.prototype, "deleteCurrency", null);
__decorate([
    (0, common_1.Get)('currencies/default'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], SettingsController.prototype, "getDefaultCurrency", null);
__decorate([
    (0, common_1.Get)('currency-convert'),
    __param(0, (0, common_1.Query)('amount')),
    __param(1, (0, common_1.Query)('from')),
    __param(2, (0, common_1.Query)('to')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, String, String]),
    __metadata("design:returntype", Promise)
], SettingsController.prototype, "convertCurrency", null);
__decorate([
    (0, common_1.Post)('initialize'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], SettingsController.prototype, "initializeDefaultSettings", null);
exports.SettingsController = SettingsController = __decorate([
    (0, common_1.Controller)('settings'),
    (0, common_1.UseGuards)(api_key_guard_1.ApiKeyGuard),
    __metadata("design:paramtypes", [settings_service_1.SettingsService])
], SettingsController);
//# sourceMappingURL=settings.controller.js.map