import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Put } from '@nestjs/common';
import { AiAgentService } from './ai-agent.service';
import type { CreateAiAgentDto, UpdateAiAgentDto } from './ai-agent.service';
import { ApiKeyGuard } from '../ai/api-key.guard';

@Controller('ai-agents')
@UseGuards(ApiKeyGuard)
export class AiAgentController {
  constructor(private readonly aiAgentService: AiAgentService) {}

  @Get()
  async getAllAgents() {
    return await this.aiAgentService.getAllAgents();
  }

  @Get('active')
  async getActiveAgents() {
    return await this.aiAgentService.getActiveAgents();
  }

  @Get('best')
  async getBestAgent() {
    return await this.aiAgentService.getBestAgent();
  }


  @Get('system-messages')
  async getSystemMessages() {
    return await this.aiAgentService.getSystemPredefinedMessages();
  }

  @Put('system-messages')
  async updateSystemMessages(
    @Body()
    body: {
      imageReceivedMessage?: string;
    },
  ) {
    return await this.aiAgentService.updateSystemPredefinedMessages(body);
  }

  @Get(':id')
  async getAgentById(@Param('id') id: string) {
    return await this.aiAgentService.getAgentById(id);
  }

  @Put(':id')
  async updateAgent(@Param('id') id: string, @Body() updateAgentDto: UpdateAiAgentDto) {
    return await this.aiAgentService.updateAgent(id, updateAgentDto);
  }

  @Put(':id/toggle')
  async toggleAgent(@Param('id') id: string) {
    return await this.aiAgentService.toggleAgentStatus(id);
  }

  @Put(':id/status')
  async updateAgentStatus(@Param('id') id: string, @Body() body: { isActive: boolean }) {
    return await this.aiAgentService.updateAgentStatus(id, body.isActive);
  }

  @Put(':id/stats')
  async updateAgentStats(
    @Param('id') id: string,
    @Body() stats: { conversationCount?: number; messageCount?: number }
  ) {
    return await this.aiAgentService.updateAgentStats(
      id,
      stats.conversationCount,
      stats.messageCount
    );
  }

}
