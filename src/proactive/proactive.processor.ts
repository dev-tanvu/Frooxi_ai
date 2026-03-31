import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { ProactiveService } from './proactive.service';

@Processor('proactive')
export class ProactiveProcessor extends WorkerHost {
    private readonly logger = new Logger(ProactiveProcessor.name);

    constructor(private readonly proactiveService: ProactiveService) {
        super();
    }

    async process(job: Job<any, any, string>): Promise<any> {
        this.logger.log(`⚙️ Processing proactive task: ${job.name}`);

        try {
            switch (job.name) {
                case 'handle-abandoned-carts':
                    await this.proactiveService.handleAbandonedCarts();
                    break;
                case 'handle-feedback-loop':
                    await this.proactiveService.handlePostPurchaseFeedback();
                    break;
                default:
                    this.logger.warn(`Unknown job: ${job.name}`);
            }
        } catch (error) {
            this.logger.error(`❌ Proactive job ${job.name} failed: ${error.message}`, error.stack);
            throw error;
        }
    }
}
