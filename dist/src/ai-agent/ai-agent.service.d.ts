import { OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
export interface CreateAiAgentDto {
    name: string;
    prompt?: string;
    instructionPrompt?: string;
    unavailableMessage?: string;
    model?: string;
    isActive?: boolean;
}
export interface UpdateAiAgentDto extends Partial<CreateAiAgentDto> {
}
export interface SystemPredefinedMessages {
    imageReceivedMessage: string;
    voiceReceivedMessage: string;
}
export declare class AiAgentService implements OnModuleInit {
    private prisma;
    private configService;
    private readonly logger;
    private systemMessagesCache;
    private systemMessagesCacheExpiry;
    private agentCache;
    private readonly AGENT_CACHE_TTL;
    constructor(prisma: PrismaService, configService: ConfigService);
    onModuleInit(): Promise<void>;
    createAgent(createAgentDto: CreateAiAgentDto): Promise<any>;
    getAllAgents(): Promise<any[]>;
    getActiveAgents(): Promise<any[]>;
    getAgentById(id: string): Promise<any | null>;
    updateAgent(id: string, updateAgentDto: UpdateAiAgentDto): Promise<any>;
    deleteAgent(id: string): Promise<void>;
    toggleAgentStatus(id: string): Promise<any>;
    updateAgentStatus(id: string, isActive: boolean): Promise<any>;
    updateAgentStats(id: string, conversationCount?: number, messageCount?: number): Promise<any>;
    getBestAgent(): Promise<any | null>;
    getAgentByName(name: string): Promise<any | null>;
    getActiveAgentByName(name: string): Promise<any | null>;
    initializeDefaultAgents(): Promise<void>;
    getSystemPredefinedMessages(): Promise<SystemPredefinedMessages>;
    updateSystemPredefinedMessages(data: Partial<SystemPredefinedMessages>): Promise<SystemPredefinedMessages>;
}
