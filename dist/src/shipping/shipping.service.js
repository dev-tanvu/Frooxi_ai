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
var ShippingService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ShippingService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
let ShippingService = ShippingService_1 = class ShippingService {
    prisma;
    logger = new common_1.Logger(ShippingService_1.name);
    constructor(prisma) {
        this.prisma = prisma;
    }
    async onModuleInit() {
        await this.seedDefaultZones();
    }
    async seedDefaultZones() {
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
    async findByName(name) {
        return this.prisma.shippingZone.findFirst({
            where: {
                name: { contains: name, mode: 'insensitive' },
                active: true
            },
        });
    }
    async calculateDeliveryFee(location) {
        if (location.toLowerCase().includes('dhaka')) {
            const zone = await this.prisma.shippingZone.findFirst({ where: { name: 'Inside Dhaka' } });
            return zone?.price || 70;
        }
        const zone = await this.prisma.shippingZone.findFirst({ where: { name: 'Outside Dhaka' } });
        return zone?.price || 130;
    }
    async updateZone(id, data) {
        return this.prisma.shippingZone.update({
            where: { id },
            data,
        });
    }
    async createZone(data) {
        return this.prisma.shippingZone.create({ data });
    }
    async deleteZone(id) {
        return this.prisma.shippingZone.delete({ where: { id } });
    }
};
exports.ShippingService = ShippingService;
exports.ShippingService = ShippingService = ShippingService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], ShippingService);
//# sourceMappingURL=shipping.service.js.map