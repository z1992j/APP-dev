import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

export interface JwtPayload {
  sub: string;        // userId as string (BigInt safe)
  teamId: string;     // current team id
  role: string;       // role within current team
}

@Injectable()
export class JwtGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();

    let token: string | undefined;

    const auth: string | undefined = req.headers['authorization'];
    if (auth?.startsWith('Bearer ')) {
      token = auth.slice(7);
    }

    if (!token && req.cookies?.['redmatrix_token']) {
      token = req.cookies['redmatrix_token'];
    }

    if (!token) {
      throw new UnauthorizedException({ code: 40001, message: 'missing token' });
    }
    try {
      const payload = this.jwt.verify<JwtPayload>(token);
      req.user = payload;
      return true;
    } catch {
      throw new UnauthorizedException({ code: 40001, message: 'invalid token' });
    }
  }
}
