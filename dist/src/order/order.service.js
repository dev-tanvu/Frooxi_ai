"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var OrderService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrderService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const shipping_service_1 = require("../shipping/shipping.service");
let OrderService = OrderService_1 = class OrderService {
    prisma;
    shippingService;
    logger = new common_1.Logger(OrderService_1.name);
    constructor(prisma, shippingService) {
        this.prisma = prisma;
        this.shippingService = shippingService;
    }
    async resolveProducts(items) {
        const productMap = new Map();
        const itemResults = [];
        let productsAmount = 0;
        for (const item of items) {
            let product = null;
            product = await this.prisma.product.findUnique({ where: { id: item.productId } });
            if (!product) {
                product = await this.prisma.product.findFirst({
                    where: { name: { equals: item.productId, mode: 'insensitive' } }
                });
            }
            if (!product) {
                product = await this.prisma.product.findFirst({
                    where: { name: { contains: item.productId, mode: 'insensitive' } }
                });
            }
            if (!product) {
                const tokens = item.productId.split(/[-_\s]+/).filter((t) => t.length > 2);
                this.logger.warn(`🔍 Step 4: Tokenized search for keywords: ${tokens.join(', ')}`);
                for (let i = tokens.length; i > 0; i--) {
                    const subset = tokens.slice(0, i).join(' ');
                    product = await this.prisma.product.findFirst({
                        where: { name: { contains: subset, mode: 'insensitive' } }
                    });
                    if (product)
                        break;
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
    async createOrder(data) {
        this.logger.log(`📦 Creating new order for ${data.customerName}...`);
        const deliveryFee = await this.shippingService.calculateDeliveryFee(data.deliveryAddress);
        const { itemsWithPrices, productsAmount } = await this.resolveProducts(data.items);
        const totalAmount = productsAmount + deliveryFee;
        return this.prisma.order.create({
            data: {
                customerId: data.customerId,
                customerName: data.customerName,
                customerPhone: data.customerPhone,
                customerEmail: data.customerEmail,
                deliveryAddress: data.deliveryAddress,
                deliveryFee: deliveryFee,
                totalAmount: totalAmount,
                status: 'PLACED',
                items: {
                    create: itemsWithPrices
                }
            },
            include: {
                items: true
            }
        });
    }
    async createOrdersFromCart(cart, customerId) {
        this.logger.log(`🛒 Hardened Cart Processing for ${cart.customerName || 'Customer'}. Locations: ${cart.deliveries?.length || 1}`);
        const createdOrders = [];
        const dbCart = await this.prisma.cart.findUnique({
            where: { customerId },
            include: { items: true }
        });
        let deliveries = cart.deliveries;
        if (!deliveries || deliveries.length === 0) {
            deliveries = [{
                    location: cart.location || cart.deliveryAddress || cart.address,
                    items: cart.items || []
                }];
        }
        for (const delivery of deliveries) {
            let finalItems = delivery.items || [];
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
                customerName: cart.customerName || cart.name,
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
    async findByCustomer(customerId) {
        return this.prisma.order.findMany({
            where: { customerId },
            include: { items: true },
            orderBy: { createdAt: 'desc' }
        });
    }
    async updateStatus(id, status) {
        return this.prisma.order.update({
            where: { id },
            data: { status }
        });
    }
    async updateOrder(id, data) {
        this.logger.log(`🔄 Updating order ${id}...`);
        let deliveryFee = undefined;
        if (data.deliveryAddress) {
            deliveryFee = await this.shippingService.calculateDeliveryFee(data.deliveryAddress);
        }
        let totalAmount = undefined;
        let itemsUpdate = undefined;
        if (data.items && data.items.length > 0) {
            const { itemsWithPrices, productsAmount } = await this.resolveProducts(data.items);
            const currentOrder = await this.prisma.order.findUnique({ where: { id } });
            const fee = deliveryFee ?? currentOrder?.deliveryFee ?? 0;
            totalAmount = productsAmount + fee;
            itemsUpdate = {
                deleteMany: {},
                create: itemsWithPrices
            };
        }
        else if (deliveryFee !== undefined) {
            const currentOrder = await this.prisma.order.findUnique({
                where: { id },
                include: { items: true }
            });
            if (currentOrder) {
                const productsAmount = currentOrder.items.reduce((acc, item) => acc + (item.price * item.quantity), 0);
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
    async confirmOrder(id) {
        this.logger.log(`✅ Confirming order ${id}...`);
        return this.prisma.order.update({
            where: { id },
            data: { status: 'CONFIRMED' },
            include: { items: true }
        });
    }
    async findLatestPlacedOrder(customerId) {
        return this.prisma.order.findFirst({
            where: { customerId, status: 'PLACED' },
            orderBy: { createdAt: 'desc' },
            include: { items: true }
        });
    }
    async findLatestConfirmedOrder(customerId) {
        return this.prisma.order.findFirst({
            where: { customerId, status: 'CONFIRMED' },
            orderBy: { createdAt: 'desc' },
            include: { items: true }
        });
    }
    async findLatestPendingOrder(customerId) {
        return this.prisma.order.findFirst({
            where: { customerId, status: 'PENDING' },
            orderBy: { createdAt: 'desc' },
            include: { items: true }
        });
    }
    async findOne(id) {
        return this.prisma.order.findUnique({
            where: { id },
            include: { items: true, customer: true }
        });
    }
};
exports.OrderService = OrderService;
exports.OrderService = OrderService = OrderService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        shipping_service_1.ShippingService])
], OrderService);
//# sourceMappingURL=order.service.js.map