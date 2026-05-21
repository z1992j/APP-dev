import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtGuard } from '../common/guards/jwt.guard';

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => {
        const secret = cfg.get<string>('JWT_SECRET');
        const isProd = cfg.get<string>('NODE_ENV') === 'production';
        if (!secret) {
          if (isProd) {
            throw new Error('JWT_SECRET must be set in production');
          }
          // Dev convenience only: never let this leak to prod.
          console.warn('[auth] JWT_SECRET not set, using dev fallback');
        }
        return {
          secret: secret ?? 'dev-secret-do-not-use-in-prod',
          signOptions: { expiresIn: cfg.get<string>('JWT_EXPIRES_IN') ?? '7d' },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtGuard],
  exports: [AuthService, JwtGuard, JwtModule],
})
export class AuthModule {}
