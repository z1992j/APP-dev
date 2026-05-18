import { Module } from '@nestjs/common';
import { InspireController } from './inspire.controller';
import { InspireService } from './inspire.service';
import { AuthModule } from '../auth/auth.module';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [AuthModule, AiModule],
  controllers: [InspireController],
  providers: [InspireService],
})
export class InspireModule {}
