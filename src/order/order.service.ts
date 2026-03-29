import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ShippingService } from '../shipping/shipping.service';

@Injectable()
export class OrderService {
    private readonly logger = new Logger(OrderService.name);

    constructor(
        private prisma: PrismaService,
        private shippingService: ShippingService
    ) {}

    async createOrder(data: any) {
        this.logger.log(`📦 Creating new order for ${data.customerName}...`);
        
        // 1. Calculate delivery fee
        const deliveryFee = await this.shippingService.calculateDeliveryFee(data.deliveryAddress);
        
        // 2. Fetch product prices and calculate total
        let productsAmount = 0;
        const itemsWithPrices = await Promise.all(data.items.map(async (item: any) => {
            const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-5][0-9a-f]{3}-[089ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(item.productId);
            let product = null;

            if (isUuid) {
                product = await this.prisma.product.findUnique({ where: { id: item.productId } });
            } else {
                product = await this.prisma.product.findFirst({ where: { name: { equals: item.productId, mode: 'insensitive' } } });
            }
            
            if (!product) throw new Error(`Product ${item.productId} not found`);
            
            const itemPrice = (product.price || 0) * item.quantity;
            productsAmount += itemPrice;
            
            return {
                productId: product.id,
                productName: product.name,
                size: item.size,
                color: item.color,
                quantity: item.quantity,
                price: product.price || 0
            };
        }));

        const totalAmount = productsAmount + deliveryFee;

        // 3. Persist Order
        return this.prisma.order.create({
            data: {
                customerId: data.customerId,
                customerName: data.customerName,
                customerPhone: data.customerPhone,
                customerEmail: data.customerEmail,
                deliveryAddress: data.deliveryAddress,
                deliveryFee: deliveryFee,
                totalAmount: totalAmount,
                status: 'PLACED' as any,
                items: {
                    create: itemsWithPrices
                }
            },
            include: {
                items: true
            }
        });
    }

    async createOrdersFromCart(cart: any, customerId: string) {
        this.logger.log(`🛒 Processing Shopping Cart for ${cart.customerName}. Locations: ${cart.deliveries.length}`);
        
        const createdOrders = [];
        
        for (const delivery of cart.deliveries) {
            const orderData = {
                customerId,
                customerName: cart.customerName,
                customerPhone: cart.phone,
                customerEmail: cart.email,
                deliveryAddress: delivery.location,
                items: delivery.items
            };
            
            const newOrder = await this.createOrder(orderData);
            createdOrders.push(newOrder);
        }
        
        return createdOrders;
    }

    async findAll() {
        return this.prisma.order.findMany({
            include: {
                items: true,
                customer: true
            },
            orderBy: { createdAt: 'desc' }
        });
    }

    async findByCustomer(customerId: string) {
        return this.prisma.order.findMany({
            where: { customerId },
            include: { items: true },
            orderBy: { createdAt: 'desc' }
        });
    }

    async updateStatus(id: string, status: any) {
        return this.prisma.order.update({
            where: { id },
            data: { status }
        });
    }

    async updateOrder(id: string, data: any) {
        this.logger.log(`🔄 Updating order ${id}...`);
        
        // 1. If location changed, recalculate delivery fee
        let deliveryFee = undefined;
        if (data.deliveryAddress) {
            deliveryFee = await this.shippingService.calculateDeliveryFee(data.deliveryAddress);
        }

        // 2. Fetch product prices and calculate products total if items provided
        let totalAmount = undefined;
        let itemsUpdate = undefined;

        if (data.items && data.items.length > 0) {
            let productsAmount = 0;
            const itemsWithPrices = await Promise.all(data.items.map(async (item: any) => {
                const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-5][0-9a-f]{3}-[089ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(item.productId);
                let product = null;

                if (isUuid) {
                    product = await this.prisma.product.findUnique({ where: { id: item.productId } });
                } else {
                    product = await this.prisma.product.findFirst({ where: { name: { equals: item.productId, mode: 'insensitive' } } });
                }

                if (!product) throw new Error(`Product ${item.productId} not found`);
                
                const itemPrice = (product.price || 0) * item.quantity;
                productsAmount += itemPrice;
                
                return {
                    productId: product.id,
                    productName: product.name,
                    size: item.size,
                    color: item.color,
                    quantity: item.quantity,
                    price: product.price || 0
                };
            }));

            // Use provided or existing delivery fee
            const currentOrder = await this.prisma.order.findUnique({ where: { id } });
            const fee = deliveryFee ?? currentOrder?.deliveryFee ?? 0;
            totalAmount = productsAmount + fee;

            itemsUpdate = {
                deleteMany: {},
                create: itemsWithPrices
            };
        } else if (deliveryFee !== undefined) {
             // If ONLY location changed, update total based on existing items
             const currentOrder = await this.prisma.order.findUnique({ 
                 where: { id },
                 include: { items: true }
             });
             if (currentOrder) {
                 const productsAmount = currentOrder.items.reduce((acc: number, item: any) => acc + (item.price * item.quantity), 0);
                 totalAmount = productsAmount + deliveryFee;
             }
        }

        return this.prisma.order.update({
            where: { id },
            data: {
                customerName: data.customerName,
                customerPhone: data.customerPhone,
                customerEmail: data.customerEmail,
                deliveryAddress: data.deliveryAddress,
                deliveryFee: deliveryFee,
                totalAmount: totalAmount,
                items: itemsUpdate
            },
            include: { items: true }
        });
    }

    async confirmOrder(id: string) {
        this.logger.log(`✅ Confirming order ${id}...`);
        return this.prisma.order.update({
            where: { id },
            data: { status: 'CONFIRMED' },
            include: { items: true }
        });
    }

    async findLatestPlacedOrder(customerId: string) {
        return this.prisma.order.findFirst({
            where: { customerId, status: 'PLACED' as any },
            orderBy: { createdAt: 'desc' },
            include: { items: true }
        }) as any;
    }

    async findLatestConfirmedOrder(customerId: string) {
        return this.prisma.order.findFirst({
            where: { customerId, status: 'CONFIRMED' },
            orderBy: { createdAt: 'desc' },
            include: { items: true }
        });
    }

    async findLatestPendingOrder(customerId: string) {
        return this.prisma.order.findFirst({
            where: { customerId, status: 'PENDING' },
            orderBy: { createdAt: 'desc' },
            include: { items: true }
        });
    }

    async findOne(id: string) {
        return this.prisma.order.findUnique({
            where: { id },
            include: { items: true, customer: true }
        });
    }
}
