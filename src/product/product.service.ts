import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { GeminiService } from '../ai/gemini.service';
import { PineconeService } from '../ai/pinecone.service';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class ProductService {
    private readonly logger = new Logger(ProductService.name);

    constructor(
        private prisma: PrismaService,
        private gemini: GeminiService,
        private pinecone: PineconeService,
        private redis: RedisService,
    ) {}

    /**
     * Bulk upsert products pushed from Google Sheets (Optimized with parallel batching)
     */
    async upsertProducts(products: any[]) {
        this.logger.log(`🔄 Syncing ${products.length} products from Google Sheets...`);
        
        // Process in chunks of 5 to avoid Gemini/Pinecone rate limits
        const chunkSize = 5;
        for (let i = 0; i < products.length; i += chunkSize) {
            const chunk = products.slice(i, i + chunkSize);
            await Promise.all(chunk.map(product => this.syncSingleProduct(product)));
        }
        
        this.logger.log('✅ Product sync completed.');
    }

    private async syncSingleProduct(product: any) {
        try {
            const id = String(product.product_id || product.id);
            const name = product.product_name || product.name || 'Unknown Product';
            const price = parseFloat(product.price_retail) || parseFloat(product.price) || null;
            
            const colors = product.color_name ? [String(product.color_name)] : 
                          (Array.isArray(product.colors) ? product.colors : []);
            const sizes = product.size ? [String(product.size)] : 
                         (Array.isArray(product.sizes) ? product.sizes : []);

            let allImages: string[] = [];
            if (product.thumbnail_url) allImages.push(product.thumbnail_url);
            const gallery = product.image_gallery_urls;
            if (typeof gallery === 'string' && gallery.trim()) {
                allImages.push(...gallery.split(',').map((s: string) => s.trim()));
            } else if (Array.isArray(gallery)) {
                allImages.push(...gallery);
            }
            const imageUrls = [...new Set(allImages)].filter(url => url.startsWith('http'));

            const metadata = { ...(product.metadata || {}), ...product };
            delete (metadata as any).image_gallery_urls;

            const updatedProduct = await this.prisma.product.upsert({
                where: { id },
                update: {
                    name,
                    price,
                    colors,
                    sizes,
                    imageUrls,
                    description: product.description || `${product.category || ''} ${product.brand_name || ''} ${product.material_composition || ''}`.trim(),
                    metadata: metadata as any,
                },
                create: {
                    id,
                    name,
                    price,
                    colors,
                    sizes,
                    imageUrls,
                    description: product.description || `${product.category || ''} ${product.brand_name || ''} ${product.material_composition || ''}`.trim(),
                    metadata: metadata as any,
                }
            });

            await this.syncToPinecone(updatedProduct);
        } catch (error) {
            this.logger.error(`❌ Failed to sync product: ${error.message}`);
        }
    }

    async searchProducts(query: string, limit = 3) {
        // 1. Check Redis Cache First
        const cacheKey = `search:${query.toLowerCase().trim()}`;
        try {
            const cached = await this.redis.get(cacheKey);
            if (cached) {
                this.logger.debug(`🚀 Serving search for "${query}" from cache.`);
                return JSON.parse(cached);
            }
        } catch (e) {
            this.logger.warn(`Redis cache fetch failed: ${e.message}`);
        }

        const cleanQuery = query.toLowerCase().replace(/[^\w\s]/g, ' ');
        const words = cleanQuery.split(/\s+/).filter(w => w.length > 1);
        
        let results: any[] = [];
        if (words.length > 0) {
            results = await this.prisma.product.findMany({
                where: {
                    OR: [
                        { name: { contains: query, mode: 'insensitive' as Prisma.QueryMode } },
                        { description: { contains: query, mode: 'insensitive' as Prisma.QueryMode } },
                        ...words.map(word => ({ name: { contains: word, mode: 'insensitive' as Prisma.QueryMode } })),
                        ...words.map(word => ({ description: { contains: word, mode: 'insensitive' as Prisma.QueryMode } }))
                    ]
                },
                take: limit
            });
        }

        // SEMANTIC FALLBACK: If no keyword matches, check for intent before triggering Pinecone
        if (results.length === 0) {
            // Anti-Spam Guard: Check if the query is too short or looks like gibberish
            if (query.length < 3 || this.isGibberish(query)) {
                this.logger.debug(`🛡️ Skipping semantic fallback for noise/spam: "${query}"`);
                return [];
            }

            this.logger.log(`🔍 No keyword matches for "${query}". Triggering semantic fallback...`);
            try {
                const embedding = await this.gemini.generateEmbedding(query);
                const vectorMatches = await this.pinecone.query(embedding, limit);
                
                results = vectorMatches.map(m => {
                    const { name, price, imageUrls, colors, sizes, description, ...rest } = m.metadata as any;
                    return {
                        id: m.id,
                        name,
                        price,
                        imageUrls,
                        colors,
                        sizes,
                        description,
                        metadata: rest, // Re-nest Stock/Brand/Material into metadata for AI consistency
                        isSemanticMatch: true
                    };
                });
            } catch (vError) {
                this.logger.error(`Semantic fallback failed: ${vError.message}`);
            }
        }

        // 2. Save to Cache for 10 minutes if results found
        if (results.length > 0) {
            try {
                await this.redis.set(cacheKey, JSON.stringify(results), 600);
            } catch (e) {
                this.logger.warn(`Failed to save cache for "${query}"`);
            }
        }

        return results;
    }

    /**
     * Detects if a string is likely gibberish (high entropy/noise)
     */
    private isGibberish(text: string): boolean {
        // 1. Check for long strings of consonants or random character repeats
        if (/(.)\1{4,}/.test(text)) return true; // e.g., "aaaaaaaaa"
        if (/[bcdfghjklmnpqrstvwxyz]{6,}/i.test(text)) return true; // e.g., "ghjklmn"
        
        // 2. High digit/symbol ratio
        const alphanumeric = text.replace(/[^a-zA-Z0-9]/g, '');
        if (alphanumeric.length === 0) return true;
        const digitCount = (text.match(/\d/g) || []).length;
        if (digitCount / text.length > 0.5) return true;

        // 3. Very low vowel-to-consonant ratio for longer words
        const words = text.split(/\s+/);
        for (const word of words) {
            if (word.length > 5) {
                const vowels = (word.match(/[aeiou]/gi) || []).length;
                if (vowels === 0) return true;
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

    async findAll(params: { skip?: number; take?: number; search?: string }) {
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

    async findOne(id: string) {
        return this.prisma.product.findUnique({ where: { id } });
    }

    async create(data: any) {
        const product = await this.prisma.product.create({ data });
        await this.syncToPinecone(product);
        return product;
    }

    async update(id: string, data: any) {
        const product = await this.prisma.product.update({ where: { id }, data });
        await this.syncToPinecone(product);
        return product;
    }

    async delete(id: string) {
        const deleted = await this.prisma.product.delete({ where: { id } });
        await this.pinecone.deleteOne(id);
        return deleted;
    }

    private async syncToPinecone(product: any) {
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
                    ...(product.metadata as any || {}) // Include all additional metadata (stock, brand, etc.)
                }
            }]);
        } catch (error) {
            this.logger.error(`❌ Failed to sync to Pinecone: ${error.message}`);
        }
    }
}
