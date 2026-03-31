import { PrismaService } from '../prisma/prisma.service';
import { ShippingService } from '../shipping/shipping.service';
export declare class OrderService {
    private prisma;
    private shippingService;
    private readonly logger;
    constructor(prisma: PrismaService, shippingService: ShippingService);
    private resolveProducts;
    createOrder(data: any): Promise<{
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
    }>;
    createOrdersFromCart(cart: any, customerId: string): Promise<({
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
    findAll(): Promise<({
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
    findByCustomer(customerId: string): Promise<({
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
    updateStatus(id: string, status: any): Promise<{
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
    updateOrder(id: string, data: any): Promise<{
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
    }>;
    confirmOrder(id: string): Promise<{
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
    }>;
    findLatestPlacedOrder(customerId: string): Promise<any>;
    findLatestConfirmedOrder(customerId: string): Promise<({
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
    findLatestPendingOrder(customerId: string): Promise<({
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
    findOne(id: string): Promise<({
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
}
