import { Module } from '@nestjs/common';
import { LintController } from './lint.controller';
import { LintService } from './lint.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [LintController],
  providers: [LintService],
  exports: [LintService],
})
export class LintModule {}
