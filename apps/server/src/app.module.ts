import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma.module';
import { AuthModule } from './auth/auth.module';
import { AccountsModule } from './accounts/accounts.module';
import { DraftsModule } from './drafts/drafts.module';
import { AiModule } from './ai/ai.module';
import { LintModule } from './lint/lint.module';
import { InspireModule } from './inspire/inspire.module';
import { MediaModule } from './media/media.module';
import { DataModule } from './data/data.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    AccountsModule,
    DraftsModule,
    AiModule,
    LintModule,
    InspireModule,
    MediaModule,
    DataModule,
  ],
})
export class AppModule {}
