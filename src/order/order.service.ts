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

    private async resolveProducts(items: any[]) {
        const productMap = new Map<string, any>();
        const itemResults = [];
        let productsAmount = 0;

        for (const item of items) {
            let product = null;

            // 1. Try Exact ID Match (Priority)
            product = await this.prisma.product.findUnique({ where: { id: item.productId } });

            // 2. Try Exact Name Match (Case-Insensitive)
            if (!product) {
                product = await this.prisma.product.findFirst({
                    where: { name: { equals: item.productId, mode: 'insensitive' } }
                });
            }

            // 3. Try Partial Name Match (Fuzzy Fallback)
            if (!product) {
                product = await this.prisma.product.findFirst({
                    where: { name: { contains: item.productId, mode: 'insensitive' } }
                });
            }

            // 4. Last Resort: Tokenized keyword search
            if (!product) {
                const tokens = item.productId.split(/[-_\s]+/).filter((t: string) => t.length > 2);
                this.logger.warn(`🔍 Step 4: Tokenized search for keywords: ${tokens.join(', ')}`);
                
                // Search for products where the name contains at least the major tokens
                for (let i = tokens.length; i > 0; i--) {
                    const subset = tokens.slice(0, i).join(' ');
                    product = await this.prisma.product.findFirst({
                        where: { name: { contains: subset, mode: 'insensitive' } }
                    });
                    if (product) break;
                }
            }

            if (!product) {
                this.logger.error(`❌ Product NOT found after all attempts: ${item.productId}`);
                throw new Error(`Technical Error: Could not find product "${item.productId}". Please mention the exact product name again.`);
            }

            this.logger.log(`✅ Resolved Product: ${product.name} (Resolved from: "${item.productId}")`);

            const itemPrice = (product.price || 0) * (item.quantity || 1);
            productsAmount += itemPrice;

            itemResults.push({
                productId: product.id,
                productName: product.name,
                size: item.size || null,
                color: item.color || null,
                quantity: item.quantity || 1,
                price: product.price || 0
            });
        }

        return { itemsWithPrices: itemResults, productsAmount };
    }

    async createOrder(data: any) {
        this.logger.log(`📦 Creating new order for ${data.customerName}...`);
        
        // 1. Calculate delivery fee
        const deliveryFee = await this.shippingService.calculateDeliveryFee(data.deliveryAddress);
        
        // 2. Fetch all product prices in batch
        const { itemsWithPrices, productsAmount } = await this.resolveProducts(data.items);
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
        this.logger.log(`🛒 Hardened Cart Processing for ${cart.customerName || 'Customer'}. Locations: ${cart.deliveries?.length || 1}`);
        
        const createdOrders = [];
        
        // 1. Fetch current Database Cart for the user as the ground truth
        const dbCart = await this.prisma.cart.findUnique({
            where: { customerId },
            include: { items: true }
        });

        let deliveries = cart.deliveries;
        if (!deliveries || deliveries.length === 0) {
            // Support flat structure where the cart object itself represents a single delivery
            deliveries = [{
                location: cart.location || cart.deliveryAddress || cart.address,
                items: cart.items || []
            }];
        }

        // 2. Logic: If the AI mentions specific items, we follow that lead (respecting conversation context).
        // If the AI's list is empty or generic, use the DB's ground truth cart.
        for (const delivery of deliveries) {
            let finalItems = delivery.items || [];

            // Hallucination Fallback: If AI provided no items in a [ORDER_READY] tag, 
            // but the DB cart has items, use the DB cart items.
            if (finalItems.length === 0 && dbCart && dbCart.items.length > 0) {
                this.logger.warn(`🤖 AI provided empty items list in ORDER_READY. Falling back to DB Cart for ${customerId}`);
                finalItems = dbCart.items.map(item => ({
                    productId: item.productId,
                    size: item.size,
                    color: item.color,
                    quantity: item.quantity
                }));
            }

            const orderData = {
                customerId,
                customerName: cart.customerName || cart.name, // Support variations in naming
                customerPhone: cart.customerPhone || cart.phone,
                customerEmail: cart.customerEmail || cart.email,
                deliveryAddress: delivery.location,
                items: finalItems
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

        // 2. Wrap product lookups
        let totalAmount = undefined;
        let itemsUpdate = undefined;

        if (data.items && data.items.length > 0) {
            const { itemsWithPrices, productsAmount } = await this.resolveProducts(data.items);

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
