import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma.module';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async health() {
    const checks: Record<string, { ok: boolean; ms?: number; error?: string }> = {};
    // DB
    const t0 = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      checks.db = { ok: true, ms: Date.now() - t0 };
    } catch (e) {
      checks.db = { ok: false, error: (e as Error).message };
    }
    const ok = Object.values(checks).every((c) => c.ok);
    return { ok, time: new Date().toISOString(), checks };
  }
}
