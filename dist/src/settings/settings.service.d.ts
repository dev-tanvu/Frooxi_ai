import { PrismaService } from '../prisma/prisma.service';
export interface DataRetentionSettings {
    redisMessageRetention: number;
    redisConversationRetention: number;
    databaseMessageRetention: number;
    databaseConversationRetention: number;
    autoCleanupEnabled: boolean;
    cleanupFrequency: number;
}
export interface SpamProtectionSettings {
    maxRequestsPer30Seconds: number;
    maxRequestsPerMinute: number;
    maxRequestsPerHour: number;
    blockDuration: number;
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
    updateFrequency: number;
}
export interface GeneralSettings {
    aiEnabled: boolean;
    maintenanceMode: boolean;
    debugMode: boolean;
    defaultLanguage: string;
    timezone: string;
}
export declare class SettingsService {
    private prisma;
    private readonly logger;
    private spamCache;
    private spamCacheExpiry;
    private readonly SPAM_CACHE_TTL;
    constructor(prisma: PrismaService);
    getSetting(key: string): Promise<string | null>;
    setSetting(key: string, value: string, category: string): Promise<void>;
    getSettingsByCategory(category: string): Promise<Record<string, any>>;
    getDataRetentionSettings(): Promise<DataRetentionSettings>;
    updateDataRetentionSettings(settings: Partial<DataRetentionSettings>): Promise<void>;
    getSpamProtectionSettings(): Promise<SpamProtectionSettings>;
    updateSpamProtectionSettings(settings: Partial<SpamProtectionSettings>): Promise<void>;
    getDeliveryZones(): Promise<{
        id: string;
        updatedAt: Date;
        name: string;
        active: boolean;
        createdAt: Date;
        division: string | null;
        district: string | null;
        thana: string | null;
        price: number;
    }[]>;
    getDeliveryPriceByZone(zoneName: string): Promise<{
        price: number;
        currency: string;
    } | null>;
    getCurrencies(): Promise<{
        symbol: string;
        id: string;
        updatedAt: Date;
        name: string;
        createdAt: Date;
        isActive: boolean;
        priority: number;
        code: string;
        exchangeRate: number;
        isDefault: boolean;
    }[]>;
    createCurrency(data: {
        code: string;
        name: string;
        symbol: string;
        exchangeRate: number;
        priority?: number;
    }): Promise<{
        symbol: string;
        id: string;
        updatedAt: Date;
        name: string;
        createdAt: Date;
        isActive: boolean;
        priority: number;
        code: string;
        exchangeRate: number;
        isDefault: boolean;
    }>;
    updateCurrency(id: string, data: {
        name?: string;
        symbol?: string;
        exchangeRate?: number;
        isActive?: boolean;
        isDefault?: boolean;
        priority?: number;
    }): Promise<{
        symbol: string;
        id: string;
        updatedAt: Date;
        name: string;
        createdAt: Date;
        isActive: boolean;
        priority: number;
        code: string;
        exchangeRate: number;
        isDefault: boolean;
    }>;
    deleteCurrency(id: string): Promise<{
        symbol: string;
        id: string;
        updatedAt: Date;
        name: string;
        createdAt: Date;
        isActive: boolean;
        priority: number;
        code: string;
        exchangeRate: number;
        isDefault: boolean;
    }>;
    getDefaultCurrency(): Promise<{
        symbol: string;
        id: string;
        updatedAt: Date;
        name: string;
        createdAt: Date;
        isActive: boolean;
        priority: number;
        code: string;
        exchangeRate: number;
        isDefault: boolean;
    } | null>;
    convertCurrency(amount: number, fromCurrency: string, toCurrency: string): Promise<number>;
    getGeneralSettings(): Promise<GeneralSettings>;
    updateGeneralSettings(settings: Partial<GeneralSettings>): Promise<void>;
    initializeDefaultSettings(): Promise<void>;
}
