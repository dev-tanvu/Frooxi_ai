import { StoreService } from './store.service';
export declare class StoreController {
    private storeService;
    constructor(storeService: StoreService);
    getConfig(): Promise<any>;
    updateConfig(data: any): Promise<{
        currency: string;
        id: string;
        storeName: string;
        businessDetails: string | null;
        updatedAt: Date;
    }>;
    getAllRules(): Promise<{
        id: string;
        updatedAt: Date;
        title: string;
        content: string;
        category: string;
        active: boolean;
        createdAt: Date;
    }[]>;
    createRule(data: any): Promise<{
        id: string;
        updatedAt: Date;
        title: string;
        content: string;
        category: string;
        active: boolean;
        createdAt: Date;
    }>;
    updateRule(data: any, idParam: string): Promise<{
        id: string;
        updatedAt: Date;
        title: string;
        content: string;
        category: string;
        active: boolean;
        createdAt: Date;
    }>;
    deleteRule(id: string): Promise<{
        id: string;
        updatedAt: Date;
        title: string;
        content: string;
        category: string;
        active: boolean;
        createdAt: Date;
    }>;
}
