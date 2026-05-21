import { Module } from '@nestjs/common';
import { LintController } from './lint.controller';
import { LintService } from './lint.service';
import { AuthModule } from '../auth/auth.module';
import { LINT_EXTENSION, NoopLintExtension } from './lint-extension';

@Module({
  imports: [AuthModule],
  controllers: [LintController],
  providers: [
    LintService,
    // Bind LINT_EXTENSION to a real impl in production-only overrides.
    { provide: LINT_EXTENSION, useClass: NoopLintExtension },
  ],
  exports: [LintService],
})
export class LintModule {}
