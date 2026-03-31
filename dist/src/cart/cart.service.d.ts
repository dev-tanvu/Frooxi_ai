import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { EmotionState } from '../ai/gemini.service';
export declare class CartService {
    private prisma;
    private redis;
    private readonly logger;
    constructor(prisma: PrismaService, redis: RedisService);
    handleCartLogic(customerId: string, emotion: EmotionState, productsFound?: any[]): Promise<void>;
    addItem(customerId: string, productId: string, quantity?: number, size?: string, color?: string, operation?: 'INCREMENT' | 'SET'): Promise<{
        id: string;
        price: number | null;
        cartId: string;
        productId: string;
        productName: string;
        size: string | null;
        color: string | null;
        quantity: number;
        addedAt: Date;
        followUpCount: number;
    } | undefined>;
    getCart(customerId: string): Promise<({
        items: ({
            product: {
                name: string;
                id: string;
                createdAt: Date;
                updatedAt: Date;
                price: number | null;
                colors: string[];
                sizes: string[];
                imageUrls: string[];
                description: string | null;
                metadata: import("@prisma/client/runtime/library").JsonValue | null;
            };
        } & {
            id: string;
            price: number | null;
            cartId: string;
            productId: string;
            productName: string;
            size: string | null;
            color: string | null;
            quantity: number;
            addedAt: Date;
            followUpCount: number;
        })[];
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        customerId: string;
    }) | null>;
    clearCart(customerId: string): Promise<void>;
    removeItem(cartItemId: string): Promise<{
        id: string;
        price: number | null;
        cartId: string;
        productId: string;
        productName: string;
        size: string | null;
        color: string | null;
        quantity: number;
        addedAt: Date;
        followUpCount: number;
    }>;
    removeItemByProduct(customerId: string, productId: string, size?: string, color?: string): Promise<void>;
}
