import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CustomerService {
    private readonly logger = new Logger(CustomerService.name);

    constructor(private prisma: PrismaService) {}

    async findAll() {
        return this.prisma.customer.findMany({
            include: {
                conversations: {
                    select: {
                        id: true,
                        platform: true,
                        updatedAt: true,
                        _count: {
                            select: { messages: true }
                        }
                    }
                }
            },
            orderBy: { updatedAt: 'desc' }
        });
    }

    async findOne(id: string) {
        return this.prisma.customer.findUnique({
            where: { id },
            include: {
                conversations: {
                    include: {
                        messages: {
                            orderBy: { createdAt: 'desc' },
                            take: 50
                        }
                    }
                }
            }
        });
    }

    async update(id: string, data: any) {
        return this.prisma.customer.update({
            where: { id },
            data
        });
    }
}
