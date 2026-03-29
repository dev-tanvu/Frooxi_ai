import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ShippingService } from './shipping.service';
import { ApiKeyGuard } from '../ai/api-key.guard';

@Controller('shipping')
export class ShippingController {
    constructor(private readonly shippingService: ShippingService) {}

    @Get('zones')
    async getZones() {
        return this.shippingService.findAll();
    }

    @UseGuards(ApiKeyGuard)
    @Post('zones')
    async createZone(@Body() data: any) {
        return this.shippingService.createZone(data);
    }

    @UseGuards(ApiKeyGuard)
    @Patch('zones/:id')
    async updateZone(@Param('id') id: string, @Body() data: any) {
        return this.shippingService.updateZone(id, data);
    }

    @UseGuards(ApiKeyGuard)
    @Delete('zones/:id')
    async deleteZone(@Param('id') id: string) {
        return this.shippingService.deleteZone(id);
    }
}
