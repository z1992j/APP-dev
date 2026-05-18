import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { JwtGuard } from '../common/guards/jwt.guard';
import { LintService } from './lint.service';

class LintDto {
  @IsString() @MaxLength(5000) text!: string;
  @IsOptional() @IsString() title?: string;
}

@Controller('lint')
@UseGuards(JwtGuard)
export class LintController {
  constructor(private readonly svc: LintService) {}

  @Post()
  async lint(@Body() dto: LintDto) {
    return this.svc.lint(dto.text, dto.title);
  }

  @Get('version')
  version() {
    return this.svc.version();
  }
}
