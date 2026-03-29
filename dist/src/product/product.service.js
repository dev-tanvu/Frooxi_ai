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
var ProductService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProductService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const gemini_service_1 = require("../ai/gemini.service");
const pinecone_service_1 = require("../ai/pinecone.service");
const redis_service_1 = require("../redis/redis.service");
let ProductService = ProductService_1 = class ProductService {
    prisma;
    gemini;
    pinecone;
    redis;
    logger = new common_1.Logger(ProductService_1.name);
    constructor(prisma, gemini, pinecone, redis) {
        this.prisma = prisma;
        this.gemini = gemini;
        this.pinecone = pinecone;
        this.redis = redis;
    }
    async upsertProducts(products) {
        this.logger.log(`🔄 Syncing ${products.length} products from Google Sheets...`);
        const chunkSize = 5;
        for (let i = 0; i < products.length; i += chunkSize) {
            const chunk = products.slice(i, i + chunkSize);
            await Promise.all(chunk.map(product => this.syncSingleProduct(product)));
        }
        this.logger.log('✅ Product sync completed.');
    }
    async syncSingleProduct(product) {
        try {
            const id = String(product.product_id || product.id);
            const name = product.product_name || product.name || 'Unknown Product';
            const price = parseFloat(product.price_retail) || parseFloat(product.price) || null;
            const colors = product.color_name ? [String(product.color_name)] :
                (Array.isArray(product.colors) ? product.colors : []);
            const sizes = product.size ? [String(product.size)] :
                (Array.isArray(product.sizes) ? product.sizes : []);
            let allImages = [];
            if (product.thumbnail_url)
                allImages.push(product.thumbnail_url);
            const gallery = product.image_gallery_urls;
            if (typeof gallery === 'string' && gallery.trim()) {
                allImages.push(...gallery.split(',').map((s) => s.trim()));
            }
            else if (Array.isArray(gallery)) {
                allImages.push(...gallery);
            }
            const imageUrls = [...new Set(allImages)].filter(url => url.startsWith('http'));
            const metadata = { ...(product.metadata || {}), ...product };
            delete metadata.image_gallery_urls;
            const updatedProduct = await this.prisma.product.upsert({
                where: { id },
                update: {
                    name,
                    price,
                    colors,
                    sizes,
                    imageUrls,
                    description: product.description || `${product.category || ''} ${product.brand_name || ''} ${product.material_composition || ''}`.trim(),
                    metadata: metadata,
                },
                create: {
                    id,
                    name,
                    price,
                    colors,
                    sizes,
                    imageUrls,
                    description: product.description || `${product.category || ''} ${product.brand_name || ''} ${product.material_composition || ''}`.trim(),
                    metadata: metadata,
                }
            });
            await this.syncToPinecone(updatedProduct);
        }
        catch (error) {
            this.logger.error(`❌ Failed to sync product: ${error.message}`);
        }
    }
    async searchProducts(query, limit = 3) {
        const cacheKey = `search:${query.toLowerCase().trim()}`;
        try {
            const cached = await this.redis.get(cacheKey);
            if (cached) {
                this.logger.debug(`🚀 Serving search for "${query}" from cache.`);
                return JSON.parse(cached);
            }
        }
        catch (e) {
            this.logger.warn(`Redis cache fetch failed: ${e.message}`);
        }
        const cleanQuery = query.toLowerCase().replace(/[^\w\s]/g, ' ');
        const words = cleanQuery.split(/\s+/).filter(w => w.length > 1);
        let results = [];
        if (words.length > 0) {
            results = await this.prisma.product.findMany({
                where: {
                    OR: [
                        { name: { contains: query, mode: 'insensitive' } },
                        { description: { contains: query, mode: 'insensitive' } },
                        ...words.map(word => ({ name: { contains: word, mode: 'insensitive' } })),
                        ...words.map(word => ({ description: { contains: word, mode: 'insensitive' } }))
                    ]
                },
                take: limit
            });
        }
        if (results.length === 0) {
            if (query.length < 3 || this.isGibberish(query)) {
                this.logger.debug(`🛡️ Skipping semantic fallback for noise/spam: "${query}"`);
                return [];
            }
            this.logger.log(`🔍 No keyword matches for "${query}". Triggering semantic fallback...`);
            try {
                const embedding = await this.gemini.generateEmbedding(query);
                const vectorMatches = await this.pinecone.query(embedding, limit);
                results = vectorMatches.map(m => {
                    const { name, price, imageUrls, colors, sizes, description, ...rest } = m.metadata;
                    return {
                        id: m.id,
                        name,
                        price,
                        imageUrls,
                        colors,
                        sizes,
                        description,
                        metadata: rest,
                        isSemanticMatch: true
                    };
                });
            }
            catch (vError) {
                this.logger.error(`Semantic fallback failed: ${vError.message}`);
            }
        }
        if (results.length > 0) {
            try {
                await this.redis.set(cacheKey, JSON.stringify(results), 600);
            }
            catch (e) {
                this.logger.warn(`Failed to save cache for "${query}"`);
            }
        }
        return results;
    }
    isGibberish(text) {
        if (/(.)\1{4,}/.test(text))
            return true;
        if (/[bcdfghjklmnpqrstvwxyz]{6,}/i.test(text))
            return true;
        const alphanumeric = text.replace(/[^a-zA-Z0-9]/g, '');
        if (alphanumeric.length === 0)
            return true;
        const digitCount = (text.match(/\d/g) || []).length;
        if (digitCount / text.length > 0.5)
            return true;
        const words = text.split(/\s+/);
        for (const word of words) {
            if (word.length > 5) {
                const vowels = (word.match(/[aeiou]/gi) || []).length;
                if (vowels === 0)
                    return true;
            }
        }
        return false;
    }
    async getFeaturedProducts(limit = 3) {
        return this.prisma.product.findMany({
            take: limit,
            orderBy: { id: 'desc' }
        });
    }
    async findAll(params) {
        const { skip, take, search } = params;
        return this.prisma.product.findMany({
            skip,
            take,
            where: search ? {
                OR: [
                    { name: { contains: search, mode: 'insensitive' } },
                    { description: { contains: search, mode: 'insensitive' } }
                ]
            } : {},
            orderBy: { updatedAt: 'desc' }
        });
    }
    async findOne(id) {
        return this.prisma.product.findUnique({ where: { id } });
    }
    async create(data) {
        const product = await this.prisma.product.create({ data });
        await this.syncToPinecone(product);
        return product;
    }
    async update(id, data) {
        const product = await this.prisma.product.update({ where: { id }, data });
        await this.syncToPinecone(product);
        return product;
    }
    async delete(id) {
        const deleted = await this.prisma.product.delete({ where: { id } });
        await this.pinecone.deleteOne(id);
        return deleted;
    }
    async syncToPinecone(product) {
        try {
            this.logger.log(`🔗 Syncing product ${product.id} to Pinecone...`);
            const textToEmbed = `${product.name} ${product.description} ${product.colors.join(' ')} ${product.sizes.join(' ')}`;
            const embedding = await this.gemini.generateEmbedding(textToEmbed);
            if (!embedding || embedding.length === 0) {
                this.logger.warn(`⚠️ Empty embedding for product ${product.id}. Skipping Pinecone sync.`);
                return;
            }
            await this.pinecone.upsert([{
                    id: product.id,
                    values: embedding,
                    metadata: {
                        name: product.name,
                        price: product.price,
                        imageUrls: product.imageUrls,
                        colors: product.colors,
                        sizes: product.sizes,
                        description: product.description,
                        ...(product.metadata || {})
                    }
                }]);
        }
        catch (error) {
            this.logger.error(`❌ Failed to sync to Pinecone: ${error.message}`);
        }
    }
};
exports.ProductService = ProductService;
exports.ProductService = ProductService = ProductService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        gemini_service_1.GeminiService,
        pinecone_service_1.PineconeService,
        redis_service_1.RedisService])
], ProductService);
//# sourceMappingURL=product.service.js.map