import { Module } from '@nestjs/common';
import { AutomationController } from './automation.controller';
import { AutomationService } from './automation.service';
import { WorkerPool } from './worker-pool';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [AutomationController],
  providers: [AutomationService, WorkerPool],
  exports: [AutomationService],
})
export class AutomationModule {}
