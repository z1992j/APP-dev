import {
  Body,
  Controller,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  ArrayMinSize,
} from 'class-validator';
import { JwtGuard } from '../common/guards/jwt.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../common/guards/jwt.guard';
import { AiService } from './ai.service';

class WriteDto {
  @IsString() topic!: string;
  @IsArray() @ArrayMinSize(1) accountIds!: string[];
  @IsIn(['种草', '干货', '吐槽', '故事']) style!: string;
  @IsInt() words!: number;
  @IsOptional() @IsString() refNoteFp?: string;
}

class RewriteDto {
  @IsString() text!: string;
  @IsString() instruction!: string;
  @IsOptional() @IsString() accountId?: string;
}

@Controller('ai')
@UseGuards(JwtGuard)
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Post('write')
  async write(
    @CurrentUser() u: JwtPayload,
    @Body() dto: WriteDto,
    @Res() res: Response,
  ) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const accountIds = dto.accountIds.map((s) => BigInt(s));
    try {
      for await (const evt of this.ai.write({
        teamId: BigInt(u.teamId),
        userId: BigInt(u.sub),
        topic: dto.topic,
        accountIds,
        style: dto.style,
        words: dto.words,
        refNoteFp: dto.refNoteFp,
      })) {
        res.write(`data: ${JSON.stringify(evt)}\n\n`);
      }
      res.write('data: [DONE]\n\n');
    } catch (e) {
      res.write(
        `data: ${JSON.stringify({ error: (e as Error).message })}\n\n`,
      );
    } finally {
      res.end();
    }
  }

  @Post('rewrite')
  rewrite(@CurrentUser() u: JwtPayload, @Body() dto: RewriteDto) {
    return this.ai.rewrite({
      teamId: BigInt(u.teamId),
      userId: BigInt(u.sub),
      text: dto.text,
      instruction: dto.instruction,
      accountId: dto.accountId ? BigInt(dto.accountId) : undefined,
    });
  }
}
