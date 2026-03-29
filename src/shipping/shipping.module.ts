import { Module } from '@nestjs/common';
import { ShippingService } from './shipping.service';
import { ShippingController } from './shipping.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
    imports: [PrismaModule],
    providers: [ShippingService],
    controllers: [ShippingController],
    exports: [ShippingService],
})
export class ShippingModule {}
