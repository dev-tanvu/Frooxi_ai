import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { FaqService } from '../faq/faq.service';
import { ApiKeyGuard } from '../ai/api-key.guard';

@Controller('debug')
@UseGuards(ApiKeyGuard)
export class DebugController {
  constructor(private readonly faqService: FaqService) {}

  @Get('faq-test')
  async testFaq(@Query('message') message: string) {
    const result = await this.faqService.findFaqMatch(message);
    return {
      message,
      result,
      timestamp: new Date().toISOString()
    };
  }
}
