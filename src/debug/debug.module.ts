import { Module } from '@nestjs/common';
import { DebugController } from './debug.controller';
import { FaqModule } from '../faq/faq.module';

@Module({
  imports: [FaqModule],
  controllers: [DebugController],
})
export class DebugModule {}
