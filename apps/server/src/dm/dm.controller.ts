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
import { DmService } from './dm.service';

class SendDto {
  @IsString() content!: string;
}

@Controller('dm')
@UseGuards(JwtGuard)
export class DmController {
  constructor(private readonly svc: DmService) {}

  @Get('conversations')
  list(
    @CurrentUser() u: JwtPayload,
    @Query('accountId') accountId?: string,
    @Query('status') status?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.svc.listConversations(BigInt(u.teamId), { accountId, status, cursor });
  }

  @Get('conversations/:id/messages')
  messages(
    @CurrentUser() u: JwtPayload,
    @Param('id') id: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.svc.getMessages(BigInt(u.teamId), BigInt(id), cursor);
  }

  @Post('conversations/:id/send')
  send(
    @CurrentUser() u: JwtPayload,
    @Param('id') id: string,
    @Body() dto: SendDto,
  ) {
    return this.svc.sendMessage(BigInt(u.teamId), BigInt(id), dto.content);
  }

  @Post('conversations/:id/ai-suggest')
  aiSuggest(@CurrentUser() u: JwtPayload, @Param('id') id: string) {
    return this.svc.generateAiReply(BigInt(u.teamId), BigInt(id));
  }

  @Post('conversations/:id/archive')
  archive(@CurrentUser() u: JwtPayload, @Param('id') id: string) {
    return this.svc.archiveConversation(BigInt(u.teamId), BigInt(id));
  }

  @Get('stats')
  stats(@CurrentUser() u: JwtPayload) {
    return this.svc.unreadStats(BigInt(u.teamId));
  }
}
