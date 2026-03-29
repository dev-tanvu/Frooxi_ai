import { AiAgentService } from './ai-agent.service';
import type { UpdateAiAgentDto } from './ai-agent.service';
export declare class AiAgentController {
    private readonly aiAgentService;
    constructor(aiAgentService: AiAgentService);
    getAllAgents(): Promise<any[]>;
    getActiveAgents(): Promise<any[]>;
    getBestAgent(): Promise<any>;
    getSystemMessages(): Promise<import("./ai-agent.service").SystemPredefinedMessages>;
    updateSystemMessages(body: {
        imageReceivedMessage?: string;
    }): Promise<import("./ai-agent.service").SystemPredefinedMessages>;
    getAgentById(id: string): Promise<any>;
    updateAgent(id: string, updateAgentDto: UpdateAiAgentDto): Promise<any>;
    toggleAgent(id: string): Promise<any>;
    updateAgentStatus(id: string, body: {
        isActive: boolean;
    }): Promise<any>;
    updateAgentStats(id: string, stats: {
        conversationCount?: number;
        messageCount?: number;
    }): Promise<any>;
}
