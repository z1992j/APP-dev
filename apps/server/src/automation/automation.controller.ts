import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { IsOptional, IsString } from 'class-validator';
import { JwtGuard } from '../common/guards/jwt.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../common/guards/jwt.guard';
import { AutomationService } from './automation.service';

class CommentDto {
  @IsString() feedId!: string;
  @IsOptional() @IsString() xsecToken?: string;
  @IsString() content!: string;
}

@Controller('automation')
@UseGuards(JwtGuard)
export class AutomationController {
  constructor(private readonly svc: AutomationService) {}

  @Get('sessions/batch-status')
  batchStatus(@CurrentUser() u: JwtPayload) {
    return this.svc.batchStatus(BigInt(u.teamId));
  }

  @Get('workers/health')
  workerHealth(@CurrentUser() u: JwtPayload) {
    return this.svc.workerHealth(BigInt(u.teamId));
  }

  @Get('sessions/:accountId/status')
  status(@CurrentUser() u: JwtPayload, @Param('accountId') id: string) {
    return this.svc.status(BigInt(u.teamId), BigInt(id));
  }

  @Post('sessions/:accountId/bind')
  bind(@CurrentUser() u: JwtPayload, @Param('accountId') id: string) {
    return this.svc.requestQrcode(BigInt(u.teamId), BigInt(id));
  }

  @Get('sessions/:accountId/poll')
  poll(@CurrentUser() u: JwtPayload, @Param('accountId') id: string) {
    return this.svc.pollLogin(BigInt(u.teamId), BigInt(id));
  }

  @Delete('sessions/:accountId')
  unbind(@CurrentUser() u: JwtPayload, @Param('accountId') id: string) {
    return this.svc.stop(BigInt(u.teamId), BigInt(id));
  }

  @Post('drafts/:draftId/publish')
  publish(@CurrentUser() u: JwtPayload, @Param('draftId') id: string) {
    return this.svc.publishDraft(BigInt(u.teamId), BigInt(id), BigInt(u.sub));
  }

  @Post('sessions/:accountId/comment')
  comment(
    @CurrentUser() u: JwtPayload,
    @Param('accountId') id: string,
    @Body() dto: CommentDto,
  ) {
    return this.svc.postComment(BigInt(u.teamId), BigInt(id), dto.feedId, dto.xsecToken, dto.content);
  }
}
