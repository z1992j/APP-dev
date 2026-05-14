import { Body, Controller, Post } from '@nestjs/common';
import { IsString } from 'class-validator';
import { AuthService } from './auth.service';

class WxLoginDto {
  @IsString() code!: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('wx-login')
  async wxLogin(@Body() dto: WxLoginDto) {
    return this.auth.wxLogin(dto.code);
  }
}
