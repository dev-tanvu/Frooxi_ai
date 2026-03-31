import { OrderService } from './order.service';
export declare class OrderController {
    private readonly orderService;
    constructor(orderService: OrderService);
    getOrders(): Promise<({
        customer: {
            id: string;
            updatedAt: Date;
            name: string | null;
            createdAt: Date;
            metaIntegrationId: string;
            platformCustomerId: string;
            preferences: string | null;
            notes: string | null;
            lastReadAt: Date | null;
            isOptedOut: boolean;
        };
        items: {
            id: string;
            price: number;
            productName: string;
            size: string | null;
            color: string | null;
            quantity: number;
            productId: string;
            orderId: string;
        }[];
    } & {
        id: string;
        updatedAt: Date;
        createdAt: Date;
        customerId: string;
        customerName: string;
        customerPhone: string;
        customerEmail: string | null;
        deliveryAddress: string;
        totalAmount: number;
        deliveryFee: number;
        status: import(".prisma/client").$Enums.OrderStatus;
        abandonedFollowUpSent: boolean;
        feedbackRequested: boolean;
    })[]>;
    getOrder(id: string): Promise<({
        customer: {
            id: string;
            updatedAt: Date;
            name: string | null;
            createdAt: Date;
            metaIntegrationId: string;
            platformCustomerId: string;
            preferences: string | null;
            notes: string | null;
            lastReadAt: Date | null;
            isOptedOut: boolean;
        };
        items: {
            id: string;
            price: number;
            productName: string;
            size: string | null;
            color: string | null;
            quantity: number;
            productId: string;
            orderId: string;
        }[];
    } & {
        id: string;
        updatedAt: Date;
        createdAt: Date;
        customerId: string;
        customerName: string;
        customerPhone: string;
        customerEmail: string | null;
        deliveryAddress: string;
        totalAmount: number;
        deliveryFee: number;
        status: import(".prisma/client").$Enums.OrderStatus;
        abandonedFollowUpSent: boolean;
        feedbackRequested: boolean;
    }) | null>;
    updateStatus(id: string, status: string): Promise<{
        id: string;
        updatedAt: Date;
        createdAt: Date;
        customerId: string;
        customerName: string;
        customerPhone: string;
        customerEmail: string | null;
        deliveryAddress: string;
        totalAmount: number;
        deliveryFee: number;
        status: import(".prisma/client").$Enums.OrderStatus;
        abandonedFollowUpSent: boolean;
        feedbackRequested: boolean;
    }>;
}
