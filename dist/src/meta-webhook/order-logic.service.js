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
var OrderLogicService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrderLogicService = void 0;
const common_1 = require("@nestjs/common");
const order_service_1 = require("../order/order.service");
const cart_service_1 = require("../cart/cart.service");
const redis_service_1 = require("../redis/redis.service");
let OrderLogicService = OrderLogicService_1 = class OrderLogicService {
    orderService;
    cartService;
    redis;
    logger = new common_1.Logger(OrderLogicService_1.name);
    constructor(orderService, cartService, redis) {
        this.orderService = orderService;
        this.cartService = cartService;
        this.redis = redis;
    }
    async handleToolCall(call, customerId) {
        const { name, args } = call;
        const draftKey = `order_draft:${customerId}`;
        try {
            if (name === 'update_order_draft') {
                this.logger.log(`🛠️ Tool Call: update_order_draft for ${customerId}`);
                const existingRaw = await this.redis.get(draftKey);
                const existing = existingRaw ? JSON.parse(existingRaw) : {};
                const updated = { ...existing, ...args };
                await this.redis.set(draftKey, JSON.stringify(updated), 3600);
                if (args.productId) {
                    await this.cartService.addItem(customerId, args.productId, args.quantity || 1, args.size, args.color, 'SET');
                }
                return { success: true };
            }
            if (name === 'place_order') {
                this.logger.log(`🚀 Tool Call: place_order for ${customerId}`);
                if (!args.confirmed)
                    return { success: false, error: 'User did not confirm' };
                const draftRaw = await this.redis.get(draftKey);
                if (!draftRaw)
                    return { success: false, error: 'No order draft found' };
                const draft = JSON.parse(draftRaw);
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
                if (!latest)
                    return { success: false, error: 'No recent PLACED order found' };
                const updateData = {
                    customerName: args.customerName,
                    customerPhone: args.phone,
                    deliveryAddress: args.address
                };
                if (args.productId || args.size || args.color || args.quantity !== undefined) {
                    const items = latest.items.map((it) => ({
                        productId: it.productId,
                        size: it.size,
                        color: it.color,
                        quantity: it.quantity
                    }));
                    let targetItem = items.find((i) => i.productId === args.productId);
                    if (!targetItem && items.length === 1)
                        targetItem = items[0];
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
        }
        catch (e) {
            this.logger.error(`❌ Tool Execution Failed: ${e.message}`);
            return { success: false, error: e.message };
        }
    }
    async generateDraftStatusResponse(customerId) {
        const draftRaw = await this.redis.get(`order_draft:${customerId}`);
        const draft = draftRaw ? JSON.parse(draftRaw) : {};
        let response = "Got it! ";
        if (!draft.productId) {
            response += "Which item would you like to order?";
        }
        else if (!draft.customerName) {
            response += "Could I have your full name for the delivery?";
        }
        else if (!draft.phone) {
            response += "Please provide your contact phone number.";
        }
        else if (!draft.address) {
            response += "Finally, what is your full delivery address?";
        }
        else {
            response += "Perfect! Your order details are complete. Should we go ahead and confirm the order?";
        }
        return response;
    }
    async extractAndProcessOrder(text, customerId) {
        const json = this.extractTagJson(text, 'ORDER_READY') || this.extractTagJson(text, 'ORDER_UPDATE');
        if (!json)
            return { success: false };
        try {
            const data = JSON.parse(json);
            const orders = await this.orderService.createOrdersFromCart(data, customerId);
            await this.cartService.clearCart(customerId);
            await this.redis.del(`order_draft:${customerId}`);
            return { success: true };
        }
        catch (e) {
            return { success: false, error: e.message };
        }
    }
    extractTagJson(text, tag) {
        const marker = `[${tag}:`;
        const start = text.indexOf(marker);
        if (start === -1)
            return null;
        let depth = 0;
        let jsonStart = text.indexOf('{', start);
        if (jsonStart === -1)
            return null;
        for (let i = jsonStart; i < text.length; i++) {
            if (text[i] === '{')
                depth++;
            else if (text[i] === '}')
                depth--;
            if (depth === 0)
                return text.slice(jsonStart, i + 1);
        }
        return null;
    }
    stripMarkdown(text) {
        return text
            .replace(/\[ORDER_READY:.*?\]/gs, '')
            .replace(/\[ORDER_UPDATE:.*?\]/gs, '')
            .replace(/[*_~`#$]/g, '')
            .trim();
    }
    buildProductContext(p) {
        return {
            id: p.id,
            name: p.name,
            price: p.price,
            images: p.imageUrls
        };
    }
};
exports.OrderLogicService = OrderLogicService;
exports.OrderLogicService = OrderLogicService = OrderLogicService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [order_service_1.OrderService,
        cart_service_1.CartService,
        redis_service_1.RedisService])
], OrderLogicService);
//# sourceMappingURL=order-logic.service.js.map