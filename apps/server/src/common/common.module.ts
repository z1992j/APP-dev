import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AiUsageRecorder } from './ai-usage.recorder';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [AiUsageRecorder],
  exports: [AiUsageRecorder],
})
export class CommonModule {}
