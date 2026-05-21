import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { IsString } from 'class-validator';
import { JwtGuard } from '../common/guards/jwt.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../common/guards/jwt.guard';
import { InspireService } from './inspire.service';

class OembedDto {
  @IsString() url!: string;
}

class PoolDto {
  @IsString() noteFp!: string;
}

@Controller('inspire')
@UseGuards(JwtGuard)
export class InspireController {
  constructor(private readonly svc: InspireService) {}

  @Get('search')
  async search(
    @Query('q') q: string,
    @Query('vertical') vertical?: string,
    @Query('limit') limit?: string,
  ) {
    return this.svc.search(q, vertical, limit !== undefined ? Number(limit) : undefined);
  }

  @Get('note/:fp')
  get(@Param('fp') fp: string) {
    return this.svc.getByFingerprint(fp);
  }

  @Post('oembed')
  oembed(@CurrentUser() u: JwtPayload, @Body() dto: OembedDto) {
    return this.svc.resolveByUrl(BigInt(u.teamId), dto.url);
  }

  @Post('pool')
  pool(@CurrentUser() u: JwtPayload, @Body() dto: PoolDto) {
    return this.svc.addToPool(BigInt(u.teamId), BigInt(u.sub), dto.noteFp);
  }
}
