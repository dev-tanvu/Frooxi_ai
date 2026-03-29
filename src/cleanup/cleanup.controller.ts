import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { DatabaseCleanupService } from './database-cleanup.service';
import { ApiKeyGuard } from '../ai/api-key.guard';

@Controller('cleanup')
@UseGuards(ApiKeyGuard)
export class CleanupController {
  constructor(private readonly cleanupService: DatabaseCleanupService) {}

  @Get('stats')
  async getCleanupStats() {
    return await this.cleanupService.getCleanupStats();
  }

  @Post('trigger')
  async triggerCleanup(@Query('type') type: 'daily' | 'weekly' | 'monthly' = 'daily') {
    await this.cleanupService.triggerManualCleanup(type);
    return { message: `Cleanup triggered: ${type}`, timestamp: new Date() };
  }
}
