import { OrderService } from '../order/order.service';
import { CartService } from '../cart/cart.service';
import { RedisService } from '../redis/redis.service';
export declare class OrderLogicService {
    private orderService;
    private cartService;
    private redis;
    private readonly logger;
    constructor(orderService: OrderService, cartService: CartService, redis: RedisService);
    handleToolCall(call: any, customerId: string): Promise<{
        success: boolean;
        error?: string;
        response?: string;
    }>;
    generateDraftStatusResponse(customerId: string): Promise<string>;
    extractAndProcessOrder(text: string, customerId: string): Promise<{
        success: boolean;
        error?: string;
    }>;
    extractTagJson(text: string, tag: string): string | null;
    stripMarkdown(text: string): string;
    buildProductContext(p: any): {
        id: any;
        name: any;
        price: any;
        images: any;
    };
}
