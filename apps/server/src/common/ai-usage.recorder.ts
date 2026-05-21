// Centralized AI usage / billing recorder. Pricing is read from env at
// recording time so tariff changes don't require redeploy.

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma.module';
import type { TokenStats } from './llm-usage';

export interface UsageRecord {
  teamId: bigint;
  userId: bigint;
  kind: string; // write | rewrite | imitate | lint_llm | inspire
  provider: string;
  model: string;
  stats: TokenStats;
}

@Injectable()
export class AiUsageRecorder {
  constructor(
    private readonly cfg: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async record(r: UsageRecord): Promise<void> {
    // DeepSeek-v4-pro published pricing (USD per million tokens). Override
    // per-provider via env if you wire up Qwen / Claude later.
    const inP = Number(this.cfg.get(`${r.provider.toUpperCase()}_PRICE_INPUT_PER_M`) ?? this.cfg.get('DEEPSEEK_PRICE_INPUT_PER_M') ?? 0.27);
    const cacheP = Number(this.cfg.get(`${r.provider.toUpperCase()}_PRICE_CACHE_PER_M`) ?? this.cfg.get('DEEPSEEK_PRICE_CACHE_PER_M') ?? 0.07);
    const outP = Number(this.cfg.get(`${r.provider.toUpperCase()}_PRICE_OUTPUT_PER_M`) ?? this.cfg.get('DEEPSEEK_PRICE_OUTPUT_PER_M') ?? 1.1);

    const uncached = Math.max(0, r.stats.input - r.stats.cached);
    const costUsd =
      (uncached * inP + r.stats.cached * cacheP + r.stats.output * outP) / 1_000_000;

    await this.prisma.aiUsage.create({
      data: {
        teamId: r.teamId,
        userId: r.userId,
        kind: r.kind,
        provider: r.provider,
        model: r.model,
        promptTokens: r.stats.input,
        cachedTokens: r.stats.cached,
        outputTokens: r.stats.output,
        costCents: Math.round(costUsd * 100),
      },
    });
  }
}
