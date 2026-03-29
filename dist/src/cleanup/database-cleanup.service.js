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
var DatabaseCleanupService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DatabaseCleanupService = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const prisma_service_1 = require("../prisma/prisma.service");
let DatabaseCleanupService = DatabaseCleanupService_1 = class DatabaseCleanupService {
    prisma;
    logger = new common_1.Logger(DatabaseCleanupService_1.name);
    constructor(prisma) {
        this.prisma = prisma;
    }
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
        }
        catch (error) {
            this.logger.error(`❌ Daily cleanup failed: ${error.message}`);
        }
    }
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
        }
        catch (error) {
            this.logger.error(`❌ Weekly cleanup failed: ${error.message}`);
        }
    }
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
        }
        catch (error) {
            this.logger.error(`❌ Monthly cleanup failed: ${error.message}`);
        }
    }
    async cleanOldMessages() {
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
    async cleanOldNotifications() {
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
    async cleanReadNotifications() {
        const result = await this.prisma.notification.deleteMany({
            where: {
                read: true
            }
        });
        this.logger.log(`🗑️ Deleted ${result.count} read notifications`);
        return result.count;
    }
    async updateAbandonedOrderFlags() {
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
    async cleanOldConversations() {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
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
    async cleanOrphanedData() {
        let totalCleaned = 0;
        try {
            const orphanedConversationsResult = await this.prisma.$executeRaw `
                DELETE FROM "Conversation" 
                WHERE "metaIntegrationId" NOT IN (SELECT "id" FROM "MetaIntegration")
            `;
            if (orphanedConversationsResult > 0) {
                totalCleaned += orphanedConversationsResult;
                this.logger.log(`🗑️ Deleted ${orphanedConversationsResult} orphaned conversations`);
            }
            const orphanedCustomersResult = await this.prisma.$executeRaw `
                DELETE FROM "Customer" 
                WHERE "metaIntegrationId" NOT IN (SELECT "id" FROM "MetaIntegration")
            `;
            if (orphanedCustomersResult > 0) {
                totalCleaned += orphanedCustomersResult;
                this.logger.log(`🗑️ Deleted ${orphanedCustomersResult} orphaned customers`);
            }
        }
        catch (error) {
            this.logger.error(`❌ Orphaned data cleanup failed: ${error.message}`);
        }
        return totalCleaned;
    }
    async optimizeDatabase() {
        try {
            await this.prisma.$executeRaw `ANALYZE;`;
            this.logger.log('📊 Database statistics updated');
            return true;
        }
        catch (error) {
            this.logger.warn(`⚠️ Database optimization failed: ${error.message}`);
            return false;
        }
    }
    async analyzeDatabaseGrowth() {
        try {
            const [messageCount, notificationCount, conversationCount, customerCount, orderCount] = await Promise.all([
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
        }
        catch (error) {
            this.logger.error(`❌ Growth analysis failed: ${error.message}`);
            return null;
        }
    }
    async generateCleanupReport() {
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
        }
        catch (error) {
            this.logger.error(`❌ Report generation failed: ${error.message}`);
            return 'Report generation failed';
        }
    }
    async vacuumDatabase() {
        try {
            await this.prisma.$executeRaw `VACUUM ANALYZE;`;
            this.logger.log('🧹 Database vacuum completed');
            return true;
        }
        catch (error) {
            this.logger.warn(`⚠️ Database vacuum failed: ${error.message}`);
            return false;
        }
    }
    async triggerManualCleanup(type = 'daily') {
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
    async getCleanupStats() {
        const now = new Date();
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        const [totalMessages, oldMessages, totalNotifications, oldNotifications, readNotifications, totalConversations, oldEmptyConversations] = await Promise.all([
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
};
exports.DatabaseCleanupService = DatabaseCleanupService;
__decorate([
    (0, schedule_1.Cron)('0 2 * * *'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], DatabaseCleanupService.prototype, "performDailyCleanup", null);
__decorate([
    (0, schedule_1.Cron)('0 3 * * 0'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], DatabaseCleanupService.prototype, "performWeeklyCleanup", null);
__decorate([
    (0, schedule_1.Cron)('0 4 1 * *'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], DatabaseCleanupService.prototype, "performMonthlyCleanup", null);
exports.DatabaseCleanupService = DatabaseCleanupService = DatabaseCleanupService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], DatabaseCleanupService);
//# sourceMappingURL=database-cleanup.service.js.map