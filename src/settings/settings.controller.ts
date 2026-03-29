import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { ApiKeyGuard } from '../ai/api-key.guard';

@Controller('settings')
@UseGuards(ApiKeyGuard)
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  // Generic Settings
  @Get()
  async getAllSettings() {
    return {
      dataRetention: await this.settingsService.getDataRetentionSettings(),
      spamProtection: await this.settingsService.getSpamProtectionSettings(),
      general: await this.settingsService.getGeneralSettings(),
      deliveryZones: await this.settingsService.getDeliveryZones(),
      currencies: await this.settingsService.getCurrencies()
    };
  }

  // Data Retention Settings
  @Get('data-retention')
  async getDataRetentionSettings() {
    return await this.settingsService.getDataRetentionSettings();
  }

  @Put('data-retention')
  async updateDataRetentionSettings(@Body() settings: any) {
    await this.settingsService.updateDataRetentionSettings(settings);
    return { message: 'Data retention settings updated successfully' };
  }

  // Spam Protection Settings
  @Get('spam-protection')
  async getSpamProtectionSettings() {
    return await this.settingsService.getSpamProtectionSettings();
  }

  @Put('spam-protection')
  async updateSpamProtectionSettings(@Body() settings: any) {
    await this.settingsService.updateSpamProtectionSettings(settings);
    return { message: 'Spam protection settings updated successfully' };
  }

  // General Settings
  @Get('general')
  async getGeneralSettings() {
    return await this.settingsService.getGeneralSettings();
  }

  @Put('general')
  async updateGeneralSettings(@Body() settings: any) {
    await this.settingsService.updateGeneralSettings(settings);
    return { message: 'General settings updated successfully' };
  }

  @Get('delivery-zones')
  async getDeliveryZones() {
    return await this.settingsService.getDeliveryZones();
  }

  @Get('delivery-price')
  async getDeliveryPrice(@Query('zone') zone: string) {
    return await this.settingsService.getDeliveryPriceByZone(zone);
  }

  // Currency Management
  @Get('currencies')
  async getCurrencies() {
    return await this.settingsService.getCurrencies();
  }

  @Post('currencies')
  async createCurrency(@Body() data: { code: string; name: string; symbol: string; exchangeRate: number; priority?: number }) {
    return await this.settingsService.createCurrency(data);
  }

  @Put('currencies/:id')
  async updateCurrency(
    @Param('id') id: string,
    @Body() data: { name?: string; symbol?: string; exchangeRate?: number; isActive?: boolean; isDefault?: boolean; priority?: number }
  ) {
    return await this.settingsService.updateCurrency(id, data);
  }

  @Delete('currencies/:id')
  async deleteCurrency(@Param('id') id: string) {
    await this.settingsService.deleteCurrency(id);
    return { message: 'Currency deleted successfully' };
  }

  @Get('currencies/default')
  async getDefaultCurrency() {
    return await this.settingsService.getDefaultCurrency();
  }

  @Get('currency-convert')
  async convertCurrency(
    @Query('amount') amount: number,
    @Query('from') from: string,
    @Query('to') to: string
  ) {
    const result = await this.settingsService.convertCurrency(amount, from, to);
    return { amount, from, to, result };
  }

  // Initialize Default Settings
  @Post('initialize')
  async initializeDefaultSettings() {
    await this.settingsService.initializeDefaultSettings();
    return { message: 'Default settings initialized successfully' };
  }
}
