import { FaqService } from '../faq/faq.service';
import { PrismaService } from '../prisma/prisma.service';
export declare class AiController {
    private readonly faqService;
    private readonly prisma;
    constructor(faqService: FaqService, prisma: PrismaService);
    getAIStats(): Promise<{
        aiResponsesToday: number;
        faqMatchesToday: number;
        costSavedToday: string;
        avgResponseTime: number;
        aiResponseChange: string;
        faqMatchChange: string;
        costSavedChange: string;
        responseTimeChange: string;
        performanceData: {
            time: string;
            ai: number;
            faq: number;
            fast: number;
        }[];
        totalMessages: number;
        aiAccuracy: string;
        faqAccuracy: string;
        systemUptime: string;
    }>;
}
