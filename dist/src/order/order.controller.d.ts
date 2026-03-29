import { OrderService } from './order.service';
export declare class OrderController {
    private readonly orderService;
    constructor(orderService: OrderService);
    getOrders(): Promise<({
        customer: {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            name: string | null;
            metaIntegrationId: string;
            platformCustomerId: string;
            preferences: string | null;
            notes: string | null;
        };
        items: {
            id: string;
            productName: string;
            size: string | null;
            color: string | null;
            quantity: number;
            price: number;
            productId: string;
            orderId: string;
        }[];
    } & {
        id: string;
        customerName: string;
        customerPhone: string;
        customerEmail: string | null;
        deliveryAddress: string;
        totalAmount: number;
        deliveryFee: number;
        status: import(".prisma/client").$Enums.OrderStatus;
        abandonedFollowUpSent: boolean;
        feedbackRequested: boolean;
        createdAt: Date;
        updatedAt: Date;
        customerId: string;
    })[]>;
    getOrder(id: string): Promise<({
        customer: {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            name: string | null;
            metaIntegrationId: string;
            platformCustomerId: string;
            preferences: string | null;
            notes: string | null;
        };
        items: {
            id: string;
            productName: string;
            size: string | null;
            color: string | null;
            quantity: number;
            price: number;
            productId: string;
            orderId: string;
        }[];
    } & {
        id: string;
        customerName: string;
        customerPhone: string;
        customerEmail: string | null;
        deliveryAddress: string;
        totalAmount: number;
        deliveryFee: number;
        status: import(".prisma/client").$Enums.OrderStatus;
        abandonedFollowUpSent: boolean;
        feedbackRequested: boolean;
        createdAt: Date;
        updatedAt: Date;
        customerId: string;
    }) | null>;
    updateStatus(id: string, status: string): Promise<{
        id: string;
        customerName: string;
        customerPhone: string;
        customerEmail: string | null;
        deliveryAddress: string;
        totalAmount: number;
        deliveryFee: number;
        status: import(".prisma/client").$Enums.OrderStatus;
        abandonedFollowUpSent: boolean;
        feedbackRequested: boolean;
        createdAt: Date;
        updatedAt: Date;
        customerId: string;
    }>;
}
