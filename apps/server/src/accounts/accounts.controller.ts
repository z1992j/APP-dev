import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import { JwtGuard } from '../common/guards/jwt.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../common/guards/jwt.guard';
import { AccountsService } from './accounts.service';

class UpsertAccountDto {
  @IsString() @MaxLength(40) nickname!: string;
  @IsOptional() @IsString() xhsUrl?: string;
  @IsOptional() @IsString() vertical?: string;
  @IsOptional() @IsObject() persona?: Record<string, unknown>;
}

@Controller('accounts')
@UseGuards(JwtGuard)
export class AccountsController {
  constructor(private readonly svc: AccountsService) {}

  @Get()
  list(@CurrentUser() u: JwtPayload) {
    return this.svc.list(BigInt(u.teamId));
  }

  @Post()
  create(@CurrentUser() u: JwtPayload, @Body() dto: UpsertAccountDto) {
    return this.svc.create(BigInt(u.teamId), dto);
  }

  @Put(':id')
  update(
    @CurrentUser() u: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpsertAccountDto,
  ) {
    return this.svc.update(BigInt(u.teamId), BigInt(id), { ...dto });
  }

  @Delete(':id')
  remove(@CurrentUser() u: JwtPayload, @Param('id') id: string) {
    return this.svc.remove(BigInt(u.teamId), BigInt(id));
  }
}
