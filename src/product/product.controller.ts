import { Controller, Post, Body, Headers, UnauthorizedException, Logger, Get, Param, Patch, Delete, UseGuards } from '@nestjs/common';
import { ProductService } from './product.service';
import { ApiKeyGuard } from '../ai/api-key.guard';

@Controller('products')
@UseGuards(ApiKeyGuard)
export class ProductController {
    private readonly logger = new Logger(ProductController.name);
    private readonly SYNC_SECRET = 'frooxi_sync_secret_2026'; // Simple secret for Apps Script

    constructor(private readonly productService: ProductService) {}

    @Post('sync')
    async syncProducts(
        @Body() body: { products: any[] },
        @Headers('x-sync-secret') secret: string
    ) {
        if (secret !== this.SYNC_SECRET) {
            this.logger.warn('🚫 Unauthorized sync attempt detected.');
            throw new UnauthorizedException('Invalid sync secret');
        }

        await this.productService.upsertProducts(body.products);
        return { message: 'Sync successful', count: body.products.length };
    }

    @Get()
    async findAll() {
        return this.productService.findAll({ take: 50 }); // TODO: add pagination params
    }

    @Get(':id')
    async findOne(@Param('id') id: string) {
        return this.productService.findOne(id);
    }

    @Post()
    async create(@Body() data: any) {
        return this.productService.create(data);
    }

    @Patch(':id')
    async update(@Param('id') id: string, @Body() data: any) {
        return this.productService.update(id, data);
    }

    @Delete(':id')
    async remove(@Param('id') id: string) {
        return this.productService.delete(id);
    }
}
