import { Controller, Get, Post, Body, Param, Delete, Put, Query, UseGuards } from '@nestjs/common';
import { FaqService } from './faq.service';
import { ApiKeyGuard } from '../ai/api-key.guard';

@Controller('faqs')
@UseGuards(ApiKeyGuard)
export class FaqController {
  constructor(private readonly faqService: FaqService) {}

  @Post()
  createFaq(@Body() faqData: any) {
    return this.faqService.createFaq(faqData);
  }

  @Get()
  getFaqs(@Query('category') category?: string) {
    return this.faqService.getFaqsByCategory(category);
  }

  @Get('categories')
  getCategories() {
    return this.faqService.getCategories();
  }

  @Get('match')
  async findFaqMatch(@Query('message') message: string) {
    const match = await this.faqService.findFaqMatch(message);
    return match ? {
      found: true,
      faq: match.faq,
      confidence: match.confidence,
      matchedKeywords: match.matchedKeywords
    } : { found: false };
  }

  @Put(':id')
  updateFaq(@Param('id') id: string, @Body() updateData: any) {
    return this.faqService.updateFaq(id, updateData);
  }

  @Delete(':id')
  deleteFaq(@Param('id') id: string) {
    return this.faqService.deleteFaq(id);
  }

  @Post('initialize')
  initializeDefaultFaqs() {
    return this.faqService.initializeDefaultFaqs();
  }
}
