import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pinecone } from '@pinecone-database/pinecone';

@Injectable()
export class PineconeService implements OnModuleInit {
    private readonly logger = new Logger(PineconeService.name);
    private pinecone: Pinecone;
    private indexName: string;

    constructor(private configService: ConfigService) {
        const apiKey = this.configService.get<string>('PINECONE_API_KEY');
        this.indexName = this.configService.get<string>('PINECONE_INDEX_NAME') || 'frooxiai';

        if (!apiKey || apiKey.includes('PASTE_YOUR')) {
            this.logger.warn('PINECONE_API_KEY is missing or invalid. Visual search will be disabled.');
            return;
        }

        try {
            this.pinecone = new Pinecone({
                apiKey: apiKey,
            });
        } catch (error) {
            this.logger.error(`Failed to initialize Pinecone SDK: ${error.message}`);
        }
    }

    async onModuleInit() {
        if (!this.pinecone) return;
        try {
            await this.pinecone.listIndexes();
            this.logger.log('Pinecone connection initialized.');
        } catch (error) {
            this.logger.error(`Error connecting to Pinecone: ${error.message}`);
        }
    }

    async upsert(records: any[]) {
        try {
            const index = this.pinecone.index(this.indexName);
            await index.upsert(records as any);
        } catch (error) {
            this.logger.error(`Error upserting to Pinecone: ${error.message}`);
            throw error;
        }
    }

    async query(vector: number[], topK: number = 5) {
        try {
            const index = this.pinecone.index(this.indexName);
            const queryResponse = await index.query({
                vector,
                topK,
                includeMetadata: true,
            });
            return queryResponse.matches;
        } catch (error) {
            this.logger.error(`Error querying Pinecone: ${error.message}`);
            throw error;
        }
    }

    async deleteOne(id: string) {
        if (!this.pinecone) return;
        try {
            const index = this.pinecone.index(this.indexName);
            await index.deleteOne({ id });
        } catch (error) {
            this.logger.error(`Error deleting from Pinecone: ${error.message}`);
            throw error;
        }
    }
}
