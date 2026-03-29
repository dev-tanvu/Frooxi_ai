import { FaqService } from '../faq/faq.service';
export declare class DebugController {
    private readonly faqService;
    constructor(faqService: FaqService);
    testFaq(message: string): Promise<{
        message: string;
        result: import("../faq/faq.service").FaqMatch | null;
        timestamp: string;
    }>;
}
