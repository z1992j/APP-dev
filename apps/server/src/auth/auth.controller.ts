import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { IsString } from 'class-validator';
import { AuthService } from './auth.service';
import { JwtGuard } from '../common/guards/jwt.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../common/guards/jwt.guard';

class WxLoginDto {
  @IsString() code!: string;
}

class SwitchTeamDto {
  @IsString() teamId!: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('wx-login')
  async wxLogin(@Body() dto: WxLoginDto) {
    return this.auth.wxLogin(dto.code);
  }

  @UseGuards(JwtGuard)
  @Get('teams')
  myTeams(@CurrentUser() u: JwtPayload) {
    return this.auth.myTeams(BigInt(u.sub));
  }

  @UseGuards(JwtGuard)
  @Post('switch-team')
  switchTeam(@CurrentUser() u: JwtPayload, @Body() dto: SwitchTeamDto) {
    return this.auth.switchTeam(BigInt(u.sub), BigInt(dto.teamId));
  }
}
