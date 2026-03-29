import { Controller, Get, Patch, Post, Param, Body } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('stats')
  async getStats() {
    return this.appService.getStats();
  }

  @Get('messages/recent')
  async getRecentMessages() {
    return this.appService.getRecentMessages();
  }

  @Get('notifications')
  async getNotifications() {
    return this.appService.getNotifications();
  }

  @Patch('notifications/:id/read')
  async markNotificationRead(@Param('id') id: string) {
    return this.appService.markNotificationRead(id);
  }

  @Post('admin/chat/pause')
  async pauseAi(@Body() body: { customerId: string, durationMinutes?: number }) {
    return this.appService.pauseAi(body.customerId, body.durationMinutes);
  }

  @Post('admin/chat/resume')
  async resumeAi(@Body() body: { customerId: string }) {
    return this.appService.resumeAi(body.customerId);
  }

  @Post('admin/chat/send')
  async sendAdminMessage(@Body() body: { customerId: string, message: string }) {
    return this.appService.sendAdminMessage(body.customerId, body.message);
  }
}
