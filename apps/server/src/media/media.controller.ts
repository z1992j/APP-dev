import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { IsIn, IsInt, IsString } from 'class-validator';
import { JwtGuard } from '../common/guards/jwt.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../common/guards/jwt.guard';
import { MediaService } from './media.service';

class SignDto {
  @IsIn(['image', 'video']) kind!: 'image' | 'video';
  @IsString() ext!: string;
  @IsInt() size!: number;
}

@Controller('media')
@UseGuards(JwtGuard)
export class MediaController {
  constructor(private readonly svc: MediaService) {}

  @Post('sign')
  sign(@CurrentUser() u: JwtPayload, @Body() dto: SignDto) {
    return this.svc.sign(BigInt(u.teamId), dto);
  }
}
