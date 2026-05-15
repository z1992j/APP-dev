import {
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma.module';
import axios from 'axios';

interface Code2SessionResp {
  openid: string;
  session_key: string;
  unionid?: string;
  errcode?: number;
  errmsg?: string;
}

@Injectable()
export class AuthService {
  private readonly log = new Logger('AuthService');

  constructor(
    private readonly cfg: ConfigService,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async wxLogin(code: string) {
    const appid = this.cfg.get<string>('WX_APPID');
    const secret = this.cfg.get<string>('WX_SECRET');
    const isDev = this.cfg.get('NODE_ENV') !== 'production';
    const isDevCode = isDev && code.startsWith('dev-');

    if (!isDevCode && (!appid || !secret)) {
      throw new InternalServerErrorException('WX_APPID/SECRET missing');
    }

    // Stub mode for dev: code "dev-<openid>" bypasses WeChat
    let openid: string;
    let unionid: string | undefined;
    if (isDevCode) {
      openid = code;
    } else {
      const url = `https://api.weixin.qq.com/sns/jscode2session?appid=${appid}&secret=${secret}&js_code=${code}&grant_type=authorization_code`;
      const { data } = await axios.get<Code2SessionResp>(url, { timeout: 5000 });
      if (data.errcode) {
        this.log.warn(`code2session failed: ${data.errcode} ${data.errmsg}`);
        throw new InternalServerErrorException('wx login failed');
      }
      openid = data.openid;
      unionid = data.unionid;
    }

    // Upsert user + ensure a default personal team
    const user = await this.prisma.user.upsert({
      where: { openid },
      update: { unionid },
      create: { openid, unionid, nickname: '小红薯' },
    });

    let membership = await this.prisma.teamMember.findFirst({
      where: { userId: user.id },
    });
    if (!membership) {
      const team = await this.prisma.team.create({
        data: {
          name: `${user.nickname ?? '我'}的工作台`,
          ownerId: user.id,
          plan: 'free',
        },
      });
      membership = await this.prisma.teamMember.create({
        data: { teamId: team.id, userId: user.id, role: 'owner' },
      });
    }

    const token = this.jwt.sign({
      sub: user.id.toString(),
      teamId: membership.teamId.toString(),
      role: membership.role,
    });

    return {
      token,
      user: {
        id: user.id.toString(),
        nickname: user.nickname,
        avatarUrl: user.avatarUrl,
      },
      team: {
        id: membership.teamId.toString(),
        role: membership.role,
      },
    };
  }

  async myTeams(userId: bigint) {
    const memberships = await this.prisma.teamMember.findMany({
      where: { userId },
      include: { team: { select: { id: true, name: true, plan: true } } },
      orderBy: { joinedAt: 'asc' },
    });
    return memberships.map((m) => ({
      teamId: m.teamId.toString(),
      name: m.team.name,
      plan: m.team.plan,
      role: m.role,
      joinedAt: m.joinedAt,
    }));
  }

  async switchTeam(userId: bigint, teamId: bigint) {
    const m = await this.prisma.teamMember.findFirst({
      where: { userId, teamId },
      include: { team: { select: { name: true, plan: true } } },
    });
    if (!m) {
      throw new ForbiddenException({ code: 40301, message: '不是该团队成员' });
    }
    const token = this.jwt.sign({
      sub: userId.toString(),
      teamId: teamId.toString(),
      role: m.role,
    });
    return {
      token,
      team: {
        id: teamId.toString(),
        name: m.team.name,
        plan: m.team.plan,
        role: m.role,
      },
    };
  }
}
