import { Controller, Get, Param, Patch, Body, UseGuards } from '@nestjs/common';
import { CustomerService } from './customer.service';
import { ApiKeyGuard } from '../ai/api-key.guard';

@Controller('customers')
@UseGuards(ApiKeyGuard)
export class CustomerController {
    constructor(private readonly customerService: CustomerService) {}

    @Get()
    findAll() {
        return this.customerService.findAll();
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.customerService.findOne(id);
    }

    @Patch(':id')
    update(@Param('id') id: string, @Body() data: any) {
        return this.customerService.update(id, data);
    }
}
