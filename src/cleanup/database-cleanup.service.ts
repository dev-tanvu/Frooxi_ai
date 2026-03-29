import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DatabaseCleanupService {
    private readonly logger = new Logger(DatabaseCleanupService.name);

    constructor(private prisma: PrismaService) {}

    /**
     * DAILY CLEANUP - Runs every day at 2:00 AM
     * Cleans up temporary data that's only needed for short periods
     */
    @Cron('0 2 * * *') // Every day at 2:00 AM
    async performDailyCleanup() {
        this.logger.log('🧹 Starting daily database cleanup...');
        
        try {
            const results = await Promise.all([
                this.cleanOldMessages(),
                this.cleanOldNotifications(),
                this.cleanReadNotifications(),
                this.updateAbandonedOrderFlags()
            ]);

            const summary = {
                messagesDeleted: results[0],
                notificationsDeleted: results[1],
                readNotificationsCleared: results[2],
                orderFlagsUpdated: results[3]
            };

            this.logger.log(`✅ Daily cleanup completed: ${JSON.stringify(summary)}`);
        } catch (error) {
            this.logger.error(`❌ Daily cleanup failed: ${error.message}`);
        }
    }

    /**
     * WEEKLY CLEANUP - Runs every Sunday at 3:00 AM
     * Cleans up data that's needed for medium periods
     */
    @Cron('0 3 * * 0') // Every Sunday at 3:00 AM
    async performWeeklyCleanup() {
        this.logger.log('🧹 Starting weekly database cleanup...');
        
        try {
            const results = await Promise.all([
                this.cleanOldConversations(),
                this.cleanOrphanedData(),
                this.optimizeDatabase()
            ]);

            const summary = {
                conversationsDeleted: results[0],
                orphanedDataCleaned: results[1],
                optimizationCompleted: results[2]
            };

            this.logger.log(`✅ Weekly cleanup completed: ${JSON.stringify(summary)}`);
        } catch (error) {
            this.logger.error(`❌ Weekly cleanup failed: ${error.message}`);
        }
    }

    /**
     * MONTHLY CLEANUP - Runs on 1st of every month at 4:00 AM
     * Deep cleanup and optimization
     */
    @Cron('0 4 1 * *') // 1st of every month at 4:00 AM
    async performMonthlyCleanup() {
        this.logger.log('🧹 Starting monthly database cleanup...');
        
        try {
            const results = await Promise.all([
                this.analyzeDatabaseGrowth(),
                this.generateCleanupReport(),
                this.vacuumDatabase()
            ]);

            const summary = {
                growthAnalysis: results[0],
                reportGenerated: results[1],
                vacuumCompleted: results[2]
            };

            this.logger.log(`✅ Monthly cleanup completed: ${JSON.stringify(summary)}`);
        } catch (error) {
            this.logger.error(`❌ Monthly cleanup failed: ${error.message}`);
        }
    }

    /**
     * Clean messages older than 7 days
     * Messages are only needed for short-term conversation context
     */
    private async cleanOldMessages(): Promise<number> {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const result = await this.prisma.message.deleteMany({
            where: {
                createdAt: {
                    lt: sevenDaysAgo
                }
            }
        });

        this.logger.log(`🗑️ Deleted ${result.count} old messages (older than 7 days)`);
        return result.count;
    }

    /**
     * Clean notifications older than 7 days
     * Notifications are temporary alerts
     */
    private async cleanOldNotifications(): Promise<number> {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const result = await this.prisma.notification.deleteMany({
            where: {
                createdAt: {
                    lt: sevenDaysAgo
                }
            }
        });

        this.logger.log(`🗑️ Deleted ${result.count} old notifications (older than 7 days)`);
        return result.count;
    }

    /**
     * Clean all read notifications immediately
     * Read notifications don't need to be kept
     */
    private async cleanReadNotifications(): Promise<number> {
        const result = await this.prisma.notification.deleteMany({
            where: {
                read: true
            }
        });

        this.logger.log(`🗑️ Deleted ${result.count} read notifications`);
        return result.count;
    }

    /**
     * Reset abandoned follow-up flags for orders older than 30 days
     * Allows for fresh abandonment sequences if customer returns
     */
    private async updateAbandonedOrderFlags(): Promise<number> {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const result = await this.prisma.order.updateMany({
            where: {
                createdAt: {
                    lt: thirtyDaysAgo
                },
                abandonedFollowUpSent: true
            },
            data: {
                abandonedFollowUpSent: false
            }
        });

        this.logger.log(`🔄 Reset abandoned flags for ${result.count} old orders`);
        return result.count;
    }

    /**
     * Clean conversations older than 30 days that have no messages
     * Empty conversations serve no purpose
     */
    private async cleanOldConversations(): Promise<number> {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        // First, get conversations with no messages
        const conversationsToDelete = await this.prisma.conversation.findMany({
            where: {
                createdAt: {
                    lt: thirtyDaysAgo
                },
                messages: {
                    none: {}
                }
            },
            select: {
                id: true
            }
        });

        const conversationIds = conversationsToDelete.map(c => c.id);

        if (conversationIds.length === 0) {
            this.logger.log('📝 No empty conversations to delete');
            return 0;
        }

        const result = await this.prisma.conversation.deleteMany({
            where: {
                id: {
                    in: conversationIds
                }
            }
        });

        this.logger.log(`🗑️ Deleted ${result.count} empty conversations (older than 30 days)`);
        return result.count;
    }

    /**
     * Clean orphaned data (data without proper relationships)
     */
    private async cleanOrphanedData(): Promise<number> {
        let totalCleaned = 0;

        try {
            // Clean conversations without valid metaIntegration using raw SQL
            const orphanedConversationsResult = await this.prisma.$executeRaw`
                DELETE FROM "Conversation" 
                WHERE "metaIntegrationId" NOT IN (SELECT "id" FROM "MetaIntegration")
            `;
            
            if (orphanedConversationsResult > 0) {
                totalCleaned += orphanedConversationsResult;
                this.logger.log(`🗑️ Deleted ${orphanedConversationsResult} orphaned conversations`);
            }

            // Clean customers without valid metaIntegration using raw SQL
            const orphanedCustomersResult = await this.prisma.$executeRaw`
                DELETE FROM "Customer" 
                WHERE "metaIntegrationId" NOT IN (SELECT "id" FROM "MetaIntegration")
            `;

            if (orphanedCustomersResult > 0) {
                totalCleaned += orphanedCustomersResult;
                this.logger.log(`🗑️ Deleted ${orphanedCustomersResult} orphaned customers`);
            }

        } catch (error) {
            this.logger.error(`❌ Orphaned data cleanup failed: ${error.message}`);
        }

        return totalCleaned;
    }

    /**
     * Basic database optimization
     */
    private async optimizeDatabase(): Promise<boolean> {
        try {
            // Update table statistics (PostgreSQL specific)
            await this.prisma.$executeRaw`ANALYZE;`;
            this.logger.log('📊 Database statistics updated');
            return true;
        } catch (error) {
            this.logger.warn(`⚠️ Database optimization failed: ${error.message}`);
            return false;
        }
    }

    /**
     * Analyze database growth trends
     */
    private async analyzeDatabaseGrowth(): Promise<any> {
        try {
            const [
                messageCount,
                notificationCount,
                conversationCount,
                customerCount,
                orderCount
            ] = await Promise.all([
                this.prisma.message.count(),
                this.prisma.notification.count(),
                this.prisma.conversation.count(),
                this.prisma.customer.count(),
                this.prisma.order.count()
            ]);

            const analysis = {
                timestamp: new Date(),
                messageCount,
                notificationCount,
                conversationCount,
                customerCount,
                orderCount
            };

            this.logger.log(`📈 Database growth analysis: ${JSON.stringify(analysis)}`);
            return analysis;
        } catch (error) {
            this.logger.error(`❌ Growth analysis failed: ${error.message}`);
            return null;
        }
    }

    /**
     * Generate cleanup report
     */
    private async generateCleanupReport(): Promise<string> {
        try {
            const analysis = await this.analyzeDatabaseGrowth();
            
            const report = `
📊 DATABASE CLEANUP REPORT - ${new Date().toLocaleDateString()}
===========================================
📝 Messages: ${analysis?.messageCount || 0}
🔔 Notifications: ${analysis?.notificationCount || 0}
💬 Conversations: ${analysis?.conversationCount || 0}
👥 Customers: ${analysis?.customerCount || 0}
📦 Orders: ${analysis?.orderCount || 0}

🗑️ Cleanup Schedule:
- Daily: Messages (7 days), Notifications (7 days)
- Weekly: Empty conversations (30 days)
- Monthly: Analysis & optimization

💾 Storage Saved:
- Messages: ~${Math.round((analysis?.messageCount || 0) * 0.001)}MB per day
- Notifications: ~${Math.round((analysis?.notificationCount || 0) * 0.0005)}MB per day
            `.trim();

            this.logger.log(report);
            return report;
        } catch (error) {
            this.logger.error(`❌ Report generation failed: ${error.message}`);
            return 'Report generation failed';
        }
    }

    /**
     * Perform database vacuum (PostgreSQL specific)
     * This should be done carefully as it can lock tables
     */
    private async vacuumDatabase(): Promise<boolean> {
        try {
            // Use VACUUM ANALYZE to reclaim space and update statistics
            await this.prisma.$executeRaw`VACUUM ANALYZE;`;
            this.logger.log('🧹 Database vacuum completed');
            return true;
        } catch (error) {
            this.logger.warn(`⚠️ Database vacuum failed: ${error.message}`);
            return false;
        }
    }

    /**
     * Manual cleanup trigger for testing
     */
    async triggerManualCleanup(type: 'daily' | 'weekly' | 'monthly' = 'daily') {
        this.logger.log(`🔧 Manual cleanup triggered: ${type}`);
        
        switch (type) {
            case 'daily':
                await this.performDailyCleanup();
                break;
            case 'weekly':
                await this.performWeeklyCleanup();
                break;
            case 'monthly':
                await this.performMonthlyCleanup();
                break;
        }
    }

    /**
     * Get cleanup statistics
     */
    async getCleanupStats(): Promise<any> {
        const now = new Date();
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

        const [
            totalMessages,
            oldMessages,
            totalNotifications,
            oldNotifications,
            readNotifications,
            totalConversations,
            oldEmptyConversations
        ] = await Promise.all([
            this.prisma.message.count(),
            this.prisma.message.count({ where: { createdAt: { lt: sevenDaysAgo } } }),
            this.prisma.notification.count(),
            this.prisma.notification.count({ where: { createdAt: { lt: sevenDaysAgo } } }),
            this.prisma.notification.count({ where: { read: true } }),
            this.prisma.conversation.count(),
            this.prisma.conversation.count({ 
                where: { 
                    createdAt: { lt: thirtyDaysAgo },
                    messages: { none: {} }
                } 
            })
        ]);

        return {
            totalMessages,
            oldMessages,
            totalNotifications,
            oldNotifications,
            readNotifications,
            totalConversations,
            oldEmptyConversations,
            potentialSavings: {
                messages: oldMessages,
                notifications: oldNotifications + readNotifications,
                conversations: oldEmptyConversations
            }
        };
    }
}
