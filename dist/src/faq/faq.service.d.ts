import { PrismaService } from '../prisma/prisma.service';
export interface FaqMatch {
    faq: any;
    confidence: number;
    matchedKeywords: string[];
}
export declare class FaqService {
    private prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    findFaqMatch(messageText: string, category?: string): Promise<FaqMatch | null>;
    private detectCategory;
    getFaqResponse(match: FaqMatch, customerName?: string): string;
    createFaq(faqData: any): Promise<any>;
    updateFaq(id: string, updateData: any): Promise<any>;
    deleteFaq(id: string): Promise<void>;
    getFaqsByCategory(category?: string): Promise<any[]>;
    getCategories(): Promise<string[]>;
    initializeDefaultFaqs(): Promise<void>;
}
