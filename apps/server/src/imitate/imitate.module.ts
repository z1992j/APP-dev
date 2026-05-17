import { Module } from '@nestjs/common';
import { ImitateController } from './imitate.controller';
import { ImitateService } from './imitate.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [ImitateController],
  providers: [ImitateService],
})
export class ImitateModule {}
