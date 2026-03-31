import { Injectable, Logger } from '@nestjs/common';
import { OrderService } from '../order/order.service';
import { CartService } from '../cart/cart.service';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class OrderLogicService {
    private readonly logger = new Logger(OrderLogicService.name);

    constructor(
        private orderService: OrderService,
        private cartService: CartService,
        private redis: RedisService,
    ) { }

    /**
     * Tool Handler: Processes structured tool calls from Gemini.
     */
    async handleToolCall(call: any, customerId: string): Promise<{ success: boolean; error?: string; response?: string }> {
        const { name, args } = call;
        const draftKey = `order_draft:${customerId}`;

        try {
            if (name === 'update_order_draft') {
                this.logger.log(`🛠️ Tool Call: update_order_draft for ${customerId}`);
                const existingRaw = await this.redis.get(draftKey);
                const existing = existingRaw ? JSON.parse(existingRaw) : {};
                
                const updated = { ...existing, ...args };
                await this.redis.set(draftKey, JSON.stringify(updated), 3600); // 1 hour TTL

                // If a product was mentioned in the tool call, ensure it's in the DB cart
                if (args.productId) {
                    await this.cartService.addItem(
                        customerId, 
                        args.productId, 
                        args.quantity || 1, 
                        args.size, 
                        args.color, 
                        'SET'
                    );
                }

                return { success: true };
            }

            if (name === 'place_order') {
                this.logger.log(`🚀 Tool Call: place_order for ${customerId}`);
                if (!args.confirmed) return { success: false, error: 'User did not confirm' };

                const draftRaw = await this.redis.get(draftKey);
                if (!draftRaw) return { success: false, error: 'No order draft found' };

                const draft = JSON.parse(draftRaw);
                
                // Logic to create order from Cart + Draft details
                const orders = await this.orderService.createOrdersFromCart({
                    name: draft.customerName,
                    phone: draft.phone,
                    location: draft.address
                }, customerId);

                if (orders.length > 0) {
                    await this.cartService.clearCart(customerId);
                    await this.redis.del(draftKey);
                    return { 
                        success: true, 
                        response: "✅ Order successfully placed! Our team will contact you soon. 🛍️" 
                    };
                }
                
                return { success: false, error: 'Cart is empty or calculation failed' };
            }

            if (name === 'edit_placed_order') {
                this.logger.log(`✏️ Tool Call: edit_placed_order for ${customerId}`);
                const latest = await this.orderService.findLatestPlacedOrder(customerId);
                if (!latest) return { success: false, error: 'No recent PLACED order found' };

                const updateData: any = {
                    customerName: args.customerName,
                    customerPhone: args.phone,
                    deliveryAddress: args.address
                };

                // Handle item updates (currently prioritized for single-item or specific ID match)
                if (args.productId || args.size || args.color || args.quantity !== undefined) {
                    const items = latest.items.map((it: any) => ({
                        productId: it.productId,
                        size: it.size,
                        color: it.color,
                        quantity: it.quantity
                    }));

                    // Logic: If there is a productId match, update that item.
                    // If no match but only 1 item exists total, assume that's the one to update.
                    let targetItem = items.find((i: any) => i.productId === args.productId);
                    if (!targetItem && items.length === 1) targetItem = items[0];

                    if (targetItem) {
                        targetItem.productId = args.productId || targetItem.productId;
                        targetItem.size = args.size || targetItem.size;
                        targetItem.color = args.color || targetItem.color;
                        targetItem.quantity = args.quantity ?? targetItem.quantity;
                        updateData.items = items;
                    }
                }

                await this.orderService.updateOrder(latest.id, updateData);
                return { 
                    success: true, 
                    response: "✅ Done! I've updated your order details. 🛍️" 
                };
            }

            return { success: false, error: `Unknown tool: ${name}` };
        } catch (e) {
            this.logger.error(`❌ Tool Execution Failed: ${e.message}`);
            return { success: false, error: e.message };
        }
    }

    async generateDraftStatusResponse(customerId: string): Promise<string> {
        const draftRaw = await this.redis.get(`order_draft:${customerId}`);
        const draft = draftRaw ? JSON.parse(draftRaw) : {};
        
        // This programmatic fallback is used when the AI fails to generate a text response
        let response = "Got it! ";
        if (!draft.productId) {
            response += "Which item would you like to order?";
        } else if (!draft.customerName) {
            response += "Could I have your full name for the delivery?";
        } else if (!draft.phone) {
            response += "Please provide your contact phone number.";
        } else if (!draft.address) {
            response += "Finally, what is your full delivery address?";
        } else {
            response += "Perfect! Your order details are complete. Should we go ahead and confirm the order?";
        }
        
        return response;
    }

    async extractAndProcessOrder(text: string, customerId: string): Promise<{ success: boolean; error?: string }> {
        // Fallback for legacy [ORDER_READY] tags if any still exist in DB prompts
        const json = this.extractTagJson(text, 'ORDER_READY') || this.extractTagJson(text, 'ORDER_UPDATE');
        if (!json) return { success: false };

        try {
            const data = JSON.parse(json);
            const orders = await this.orderService.createOrdersFromCart(data, customerId);
            await this.cartService.clearCart(customerId);
            await this.redis.del(`order_draft:${customerId}`);
            return { success: true };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    extractTagJson(text: string, tag: string): string | null {
        const marker = `[${tag}:`;
        const start = text.indexOf(marker);
        if (start === -1) return null;

        let depth = 0;
        let jsonStart = text.indexOf('{', start);
        if (jsonStart === -1) return null;

        for (let i = jsonStart; i < text.length; i++) {
            if (text[i] === '{') depth++;
            else if (text[i] === '}') depth--;

            if (depth === 0) return text.slice(jsonStart, i + 1);
        }
        return null;
    }

    stripMarkdown(text: string): string {
        return text
            .replace(/\[ORDER_READY:.*?\]/gs, '')
            .replace(/\[ORDER_UPDATE:.*?\]/gs, '')
            .replace(/[*_~`#$]/g, '')
            .trim();
    }

    buildProductContext(p: any) {
        return { 
            id: p.id, 
            name: p.name, 
            price: p.price, 
            images: p.imageUrls 
        };
    }
}
