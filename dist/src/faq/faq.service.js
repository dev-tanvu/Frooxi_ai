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
var FaqService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.FaqService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
let FaqService = FaqService_1 = class FaqService {
    prisma;
    logger = new common_1.Logger(FaqService_1.name);
    constructor(prisma) {
        this.prisma = prisma;
    }
    async findFaqMatch(messageText, category) {
        const text = messageText.toLowerCase().trim();
        if (!category) {
            category = this.detectCategory(text) || undefined;
        }
        if (!category) {
            return null;
        }
        const faqs = await this.prisma.faq.findMany({
            where: {
                isActive: true,
                category: category
            },
            orderBy: { priority: 'desc' }
        });
        if (faqs.length === 0) {
            return null;
        }
        let bestMatch = null;
        let bestScore = 0;
        for (const faq of faqs) {
            let score = 0;
            if (text.includes(faq.question.toLowerCase())) {
                score += 100;
            }
            const matchedKeywords = faq.keywords.filter(keyword => text.includes(keyword.toLowerCase()));
            score += matchedKeywords.length * 10;
            score += faq.priority;
            if (score > bestScore) {
                bestScore = score;
                bestMatch = {
                    faq,
                    confidence: Math.min(score / 100, 1.0),
                    matchedKeywords
                };
            }
        }
        if (bestMatch && bestMatch.confidence > 0.1) {
            this.logger.log(`🎯 Category-based FAQ Match: "${bestMatch.faq.question}" (category: ${category}, confidence: ${bestMatch.confidence})`);
            return bestMatch;
        }
        return null;
    }
    detectCategory(text) {
        const categoryKeywords = {
            'Business Info': ['hours', 'open', 'close', 'timing', 'business hours', 'location', 'address', 'where', 'contact', 'phone', 'email', 'support'],
            'Shipping': ['delivery', 'shipping', 'deliver', 'time', 'when', 'charges', 'fee', 'cost', 'outside dhaka', 'area'],
            'Order Process': ['order', 'buy', 'purchase', 'payment', 'cash', 'bkash', 'nagad', 'card', 'checkout', 'cart', 'modify', 'cancel'],
            'Returns': ['return', 'refund', 'policy', 'exchange', 'money back', 'give back'],
            'Product Info': ['size', 'fit', 'original', 'authentic', 'genuine', 'quality', 'brand', 'care', 'wash', 'clean']
        };
        for (const [category, keywords] of Object.entries(categoryKeywords)) {
            if (keywords.some(keyword => text.includes(keyword))) {
                return category;
            }
        }
        return null;
    }
    getFaqResponse(match, customerName) {
        let response = match.faq.answer;
        if (match.faq.responseTemplate && customerName) {
            response = match.faq.responseTemplate.replace('{customerName}', customerName);
        }
        else if (customerName && !response.includes(customerName)) {
            response = `Hi ${customerName}! ${response}`;
        }
        return response;
    }
    async createFaq(faqData) {
        const faq = await this.prisma.faq.create({
            data: faqData
        });
        this.logger.log(`✅ Created FAQ: "${faq.question}" in category: ${faq.category}`);
        return faq;
    }
    async updateFaq(id, updateData) {
        const updated = await this.prisma.faq.update({
            where: { id },
            data: updateData
        });
        this.logger.log(`✅ Updated FAQ: "${updated.question}"`);
        return updated;
    }
    async deleteFaq(id) {
        await this.prisma.faq.delete({
            where: { id }
        });
        this.logger.log(`🗑️ Deleted FAQ with ID: ${id}`);
    }
    async getFaqsByCategory(category) {
        const where = category ? { category, isActive: true } : { isActive: true };
        return this.prisma.faq.findMany({
            where,
            orderBy: { priority: 'desc' }
        });
    }
    async getCategories() {
        const result = await this.prisma.faq.findMany({
            where: { isActive: true },
            select: { category: true },
            distinct: ['category']
        });
        return result.map(item => item.category);
    }
    async initializeDefaultFaqs() {
        const defaultFaqs = [
            {
                category: 'Business Info',
                question: 'What are your business hours?',
                answer: 'We are open Monday to Saturday from 10 AM to 8 PM, and Sunday from 11 AM to 6 PM.',
                keywords: ['hours', 'open', 'close', 'timing', 'business hours'],
                priority: 10,
                responseTemplate: 'Hi {customerName}! We are open Monday to Saturday from 10 AM to 8 PM, and Sunday from 11 AM to 6 PM.'
            },
            {
                category: 'Business Info',
                question: 'Where are you located?',
                answer: 'We are located at 123 Main Street, Dhaka, Bangladesh. You can also visit our website for online shopping!',
                keywords: ['location', 'address', 'where', 'shop', 'store'],
                priority: 10
            },
            {
                category: 'Business Info',
                question: 'How can I contact customer support?',
                answer: 'You can reach our customer support at +880-1234-5678 or email us at support@frooxi.com. We typically respond within 24 hours.',
                keywords: ['contact', 'support', 'phone', 'email', 'help'],
                priority: 9
            },
            {
                category: 'Shipping',
                question: 'How long does delivery take?',
                answer: 'Standard delivery takes 3-5 business days within Dhaka and 5-7 business days outside Dhaka. Express delivery (1-2 days) is also available for an additional fee.',
                keywords: ['delivery', 'shipping', 'time', 'how long', 'when'],
                priority: 10
            },
            {
                category: 'Shipping',
                question: 'What are the delivery charges?',
                answer: 'Delivery charges vary by location: Dhaka city - 50 BDT, Outside Dhaka - 100 BDT. Free delivery on orders above 1000 BDT!',
                keywords: ['delivery charge', 'shipping fee', 'cost', 'free delivery'],
                priority: 9
            },
            {
                category: 'Shipping',
                question: 'Do you deliver outside Dhaka?',
                answer: 'Yes, we deliver all over Bangladesh! Delivery time may vary slightly for remote areas.',
                keywords: ['outside dhaka', 'delivery area', 'countrywide', 'bangladesh'],
                priority: 8
            },
            {
                category: 'Order Process',
                question: 'How do I place an order?',
                answer: 'Simply browse our products, select your preferred items, choose size and color, add to cart, and proceed to checkout. You can also directly message us with your order details!',
                keywords: ['how to order', 'place order', 'buy', 'purchase', 'checkout'],
                priority: 10
            },
            {
                category: 'Order Process',
                question: 'What payment methods do you accept?',
                answer: 'We accept cash on delivery (COD), bKash, Nagad, Rocket, and all major credit/debit cards.',
                keywords: ['payment', 'cash', 'bkash', 'nagad', 'card', 'method'],
                priority: 9
            },
            {
                category: 'Order Process',
                question: 'Can I modify or cancel my order?',
                answer: 'Yes, you can modify or cancel your order within 2 hours of placing it. After that, please contact our support team for assistance.',
                keywords: ['modify', 'cancel', 'change', 'edit order'],
                priority: 8
            },
            {
                category: 'Returns',
                question: 'What is your return policy?',
                answer: 'We offer 7-day return policy for unused items with original tags. Refunds are processed within 5-7 business days after return approval.',
                keywords: ['return', 'refund', 'policy', 'exchange', 'money back'],
                priority: 10
            },
            {
                category: 'Returns',
                question: 'How do I return a product?',
                answer: 'To return a product, please contact our support team with your order number. We will arrange for pickup or provide drop-off instructions.',
                keywords: ['how to return', 'return process', 'pickup', 'drop'],
                priority: 9
            },
            {
                category: 'Product Info',
                question: 'How do I choose the right size?',
                answer: 'Each product has a size chart in the description. You can also message us your height and weight for personalized size recommendations.',
                keywords: ['size', 'fit', 'chart', 'measurement', 'right size'],
                priority: 9
            },
            {
                category: 'Product Info',
                question: 'Are your products original?',
                answer: 'Yes, we guarantee 100% original products. All items come with authenticity cards and manufacturer warranties.',
                keywords: ['original', 'authentic', 'genuine', 'quality', 'brand'],
                priority: 10
            },
            {
                category: 'Product Info',
                question: 'How do I care for my clothes?',
                answer: 'Most of our clothes are machine washable. Please check the care label on each product for specific washing instructions.',
                keywords: ['care', 'wash', 'clean', 'maintain', 'instructions'],
                priority: 7
            }
        ];
        for (const faqData of defaultFaqs) {
            const existing = await this.prisma.faq.findFirst({
                where: { question: faqData.question }
            });
            if (!existing) {
                await this.createFaq(faqData);
            }
        }
        this.logger.log('✅ Default FAQs initialized successfully');
    }
};
exports.FaqService = FaqService;
exports.FaqService = FaqService = FaqService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], FaqService);
//# sourceMappingURL=faq.service.js.map