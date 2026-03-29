import { Controller, Get, Patch, Post, Delete, Body, UseGuards } from '@nestjs/common';
import { StoreService } from './store.service';
import { ApiKeyGuard } from '../ai/api-key.guard';

@Controller('store')
@UseGuards(ApiKeyGuard)
export class StoreController {
  constructor(private storeService: StoreService) {}

  @Get('config')
  async getConfig() {
    return this.storeService.getConfig();
  }

  @Patch('config')
  async updateConfig(@Body() data: any) {
    return this.storeService.updateConfig(data);
  }

  // --- Store Rules (Knowledge Base) ---

  @Get('rules')
  async getAllRules() {
    return this.storeService.findAllRules();
  }

  @Post('rules')
  async createRule(@Body() data: any) {
    return this.storeService.createRule(data);
  }

  @Patch('rules/:id')
  async updateRule(@Body() data: any, @Body('id') idParam: string) {
    // Note: id can come from param or body, I'll use a dynamic approach
    return this.storeService.updateRule(data.id || idParam, data);
  }

  @Delete('rules/:id')
  async deleteRule(@Body('id') id: string) {
    return this.storeService.deleteRule(id);
  }
}
