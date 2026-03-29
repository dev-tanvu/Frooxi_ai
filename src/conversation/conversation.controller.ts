import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ConversationService } from './conversation.service';
import { ApiKeyGuard } from '../ai/api-key.guard';

@Controller('conversations')
@UseGuards(ApiKeyGuard)
export class ConversationController {
  constructor(private conversationService: ConversationService) {}

  @Get('customer/:customerId')
  async getCustomerConversations(@Param('customerId') customerId: string) {
    return this.conversationService.getCustomerConversations(customerId);
  }

  @Get(':id/messages')
  async getMessages(@Param('id') conversationId: string) {
    return this.conversationService.getConversationMessages(conversationId);
  }
}
