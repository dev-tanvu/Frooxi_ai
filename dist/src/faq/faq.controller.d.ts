import { FaqService } from './faq.service';
export declare class FaqController {
    private readonly faqService;
    constructor(faqService: FaqService);
    createFaq(faqData: any): Promise<any>;
    getFaqs(category?: string): Promise<any[]>;
    getCategories(): Promise<string[]>;
    findFaqMatch(message: string): Promise<{
        found: boolean;
        faq: any;
        confidence: number;
        matchedKeywords: string[];
    } | {
        found: boolean;
        faq?: undefined;
        confidence?: undefined;
        matchedKeywords?: undefined;
    }>;
    updateFaq(id: string, updateData: any): Promise<any>;
    deleteFaq(id: string): Promise<void>;
    initializeDefaultFaqs(): Promise<void>;
}
