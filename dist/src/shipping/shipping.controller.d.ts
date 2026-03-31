import { ShippingService } from './shipping.service';
export declare class ShippingController {
    private readonly shippingService;
    constructor(shippingService: ShippingService);
    getZones(): Promise<{
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
    createZone(data: any): Promise<{
        id: string;
        updatedAt: Date;
        name: string;
        active: boolean;
        createdAt: Date;
        division: string | null;
        district: string | null;
        thana: string | null;
        price: number;
    }>;
    updateZone(id: string, data: any): Promise<{
        id: string;
        updatedAt: Date;
        name: string;
        active: boolean;
        createdAt: Date;
        division: string | null;
        district: string | null;
        thana: string | null;
        price: number;
    }>;
    deleteZone(id: string): Promise<{
        id: string;
        updatedAt: Date;
        name: string;
        active: boolean;
        createdAt: Date;
        division: string | null;
        district: string | null;
        thana: string | null;
        price: number;
    }>;
}
