import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super();
  }

  async onModuleInit() {
    this.logger.log('Connecting to the database...');
    try {
      await this.$connect();
      this.logger.log('Database connection established.');
    } catch (error) {
      this.logger.error('Failed to connect to database on init. Will retry on first query.');
    }
  }

  async ensureConnected() {
    try {
      await this.$queryRaw`SELECT 1`;
    } catch (error) {
      this.logger.warn('Database connection lost. Reconnecting...');
      await this.$connect();
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}

