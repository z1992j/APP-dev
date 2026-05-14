import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  IsArray,
  IsIn,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { JwtGuard } from '../common/guards/jwt.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../common/guards/jwt.guard';
import { DraftsService } from './drafts.service';

class UpsertDraftDto {
  @IsOptional() @IsString() accountId?: string;
  @IsIn(['image', 'video']) kind!: 'image' | 'video';
  @IsOptional() @IsString() @MaxLength(40) title?: string;
  @IsOptional() @IsString() body?: string;
  @IsOptional() @IsArray() media?: unknown[];
  @IsOptional() @IsArray() hashtags?: string[];
}

class ScheduleDto {
  @IsISO8601() scheduleAt!: string;
}

class PublishedDto {
  @IsString() publishedUrl!: string;
}

class ReviewDto {
  @IsIn(['approve', 'reject', 'comment']) decision!: string;
  @IsOptional() @IsString() comment?: string;
}

@Controller('drafts')
@UseGuards(JwtGuard)
export class DraftsController {
  constructor(private readonly svc: DraftsService) {}

  @Get()
  list(
    @CurrentUser() u: JwtPayload,
    @Query('status') status?: string,
    @Query('accountId') accountId?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.svc.list(BigInt(u.teamId), { status, accountId, cursor });
  }

  @Get(':id')
  get(@CurrentUser() u: JwtPayload, @Param('id') id: string) {
    return this.svc.get(BigInt(u.teamId), BigInt(id));
  }

  @Post()
  create(
    @CurrentUser() u: JwtPayload,
    @Body() dto: UpsertDraftDto,
  ) {
    return this.svc.create(BigInt(u.teamId), BigInt(u.sub), dto);
  }

  @Put(':id')
  update(
    @CurrentUser() u: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpsertDraftDto,
  ) {
    return this.svc.update(BigInt(u.teamId), BigInt(id), dto);
  }

  @Post(':id/schedule')
  schedule(
    @CurrentUser() u: JwtPayload,
    @Param('id') id: string,
    @Body() dto: ScheduleDto,
  ) {
    return this.svc.schedule(BigInt(u.teamId), BigInt(id), new Date(dto.scheduleAt));
  }

  @Post(':id/handoff')
  handoff(@CurrentUser() u: JwtPayload, @Param('id') id: string) {
    return this.svc.handoff(BigInt(u.teamId), BigInt(id));
  }

  @Post(':id/published')
  published(
    @CurrentUser() u: JwtPayload,
    @Param('id') id: string,
    @Body() dto: PublishedDto,
  ) {
    return this.svc.published(BigInt(u.teamId), BigInt(id), dto.publishedUrl);
  }

  @Post(':id/review')
  review(
    @CurrentUser() u: JwtPayload,
    @Param('id') id: string,
    @Body() dto: ReviewDto,
  ) {
    return this.svc.review(BigInt(u.teamId), BigInt(u.sub), BigInt(id), dto);
  }
}
