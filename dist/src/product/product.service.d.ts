import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { GeminiService } from '../ai/gemini.service';
import { PineconeService } from '../ai/pinecone.service';
import { RedisService } from '../redis/redis.service';
export declare class ProductService {
    private prisma;
    private gemini;
    private pinecone;
    private redis;
    private readonly logger;
    constructor(prisma: PrismaService, gemini: GeminiService, pinecone: PineconeService, redis: RedisService);
    upsertProducts(products: any[]): Promise<void>;
    private syncSingleProduct;
    searchProducts(query: string, limit?: number): Promise<any>;
    private isGibberish;
    getFeaturedProducts(limit?: number): Promise<{
        id: string;
        updatedAt: Date;
        name: string;
        createdAt: Date;
        price: number | null;
        colors: string[];
        sizes: string[];
        imageUrls: string[];
        description: string | null;
        metadata: Prisma.JsonValue | null;
    }[]>;
    findAll(params: {
        skip?: number;
        take?: number;
        search?: string;
    }): Promise<{
        id: string;
        updatedAt: Date;
        name: string;
        createdAt: Date;
        price: number | null;
        colors: string[];
        sizes: string[];
        imageUrls: string[];
        description: string | null;
        metadata: Prisma.JsonValue | null;
    }[]>;
    findOne(id: string): Promise<{
        id: string;
        updatedAt: Date;
        name: string;
        createdAt: Date;
        price: number | null;
        colors: string[];
        sizes: string[];
        imageUrls: string[];
        description: string | null;
        metadata: Prisma.JsonValue | null;
    } | null>;
    create(data: any): Promise<{
        id: string;
        updatedAt: Date;
        name: string;
        createdAt: Date;
        price: number | null;
        colors: string[];
        sizes: string[];
        imageUrls: string[];
        description: string | null;
        metadata: Prisma.JsonValue | null;
    }>;
    update(id: string, data: any): Promise<{
        id: string;
        updatedAt: Date;
        name: string;
        createdAt: Date;
        price: number | null;
        colors: string[];
        sizes: string[];
        imageUrls: string[];
        description: string | null;
        metadata: Prisma.JsonValue | null;
    }>;
    delete(id: string): Promise<{
        id: string;
        updatedAt: Date;
        name: string;
        createdAt: Date;
        price: number | null;
        colors: string[];
        sizes: string[];
        imageUrls: string[];
        description: string | null;
        metadata: Prisma.JsonValue | null;
    }>;
    private syncToPinecone;
}
