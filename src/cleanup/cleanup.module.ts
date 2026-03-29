import { Module } from '@nestjs/common';
import { DatabaseCleanupService } from './database-cleanup.service';
import { CleanupController } from './cleanup.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [CleanupController],
  providers: [DatabaseCleanupService],
  exports: [DatabaseCleanupService],
})
export class CleanupModule {}
