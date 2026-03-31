import { ProductService } from './product.service';
export declare class ProductController {
    private readonly productService;
    private readonly logger;
    private readonly SYNC_SECRET;
    constructor(productService: ProductService);
    syncProducts(body: {
        products: any[];
    }, secret: string): Promise<{
        message: string;
        count: number;
    }>;
    findAll(): Promise<{
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
    }[]>;
    findOne(id: string): Promise<{
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
    } | null>;
    create(data: any): Promise<{
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
    }>;
    update(id: string, data: any): Promise<{
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
    }>;
    remove(id: string): Promise<{
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
    }>;
}
