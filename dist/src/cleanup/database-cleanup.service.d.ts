import { PrismaService } from '../prisma/prisma.service';
export declare class DatabaseCleanupService {
    private prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    performDailyCleanup(): Promise<void>;
    performWeeklyCleanup(): Promise<void>;
    performMonthlyCleanup(): Promise<void>;
    private cleanOldMessages;
    private cleanOldNotifications;
    private cleanReadNotifications;
    private updateAbandonedOrderFlags;
    private cleanOldConversations;
    private cleanOrphanedData;
    private optimizeDatabase;
    private analyzeDatabaseGrowth;
    private generateCleanupReport;
    private vacuumDatabase;
    triggerManualCleanup(type?: 'daily' | 'weekly' | 'monthly'): Promise<void>;
    getCleanupStats(): Promise<any>;
}
