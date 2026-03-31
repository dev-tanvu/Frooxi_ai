import { WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { ProactiveService } from './proactive.service';
export declare class ProactiveProcessor extends WorkerHost {
    private readonly proactiveService;
    private readonly logger;
    constructor(proactiveService: ProactiveService);
    process(job: Job<any, any, string>): Promise<any>;
}
