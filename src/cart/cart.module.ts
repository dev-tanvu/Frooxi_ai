import { Module } from '@nestjs/common';
import { CartService } from './cart.service';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';

@Module({
    imports: [PrismaModule, RedisModule],
    providers: [CartService],
    exports: [CartService],
})
export class CartModule { }
