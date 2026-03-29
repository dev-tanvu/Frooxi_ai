import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface DataRetentionSettings {
  redisMessageRetention: number; // hours
  redisConversationRetention: number; // hours
  databaseMessageRetention: number; // days
  databaseConversationRetention: number; // days
  autoCleanupEnabled: boolean;
  cleanupFrequency: number; // hours
}

export interface SpamProtectionSettings {
  maxRequestsPer30Seconds: number;
  maxRequestsPerMinute: number;
  maxRequestsPerHour: number;
  blockDuration: number; // minutes
  enableIpBlocking: boolean;
  enableUserBlocking: boolean;
  spamKeywords: string[];
  blockedUsers: string[];
  blockedIps: string[];
}

export interface DeliverySettings {
  defaultCurrency: string;
  freeDeliveryThreshold: number;
  enableDynamicPricing: boolean;
}

export interface CurrencySettings {
  supportedCurrencies: string[];
  defaultCurrency: string;
  autoUpdateRates: boolean;
  updateFrequency: number; // hours
}

export interface GeneralSettings {
  aiEnabled: boolean;
  maintenanceMode: boolean;
  debugMode: boolean;
  defaultLanguage: string;
  timezone: string;
}

@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);

  private spamCache: SpamProtectionSettings | null = null;
  private spamCacheExpiry: number = 0;
  private readonly SPAM_CACHE_TTL = 60 * 1000; // 1 min

  constructor(private prisma: PrismaService) {}

  // Generic settings methods
  async getSetting(key: string): Promise<string | null> {
    const setting = await this.prisma.systemSettings.findUnique({
      where: { key, isActive: true }
    });
    return setting?.value || null;
  }

  async setSetting(key: string, value: string, category: string): Promise<void> {
    await this.prisma.systemSettings.upsert({
      where: { key },
      update: { value, category },
      create: { key, value, category }
    });
  }

  async getSettingsByCategory(category: string): Promise<Record<string, any>> {
    const settings = await this.prisma.systemSettings.findMany({
      where: { category, isActive: true }
    });

    const result: Record<string, any> = {};
    settings.forEach((setting: any) => {
      try {
        result[setting.key] = JSON.parse(setting.value);
      } catch {
        result[setting.key] = setting.value;
      }
    });

    return result;
  }

  // Data Retention Settings
  async getDataRetentionSettings(): Promise<DataRetentionSettings> {
    const defaults: DataRetentionSettings = {
      redisMessageRetention: 24, // 24 hours
      redisConversationRetention: 72, // 3 days
      databaseMessageRetention: 90, // 90 days
      databaseConversationRetention: 365, // 1 year
      autoCleanupEnabled: true,
      cleanupFrequency: 24 // 24 hours
    };

    const settings = await this.getSettingsByCategory('data-retention');
    return { ...defaults, ...settings };
  }

  async updateDataRetentionSettings(settings: Partial<DataRetentionSettings>): Promise<void> {
    for (const [key, value] of Object.entries(settings)) {
      await this.setSetting(key, JSON.stringify(value), 'data-retention');
    }
  }

  // Spam Protection Settings
  async getSpamProtectionSettings(): Promise<SpamProtectionSettings> {
    if (this.spamCache && Date.now() < this.spamCacheExpiry) {
      return this.spamCache;
    }

    const defaults: SpamProtectionSettings = {
      maxRequestsPer30Seconds: 5,
      maxRequestsPerMinute: 10,
      maxRequestsPerHour: 100,
      blockDuration: 60, // 1 hour
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

  async updateSpamProtectionSettings(settings: Partial<SpamProtectionSettings>): Promise<void> {
    this.spamCache = null;
    for (const [key, value] of Object.entries(settings)) {
      await this.setSetting(key, JSON.stringify(value), 'spam-protection');
    }
  }

  // Delivery Zones (Now uses ShippingZone)
  async getDeliveryZones() {
    return await this.prisma.shippingZone.findMany({
      orderBy: [{ price: 'asc' }, { name: 'asc' }]
    });
  }

  async getDeliveryPriceByZone(zoneName: string): Promise<{ price: number; currency: string } | null> {
    const zone = await this.prisma.shippingZone.findFirst({
      where: { 
        name: { contains: zoneName, mode: 'insensitive' },
        active: true 
      }
    });

    return zone ? { price: zone.price, currency: 'BDT' } : null;
  }

  // Currency Management
  async getCurrencies() {
    return await this.prisma.currency.findMany({
      orderBy: [{ priority: 'desc' }, { code: 'asc' }]
    });
  }

  async createCurrency(data: { code: string; name: string; symbol: string; exchangeRate: number; priority?: number }) {
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

  async updateCurrency(id: string, data: { name?: string; symbol?: string; exchangeRate?: number; isActive?: boolean; isDefault?: boolean; priority?: number }) {
    // If setting as default, unset others
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

  async deleteCurrency(id: string) {
    return await this.prisma.currency.delete({
      where: { id }
    });
  }

  async getDefaultCurrency() {
    return await this.prisma.currency.findFirst({
      where: { isDefault: true, isActive: true }
    });
  }

  async convertCurrency(amount: number, fromCurrency: string, toCurrency: string): Promise<number> {
    const from = await this.prisma.currency.findFirst({
      where: { code: fromCurrency.toUpperCase(), isActive: true }
    });
    const to = await this.prisma.currency.findFirst({
      where: { code: toCurrency.toUpperCase(), isActive: true }
    });

    if (!from || !to) {
      throw new Error('Currency not found');
    }

    // Convert to base currency (BDT) then to target currency
    const amountInBase = amount * from.exchangeRate;
    const result = amountInBase / to.exchangeRate;

    return Math.round(result * 100) / 100; // Round to 2 decimal places
  }

  // General Settings
  async getGeneralSettings(): Promise<GeneralSettings> {
    const defaults: GeneralSettings = {
      aiEnabled: true,
      maintenanceMode: false,
      debugMode: false,
      defaultLanguage: 'en',
      timezone: 'Asia/Dhaka'
    };

    const settings = await this.getSettingsByCategory('general');
    return { ...defaults, ...settings };
  }

  async updateGeneralSettings(settings: Partial<GeneralSettings>): Promise<void> {
    for (const [key, value] of Object.entries(settings)) {
      await this.setSetting(key, JSON.stringify(value), 'general');
    }
  }

  // Initialize default settings
  async initializeDefaultSettings(): Promise<void> {
    this.logger.log('🔧 Initializing default system settings...');

    // Data Retention
    await this.updateDataRetentionSettings({
      redisMessageRetention: 24,
      redisConversationRetention: 72,
      databaseMessageRetention: 90,
      databaseConversationRetention: 365,
      autoCleanupEnabled: true,
      cleanupFrequency: 24
    });

    // Spam Protection
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



    // Default Currencies
    const existingCurrencies = await this.getCurrencies();
    if (existingCurrencies.length === 0) {
      await this.createCurrency({ code: 'BDT', name: 'Bangladeshi Taka', symbol: '৳', exchangeRate: 1, priority: 10 });
      await this.createCurrency({ code: 'USD', name: 'US Dollar', symbol: '$', exchangeRate: 120, priority: 8 });
      await this.createCurrency({ code: 'EUR', name: 'Euro', symbol: '€', exchangeRate: 130, priority: 7 });
      
      // Set BDT as default
      const bdt = await this.prisma.currency.findFirst({ where: { code: 'BDT' } });
      if (bdt) {
        await this.updateCurrency(bdt.id, { isDefault: true });
      }
    }

    // General Settings
    await this.updateGeneralSettings({
      aiEnabled: true,
      maintenanceMode: false,
      debugMode: false,
      defaultLanguage: 'en',
      timezone: 'Asia/Dhaka'
    });

    this.logger.log('✅ Default system settings initialized successfully');
  }
}
