import {
  Body,
  Controller,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { JwtGuard } from '../common/guards/jwt.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../common/guards/jwt.guard';
import { ImitateService } from './imitate.service';

class ParseDto {
  @IsString() url!: string;
}

class GenerateDto {
  @IsString() url!: string;
  @IsString() accountId!: string;
  @IsOptional() @IsString() @MaxLength(4000) extraInstruction?: string;
}

@Controller('imitate')
@UseGuards(JwtGuard)
export class ImitateController {
  constructor(private readonly svc: ImitateService) {}

  // Parse reference XHS URL → return cached note (title/body/images preview)
  @Post('parse')
  parse(@Body() dto: ParseDto) {
    return this.svc.parseUrl(dto.url);
  }

  // Stream AI imitation. SSE events: parsed, delta, done, error
  @Post('generate')
  async generate(
    @CurrentUser() u: JwtPayload,
    @Body() dto: GenerateDto,
    @Res() res: Response,
  ) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    try {
      for await (const evt of this.svc.generate({
        teamId: BigInt(u.teamId),
        userId: BigInt(u.sub),
        url: dto.url,
        accountId: BigInt(dto.accountId),
        extraInstruction: dto.extraInstruction,
      })) {
        res.write(`data: ${JSON.stringify(evt)}\n\n`);
      }
      res.write('data: [DONE]\n\n');
    } catch (e) {
      res.write(
        `data: ${JSON.stringify({ type: 'error', message: (e as Error).message })}\n\n`,
      );
    } finally {
      res.end();
    }
  }
}
