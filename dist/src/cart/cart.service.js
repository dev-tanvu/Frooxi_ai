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
var CartService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.CartService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const redis_service_1 = require("../redis/redis.service");
let CartService = CartService_1 = class CartService {
    prisma;
    redis;
    logger = new common_1.Logger(CartService_1.name);
    constructor(prisma, redis) {
        this.prisma = prisma;
        this.redis = redis;
    }
    async handleCartLogic(customerId, emotion, productsFound = []) {
        try {
            await this.prisma.ensureConnected();
            const pendingKey = `pending_cart:${customerId}`;
            if (emotion.product_interest === 'CONFIRMED' || emotion.intent === 'Buying' || emotion.intent === 'Ordering') {
                let productIdToCart = null;
                if (productsFound.length > 0) {
                    productIdToCart = productsFound[0].id;
                }
                else {
                    const pendingRaw = await this.redis.get(pendingKey);
                    if (pendingRaw) {
                        const pendingData = JSON.parse(pendingRaw);
                        productIdToCart = pendingData.productId;
                    }
                }
                if (productIdToCart) {
                    await this.addItem(customerId, productIdToCart, emotion.quantity ?? 1, emotion.size, emotion.color, emotion.quantity_operation ?? 'INCREMENT');
                    await this.redis.del(pendingKey);
                    this.logger.log(`🛒 Persisted item ${productIdToCart} to DB Cart for Customer ${customerId}`);
                }
            }
            else if (emotion.product_interest === 'DISCUSSING' && productsFound.length > 0) {
                const product = productsFound[0];
                await this.redis.set(pendingKey, JSON.stringify({
                    productId: product.id,
                    productName: product.name,
                    price: product.price
                }), 900);
                this.logger.log(`📝 Stored potential interest in ${product.name} for Customer ${customerId} (Memory: 15m)`);
            }
            else if (emotion.product_interest === 'REMOVING') {
                let productIdToRemove = null;
                if (productsFound.length > 0) {
                    productIdToRemove = productsFound[0].id;
                }
                else {
                    const pendingRaw = await this.redis.get(pendingKey);
                    if (pendingRaw) {
                        productIdToRemove = JSON.parse(pendingRaw).productId;
                    }
                }
                if (productIdToRemove) {
                    await this.removeItemByProduct(customerId, productIdToRemove, emotion.size, emotion.color);
                    this.logger.log(`🗑️ Removed product ${productIdToRemove} (Size: ${emotion.size}, Color: ${emotion.color}) from Cart for Customer ${customerId}`);
                }
                await this.redis.del(pendingKey);
            }
            else if (emotion.product_interest === 'CLEAR_ALL') {
                await this.clearCart(customerId);
            }
        }
        catch (error) {
            this.logger.error(`❌ Cart Logic Error: ${error.message}`);
        }
    }
    async addItem(customerId, productId, quantity = 1, size, color, operation = 'INCREMENT') {
        let cart = await this.prisma.cart.findUnique({
            where: { customerId }
        });
        if (!cart) {
            cart = await this.prisma.cart.create({
                data: { customerId }
            });
        }
        const product = await this.prisma.product.findUnique({ where: { id: productId } });
        if (!product) {
            this.logger.warn(`Failed to add item to cart: Product ${productId} not found.`);
            return;
        }
        const existingItem = await this.prisma.cartItem.findFirst({
            where: {
                cartId: cart.id,
                productId,
                size: size || null,
                color: color || null
            }
        });
        if (operation === 'SET' && quantity <= 0) {
            if (existingItem) {
                return this.prisma.cartItem.delete({ where: { id: existingItem.id } });
            }
            return;
        }
        if (existingItem) {
            return this.prisma.cartItem.update({
                where: { id: existingItem.id },
                data: {
                    quantity: operation === 'SET' ? quantity : { increment: quantity },
                    addedAt: new Date()
                }
            });
        }
        else {
            return this.prisma.cartItem.create({
                data: {
                    cartId: cart.id,
                    productId,
                    productName: product.name,
                    price: product.price,
                    size: size || null,
                    color: color || null,
                    quantity: quantity
                }
            });
        }
    }
    async getCart(customerId) {
        return this.prisma.cart.findUnique({
            where: { customerId },
            include: { items: { include: { product: true } } }
        });
    }
    async clearCart(customerId) {
        const cart = await this.prisma.cart.findUnique({ where: { customerId } });
        if (cart) {
            await this.prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
            this.logger.log(`🗑️ Cleared Cart for Customer ${customerId} after successful order.`);
        }
        await this.redis.del(`pending_cart:${customerId}`);
    }
    async removeItem(cartItemId) {
        return this.prisma.cartItem.delete({ where: { id: cartItemId } });
    }
    async removeItemByProduct(customerId, productId, size, color) {
        const cart = await this.prisma.cart.findUnique({ where: { customerId } });
        if (!cart)
            return;
        const item = await this.prisma.cartItem.findFirst({
            where: {
                cartId: cart.id,
                productId,
                size: size || null,
                color: color || null
            }
        });
        if (item) {
            await this.prisma.cartItem.delete({ where: { id: item.id } });
        }
    }
};
exports.CartService = CartService;
exports.CartService = CartService = CartService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        redis_service_1.RedisService])
], CartService);
//# sourceMappingURL=cart.service.js.map