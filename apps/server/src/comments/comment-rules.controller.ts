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
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { JwtGuard } from '../common/guards/jwt.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../common/guards/jwt.guard';
import { CommentsService } from './comments.service';

class UpsertRuleDto {
  @IsString() @MaxLength(40) name!: string;
  @IsArray() @ArrayMaxSize(20) triggers!: string[];
  @IsIn(['template', 'ai']) replyMode!: 'template' | 'ai';
  @IsOptional() @IsString() @MaxLength(300) template?: string;
  @IsOptional() @IsString() accountId?: string;
  @IsOptional() @IsInt() priority?: number;
  @IsOptional() @IsBoolean() enabled?: boolean;
}

@Controller('comment-rules')
@UseGuards(JwtGuard)
export class CommentRulesController {
  constructor(private readonly svc: CommentsService) {}

  @Get()
  list(@CurrentUser() u: JwtPayload) {
    return this.svc.listRules(BigInt(u.teamId));
  }

  @Post()
  create(@CurrentUser() u: JwtPayload, @Body() dto: UpsertRuleDto) {
    return this.svc.createRule(BigInt(u.teamId), dto);
  }

  @Put(':id')
  update(
    @CurrentUser() u: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpsertRuleDto,
  ) {
    return this.svc.updateRule(BigInt(u.teamId), BigInt(id), { ...dto });
  }

  @Delete(':id')
  remove(@CurrentUser() u: JwtPayload, @Param('id') id: string) {
    return this.svc.deleteRule(BigInt(u.teamId), BigInt(id));
  }
}
