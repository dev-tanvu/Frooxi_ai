import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class StoreService implements OnModuleInit {
  private readonly logger = new Logger(StoreService.name);
  private configCache: any = null;
  private configCacheExpiry: number = 0;
  private rulesCache: any = null;
  private rulesCacheExpiry: number = 0;
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    await this.ensureConfigExists();
  }

  async ensureConfigExists() {
    const configCount = await this.prisma.storeConfig.count();
    if (configCount === 0) {
      this.logger.log('🌱 Initializing default store configuration...');
      await this.prisma.storeConfig.create({
        data: {
          storeName: 'Frooxi',
          currency: 'BDT',
          businessDetails: 'Frooxi is a premium fashion and product discovery platform.',
        },
      });
    }
  }

  async getConfig() {
    if (this.configCache && Date.now() < this.configCacheExpiry) {
      return this.configCache;
    }

    let retries = 3;
    while (retries > 0) {
      try {
        this.configCache = await this.prisma.storeConfig.findFirst();
        this.configCacheExpiry = Date.now() + this.CACHE_TTL;
        return this.configCache;
      } catch (err) {
        retries--;
        if (retries === 0) {
          this.logger.error(`Database connection failed in getConfig: ${err.message}`);
          return { businessDetails: 'Frooxi', defaultSystem: true }; // Safe fallback
        }
        await new Promise(res => setTimeout(res, 1000)); // Delay
      }
    }
  }

  async updateConfig(data: any) {
    const config = await this.getConfig();
    if (!config) throw new Error('Store configuration not found');
    
    this.configCache = null; // invalidate cache
    
    return this.prisma.storeConfig.update({
      where: { id: config.id },
      data,
    });
  }

  // --- Store Rules (Knowledge Base) ---

  async findAllRules() {
    return this.prisma.storeRule.findMany({
      orderBy: { updatedAt: 'desc' },
    });
  }

  async findActiveRules() {
    if (this.rulesCache && Date.now() < this.rulesCacheExpiry) {
      return this.rulesCache;
    }
    
    let retries = 3;
    while (retries > 0) {
      try {
        this.rulesCache = await this.prisma.storeRule.findMany({
          where: { active: true },
        });
        this.rulesCacheExpiry = Date.now() + this.CACHE_TTL;
        return this.rulesCache;
      } catch (err) {
        retries--;
        if (retries === 0) {
          this.logger.error(`Database connection failed in findActiveRules: ${err.message}`);
          return []; // Safe fallback to allow AI generation to continue without rules
        }
        await new Promise(res => setTimeout(res, 1000)); // Delay
      }
    }
  }

  async createRule(data: any) {
    this.rulesCache = null;
    return this.prisma.storeRule.create({ data });
  }

  async updateRule(id: string, data: any) {
    this.rulesCache = null;
    return this.prisma.storeRule.update({
      where: { id },
      data,
    });
  }

  async deleteRule(id: string) {
    this.rulesCache = null;
    return this.prisma.storeRule.delete({
      where: { id },
    });
  }
}