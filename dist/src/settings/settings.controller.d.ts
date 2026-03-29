import { SettingsService } from './settings.service';
export declare class SettingsController {
    private readonly settingsService;
    constructor(settingsService: SettingsService);
    getAllSettings(): Promise<{
        dataRetention: import("./settings.service").DataRetentionSettings;
        spamProtection: import("./settings.service").SpamProtectionSettings;
        general: import("./settings.service").GeneralSettings;
        deliveryZones: {
            id: string;
            updatedAt: Date;
            name: string;
            active: boolean;
            createdAt: Date;
            price: number;
            division: string | null;
            district: string | null;
            thana: string | null;
        }[];
        currencies: {
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
        }[];
    }>;
    getDataRetentionSettings(): Promise<import("./settings.service").DataRetentionSettings>;
    updateDataRetentionSettings(settings: any): Promise<{
        message: string;
    }>;
    getSpamProtectionSettings(): Promise<import("./settings.service").SpamProtectionSettings>;
    updateSpamProtectionSettings(settings: any): Promise<{
        message: string;
    }>;
    getGeneralSettings(): Promise<import("./settings.service").GeneralSettings>;
    updateGeneralSettings(settings: any): Promise<{
        message: string;
    }>;
    getDeliveryZones(): Promise<{
        id: string;
        updatedAt: Date;
        name: string;
        active: boolean;
        createdAt: Date;
        price: number;
        division: string | null;
        district: string | null;
        thana: string | null;
    }[]>;
    getDeliveryPrice(zone: string): Promise<{
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
        message: string;
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
    convertCurrency(amount: number, from: string, to: string): Promise<{
        amount: number;
        from: string;
        to: string;
        result: number;
    }>;
    initializeDefaultSettings(): Promise<{
        message: string;
    }>;
}
