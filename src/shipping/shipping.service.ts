import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ShippingService implements OnModuleInit {
    private readonly logger = new Logger(ShippingService.name);

    constructor(private prisma: PrismaService) {}

    async onModuleInit() {
        await this.seedDefaultZones();
    }

    private async seedDefaultZones() {
        const count = await this.prisma.shippingZone.count();
        if (count === 0) {
            this.logger.log('Seeding default shipping zones...');
            await this.prisma.shippingZone.createMany({
                data: [
                    { name: 'Inside Dhaka', price: 70, division: 'Dhaka' },
                    { name: 'Outside Dhaka', price: 130 },
                ],
            });
            this.logger.log('Default shipping zones seeded.');
        }
    }

    async findAll() {
        return this.prisma.shippingZone.findMany({
            where: { active: true },
        });
    }

    async findByName(name: string) {
        return this.prisma.shippingZone.findFirst({
            where: { 
                name: { contains: name, mode: 'insensitive' },
                active: true 
            },
        });
    }

    async calculateDeliveryFee(location: string): Promise<number> {
        // Simple logic: if 'dhaka' is in the location string, use Inside Dhaka price.
        // Otherwise, use Outside Dhaka price.
        if (location.toLowerCase().includes('dhaka')) {
            const zone = await this.prisma.shippingZone.findFirst({ where: { name: 'Inside Dhaka' } });
            return zone?.price || 70;
        }
        const zone = await this.prisma.shippingZone.findFirst({ where: { name: 'Outside Dhaka' } });
        return zone?.price || 130;
    }

    async updateZone(id: string, data: any) {
        return this.prisma.shippingZone.update({
            where: { id },
            data,
        });
    }

    async createZone(data: any) {
        return this.prisma.shippingZone.create({ data });
    }

    async deleteZone(id: string) {
        return this.prisma.shippingZone.delete({ where: { id } });
    }
}
