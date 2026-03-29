import { Controller, Get, Post, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { OrderService } from './order.service';
import { ApiKeyGuard } from '../ai/api-key.guard';

@Controller('orders')
export class OrderController {
    constructor(private readonly orderService: OrderService) {}

    @UseGuards(ApiKeyGuard)
    @Get()
    async getOrders() {
        return this.orderService.findAll();
    }

    @UseGuards(ApiKeyGuard)
    @Get(':id')
    async getOrder(@Param('id') id: string) {
        return this.orderService.findOne(id);
    }

    @UseGuards(ApiKeyGuard)
    @Patch(':id/status')
    async updateStatus(@Param('id') id: string, @Body('status') status: string) {
        return this.orderService.updateStatus(id, status as any);
    }
}
