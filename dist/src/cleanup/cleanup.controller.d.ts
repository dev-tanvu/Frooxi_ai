import { DatabaseCleanupService } from './database-cleanup.service';
export declare class CleanupController {
    private readonly cleanupService;
    constructor(cleanupService: DatabaseCleanupService);
    getCleanupStats(): Promise<any>;
    triggerCleanup(type?: 'daily' | 'weekly' | 'monthly'): Promise<{
        message: string;
        timestamp: Date;
    }>;
}
