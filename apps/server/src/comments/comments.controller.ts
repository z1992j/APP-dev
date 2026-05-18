import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { IsOptional, IsString } from 'class-validator';
import { JwtGuard } from '../common/guards/jwt.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../common/guards/jwt.guard';
import { CommentsService } from './comments.service';

class ReplyDto {
  @IsString() text!: string;
}

class SweepDto {
  @IsOptional() @IsString() accountId?: string;
}

@Controller('comments')
@UseGuards(JwtGuard)
export class CommentsController {
  constructor(private readonly svc: CommentsService) {}

  @Get()
  list(
    @CurrentUser() u: JwtPayload,
    @Query('status') status?: string,
    @Query('accountId') accountId?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.svc.list(BigInt(u.teamId), { status, accountId, cursor });
  }

  @Get('stats')
  stats(@CurrentUser() u: JwtPayload) {
    return this.svc.stats(BigInt(u.teamId));
  }

  @Post('sweep')
  sweep(@CurrentUser() u: JwtPayload, @Body() dto: SweepDto) {
    return this.svc.triggerSweep(
      BigInt(u.teamId),
      dto.accountId ? BigInt(dto.accountId) : undefined,
    );
  }

  @Post(':id/reply')
  reply(
    @CurrentUser() u: JwtPayload,
    @Param('id') id: string,
    @Body() dto: ReplyDto,
  ) {
    return this.svc.replyManual(BigInt(u.teamId), BigInt(id), dto.text);
  }

  @Post(':id/ignore')
  ignore(@CurrentUser() u: JwtPayload, @Param('id') id: string) {
    return this.svc.markIgnored(BigInt(u.teamId), BigInt(id));
  }

  @Post(':id/auto-reply')
  autoReply(@CurrentUser() u: JwtPayload, @Param('id') id: string) {
    return this.svc.autoReply(BigInt(u.teamId), BigInt(id));
  }
}
