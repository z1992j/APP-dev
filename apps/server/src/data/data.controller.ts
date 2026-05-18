import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { IsISO8601, IsObject, IsString } from 'class-validator';
import { JwtGuard } from '../common/guards/jwt.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../common/guards/jwt.guard';
import { DataService } from './data.service';

class ReportDto {
  @IsString() accountId!: string;
  @IsISO8601() bucketDate!: string;
  @IsObject() metrics!: Record<string, number>;
}

@Controller('data')
@UseGuards(JwtGuard)
export class DataController {
  constructor(private readonly svc: DataService) {}

  @Post('report')
  report(@CurrentUser() u: JwtPayload, @Body() dto: ReportDto) {
    return this.svc.report(BigInt(u.teamId), {
      accountId: BigInt(dto.accountId),
      bucketDate: new Date(dto.bucketDate),
      metrics: dto.metrics,
    });
  }

  @Get('account/:id')
  account(
    @CurrentUser() u: JwtPayload,
    @Param('id') id: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.svc.account(BigInt(u.teamId), BigInt(id), from, to);
  }

  @Get('team')
  team(
    @CurrentUser() u: JwtPayload,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.svc.team(BigInt(u.teamId), from, to);
  }
}
