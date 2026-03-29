"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var PineconeService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PineconeService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const pinecone_1 = require("@pinecone-database/pinecone");
let PineconeService = PineconeService_1 = class PineconeService {
    configService;
    logger = new common_1.Logger(PineconeService_1.name);
    pinecone;
    indexName;
    constructor(configService) {
        this.configService = configService;
        const apiKey = this.configService.get('PINECONE_API_KEY');
        this.indexName = this.configService.get('PINECONE_INDEX_NAME') || 'frooxiai';
        if (!apiKey || apiKey.includes('PASTE_YOUR')) {
            this.logger.warn('PINECONE_API_KEY is missing or invalid. Visual search will be disabled.');
            return;
        }
        try {
            this.pinecone = new pinecone_1.Pinecone({
                apiKey: apiKey,
            });
        }
        catch (error) {
            this.logger.error(`Failed to initialize Pinecone SDK: ${error.message}`);
        }
    }
    async onModuleInit() {
        if (!this.pinecone)
            return;
        try {
            await this.pinecone.listIndexes();
            this.logger.log('Pinecone connection initialized.');
        }
        catch (error) {
            this.logger.error(`Error connecting to Pinecone: ${error.message}`);
        }
    }
    async upsert(records) {
        try {
            const index = this.pinecone.index(this.indexName);
            await index.upsert(records);
        }
        catch (error) {
            this.logger.error(`Error upserting to Pinecone: ${error.message}`);
            throw error;
        }
    }
    async query(vector, topK = 5) {
        try {
            const index = this.pinecone.index(this.indexName);
            const queryResponse = await index.query({
                vector,
                topK,
                includeMetadata: true,
            });
            return queryResponse.matches;
        }
        catch (error) {
            this.logger.error(`Error querying Pinecone: ${error.message}`);
            throw error;
        }
    }
    async deleteOne(id) {
        if (!this.pinecone)
            return;
        try {
            const index = this.pinecone.index(this.indexName);
            await index.deleteOne({ id });
        }
        catch (error) {
            this.logger.error(`Error deleting from Pinecone: ${error.message}`);
            throw error;
        }
    }
};
exports.PineconeService = PineconeService;
exports.PineconeService = PineconeService = PineconeService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], PineconeService);
//# sourceMappingURL=pinecone.service.js.map