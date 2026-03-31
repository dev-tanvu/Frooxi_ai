import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { EmotionState } from '../ai/gemini.service';

@Injectable()
export class CartService {
    private readonly logger = new Logger(CartService.name);

    constructor(
        private prisma: PrismaService,
        private redis: RedisService,
    ) { }

    /**
     * COORDINATOR: Main entry point called from the Webhook in parallel with AI response generation.
     */
    async handleCartLogic(customerId: string, emotion: EmotionState, productsFound: any[] = []) {
        try {
            await this.prisma.ensureConnected();
            const pendingKey = `pending_cart:${customerId}`;

            // Case 1: Confirmed Interest (User explicitly said "I want this")
            if (emotion.product_interest === 'CONFIRMED' || emotion.intent === 'Buying' || emotion.intent === 'Ordering') {
                let productIdToCart = null;

                if (productsFound.length > 0) {
                    productIdToCart = productsFound[0].id; // Use primary match from text/visual agent
                } else {
                    const pendingRaw = await this.redis.get(pendingKey);
                    if (pendingRaw) {
                        const pendingData = JSON.parse(pendingRaw);
                        productIdToCart = pendingData.productId;
                    }
                }

                if (productIdToCart) {
                    await this.addItem(
                        customerId,
                        productIdToCart,
                        emotion.quantity ?? 1,
                        emotion.size,
                        emotion.color,
                        emotion.quantity_operation ?? 'INCREMENT'
                    );
                    await this.redis.del(pendingKey); // Clear memory after persisting
                    this.logger.log(`🛒 Persisted item ${productIdToCart} to DB Cart for Customer ${customerId}`);
                }
            } 
            
            // Case 2: Discussing/Searching (Store in memory for potential confirmation next message)
            else if (emotion.product_interest === 'DISCUSSING' && productsFound.length > 0) {
                const product = productsFound[0];
                await this.redis.set(pendingKey, JSON.stringify({
                    productId: product.id,
                    productName: product.name,
                    price: product.price
                }), 900); // 15 Minute Memory Window
                this.logger.log(`📝 Stored potential interest in ${product.name} for Customer ${customerId} (Memory: 15m)`);
            }

            // Case 3: Removing (User wants to remove a specific item from their cart)
            else if (emotion.product_interest === 'REMOVING') {
                let productIdToRemove: string | null = null;

                if (productsFound.length > 0) {
                    productIdToRemove = productsFound[0].id;
                } else {
                    const pendingRaw = await this.redis.get(pendingKey);
                    if (pendingRaw) {
                        productIdToRemove = JSON.parse(pendingRaw).productId;
                    }
                }

                if (productIdToRemove) {
                    await this.removeItemByProduct(
                        customerId, 
                        productIdToRemove, 
                        emotion.size, 
                        emotion.color
                    );
                    this.logger.log(`🗑️ Removed product ${productIdToRemove} (Size: ${emotion.size}, Color: ${emotion.color}) from Cart for Customer ${customerId}`);
                }
                await this.redis.del(pendingKey);
            }

            // Case 4: Bulk Clear (User says "Empty my cart")
            else if (emotion.product_interest === 'CLEAR_ALL') {
                await this.clearCart(customerId);
            }
        } catch (error) {
            this.logger.error(`❌ Cart Logic Error: ${error.message}`);
        }
    }

    /**
     * DATABASE: Persistent Storage
     */
    async addItem(
        customerId: string, 
        productId: string, 
        quantity: number = 1, 
        size?: string, 
        color?: string, 
        operation: 'INCREMENT' | 'SET' = 'INCREMENT'
    ) {
        // 1. Ensure Cart exists
        let cart = await this.prisma.cart.findUnique({
            where: { customerId }
        });

        if (!cart) {
            cart = await this.prisma.cart.create({
                data: { customerId }
            });
        }

        // 2. Add or Update Item
        const product = await this.prisma.product.findUnique({ where: { id: productId } });
        if (!product) {
            this.logger.warn(`Failed to add item to cart: Product ${productId} not found.`);
            return;
        }

        // Collision Fix: Precisely find existing item by product + size + color
        const existingItem = await this.prisma.cartItem.findFirst({
            where: { 
                cartId: cart.id, 
                productId, 
                size: size || null, 
                color: color || null 
            }
        });

        // Fail-safe logic for explicit zero quantities ("set to 0")
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
        } else {
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

    async getCart(customerId: string) {
        return this.prisma.cart.findUnique({
            where: { customerId },
            include: { items: { include: { product: true } } }
        });
    }

    async clearCart(customerId: string) {
        const cart = await this.prisma.cart.findUnique({ where: { customerId } });
        if (cart) {
            await this.prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
            this.logger.log(`🗑️ Cleared Cart for Customer ${customerId} after successful order.`);
        }
        await this.redis.del(`pending_cart:${customerId}`);
    }

    async removeItem(cartItemId: string) {
        return this.prisma.cartItem.delete({ where: { id: cartItemId } });
    }

    /**
     * Removes a specific product from a customer's cart by productId.
     * Used by the AI pipeline when removal intent is detected.
     */
    async removeItemByProduct(customerId: string, productId: string, size?: string, color?: string) {
        const cart = await this.prisma.cart.findUnique({ where: { customerId } });
        if (!cart) return;

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
}
