import { WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { MetaWebhookService } from './meta-webhook.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { AgentLifecycleService } from './agent-lifecycle.service';
export declare class WebhookProcessor extends WorkerHost {
    private readonly metaWebhookService;
    private readonly prisma;
    private readonly redis;
    private readonly lifecycle;
    private readonly logger;
    constructor(metaWebhookService: MetaWebhookService, prisma: PrismaService, redis: RedisService, lifecycle: AgentLifecycleService);
    process(job: Job<any, any, string>): Promise<any>;
    private processNonAiEvent;
    private handleRead;
    private handleHandover;
}
