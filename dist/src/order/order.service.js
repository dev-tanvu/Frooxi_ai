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
    async createOrder(data) {
        this.logger.log(`📦 Creating new order for ${data.customerName}...`);
        const deliveryFee = await this.shippingService.calculateDeliveryFee(data.deliveryAddress);
        let productsAmount = 0;
        const itemsWithPrices = await Promise.all(data.items.map(async (item) => {
            const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-5][0-9a-f]{3}-[089ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(item.productId);
            let product = null;
            if (isUuid) {
                product = await this.prisma.product.findUnique({ where: { id: item.productId } });
            }
            else {
                product = await this.prisma.product.findFirst({ where: { name: { equals: item.productId, mode: 'insensitive' } } });
            }
            if (!product)
                throw new Error(`Product ${item.productId} not found`);
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
            let productsAmount = 0;
            const itemsWithPrices = await Promise.all(data.items.map(async (item) => {
                const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-5][0-9a-f]{3}-[089ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(item.productId);
                let product = null;
                if (isUuid) {
                    product = await this.prisma.product.findUnique({ where: { id: item.productId } });
                }
                else {
                    product = await this.prisma.product.findFirst({ where: { name: { equals: item.productId, mode: 'insensitive' } } });
                }
                if (!product)
                    throw new Error(`Product ${item.productId} not found`);
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