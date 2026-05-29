import { Body, Controller, Get, Post, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
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

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('wx-login')
  async wxLogin(@Body() dto: WxLoginDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.wxLogin(dto.code);
    res.cookie('redmatrix_token', result.token, COOKIE_OPTS);
    return result;
  }

  @UseGuards(JwtGuard)
  @Get('teams')
  myTeams(@CurrentUser() u: JwtPayload) {
    return this.auth.myTeams(BigInt(u.sub));
  }

  @UseGuards(JwtGuard)
  @Post('switch-team')
  switchTeam(
    @CurrentUser() u: JwtPayload,
    @Body() dto: SwitchTeamDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = this.auth.switchTeam(BigInt(u.sub), BigInt(dto.teamId));
    result.then((r) => res.cookie('redmatrix_token', r.token, COOKIE_OPTS));
    return result;
  }
}
