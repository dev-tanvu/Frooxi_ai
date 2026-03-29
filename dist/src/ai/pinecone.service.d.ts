import { OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
export declare class PineconeService implements OnModuleInit {
    private configService;
    private readonly logger;
    private pinecone;
    private indexName;
    constructor(configService: ConfigService);
    onModuleInit(): Promise<void>;
    upsert(records: any[]): Promise<void>;
    query(vector: number[], topK?: number): Promise<import("@pinecone-database/pinecone").ScoredPineconeRecord<import("@pinecone-database/pinecone").RecordMetadata>[]>;
    deleteOne(id: string): Promise<void>;
}
