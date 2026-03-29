import { PrismaService } from '../prisma/prisma.service';
import { ShippingService } from '../shipping/shipping.service';
export declare class OrderService {
    private prisma;
    private shippingService;
    private readonly logger;
    constructor(prisma: PrismaService, shippingService: ShippingService);
    createOrder(data: any): Promise<{
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
    }>;
    createOrdersFromCart(cart: any, customerId: string): Promise<({
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
    findAll(): Promise<({
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
    findByCustomer(customerId: string): Promise<({
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
    updateStatus(id: string, status: any): Promise<{
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
    updateOrder(id: string, data: any): Promise<{
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
    }>;
    confirmOrder(id: string): Promise<{
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
    }>;
    findLatestPlacedOrder(customerId: string): Promise<any>;
    findLatestConfirmedOrder(customerId: string): Promise<({
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
    findLatestPendingOrder(customerId: string): Promise<({
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
    findOne(id: string): Promise<({
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
}
