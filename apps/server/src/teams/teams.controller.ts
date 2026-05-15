import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { JwtGuard } from '../common/guards/jwt.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../common/guards/jwt.guard';
import { TeamsService } from './teams.service';

class RenameTeamDto {
  @IsString() @MaxLength(40) name!: string;
}

class CreateInviteDto {
  @IsIn(['admin', 'editor', 'reviewer', 'viewer']) role!: string;
  @IsOptional() @IsString() note?: string;
}

class AcceptInviteDto {
  @IsString() code!: string;
}

class ChangeRoleDto {
  @IsIn(['admin', 'editor', 'reviewer', 'viewer']) role!: string;
}

const ADMIN_ROLES = new Set(['owner', 'admin']);

@Controller('teams')
@UseGuards(JwtGuard)
export class TeamsController {
  constructor(private readonly svc: TeamsService) {}

  @Get('current')
  current(@CurrentUser() u: JwtPayload) {
    return this.svc.current(BigInt(u.teamId));
  }

  @Post('rename')
  rename(@CurrentUser() u: JwtPayload, @Body() dto: RenameTeamDto) {
    this.assertAdmin(u);
    return this.svc.rename(BigInt(u.teamId), dto.name);
  }

  @Get('members')
  members(@CurrentUser() u: JwtPayload) {
    return this.svc.members(BigInt(u.teamId));
  }

  @Post('invites')
  createInvite(@CurrentUser() u: JwtPayload, @Body() dto: CreateInviteDto) {
    this.assertAdmin(u);
    return this.svc.createInvite(BigInt(u.teamId), BigInt(u.sub), dto.role, dto.note);
  }

  @Post('invites/accept')
  acceptInvite(@CurrentUser() u: JwtPayload, @Body() dto: AcceptInviteDto) {
    return this.svc.acceptInvite(BigInt(u.sub), dto.code);
  }

  @Post('members/:userId/role')
  changeRole(
    @CurrentUser() u: JwtPayload,
    @Param('userId') userId: string,
    @Body() dto: ChangeRoleDto,
  ) {
    this.assertAdmin(u);
    return this.svc.changeRole(BigInt(u.teamId), BigInt(userId), dto.role);
  }

  @Delete('members/:userId')
  removeMember(@CurrentUser() u: JwtPayload, @Param('userId') userId: string) {
    this.assertAdmin(u);
    return this.svc.removeMember(BigInt(u.teamId), BigInt(userId), BigInt(u.sub));
  }

  private assertAdmin(u: JwtPayload) {
    if (!ADMIN_ROLES.has(u.role)) {
      throw new ForbiddenException({ code: 40301, message: '需要 owner/admin 权限' });
    }
  }
}
