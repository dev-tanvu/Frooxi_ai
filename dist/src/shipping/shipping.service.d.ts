import { OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
export declare class ShippingService implements OnModuleInit {
    private prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    onModuleInit(): Promise<void>;
    private seedDefaultZones;
    findAll(): Promise<{
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
    findByName(name: string): Promise<{
        id: string;
        updatedAt: Date;
        name: string;
        active: boolean;
        createdAt: Date;
        division: string | null;
        district: string | null;
        thana: string | null;
        price: number;
    } | null>;
    calculateDeliveryFee(location: string): Promise<number>;
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
