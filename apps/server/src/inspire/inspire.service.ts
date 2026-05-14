import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import Anthropic from '@anthropic-ai/sdk';
import { PrismaService } from '../prisma.module';

const ALLOWED_HOSTS = ['xiaohongshu.com', 'xhslink.com', 'www.xiaohongshu.com'];

@Injectable()
export class InspireService {
  private readonly anthropic: Anthropic;
  private readonly model: string;

  constructor(
    private readonly cfg: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.anthropic = new Anthropic({
      apiKey: cfg.get<string>('ANTHROPIC_API_KEY') ?? '',
    });
    this.model = cfg.get<string>('CLAUDE_MODEL') ?? 'claude-sonnet-4-6';
  }

  // No data BD source. Returns:
  // 1) LLM-generated topic angles (10 items) for the keyword + vertical
  // 2) Plus any user-submitted oembed notes cached in inspire_note for this vertical
  async search(q: string, vertical?: string) {
    if (!q?.trim()) {
      throw new BadRequestException({ code: 40001, message: '请输入关键词' });
    }
    const userNotes = await this.prisma.inspireNote.findMany({
      where: {
        vertical: vertical ?? undefined,
        source: { in: ['oembed', 'user'] },
      },
      orderBy: { fetchedAt: 'desc' },
      take: 10,
    });

    const angles = await this.generateAngles(q, vertical);
    return {
      angles: angles.map((text, i) => ({ id: `angle-${i}`, text, source: 'llm' })),
      userNotes: userNotes.map((n) => ({
        fingerprint: n.fingerprint,
        ...(n.payload as Record<string, unknown>),
        source: n.source,
      })),
    };
  }

  private async generateAngles(q: string, vertical?: string): Promise<string[]> {
    const v = vertical ?? '通用';
    try {
      const msg = await this.anthropic.messages.create({
        model: this.model,
        max_tokens: 600,
        system: [
          {
            type: 'text',
            text: `你是小红书选题策划。针对关键词，列 10 个值得做的选题角度。
每条 ≤30 字。避免敏感品类与极限词。
输出严格 JSON 数组：["角度1","角度2",...]。不要解释。`,
            cache_control: { type: 'ephemeral' },
          },
        ],
        messages: [{ role: 'user', content: `赛道：${v}\n关键词：${q}` }],
      });
      const text = msg.content
        .filter((c) => c.type === 'text')
        .map((c) => (c as { text: string }).text)
        .join('');
      const start = text.indexOf('[');
      const end = text.lastIndexOf(']');
      if (start === -1 || end === -1) return [];
      const arr = JSON.parse(text.slice(start, end + 1));
      return Array.isArray(arr) ? arr.map((x) => String(x)).slice(0, 10) : [];
    } catch {
      return [];
    }
  }

  async resolveByUrl(teamId: bigint, url: string) {
    const u = safeParseUrl(url);
    if (!u || !ALLOWED_HOSTS.includes(u.hostname)) {
      throw new BadRequestException({
        code: 40001,
        message: '请粘贴 xiaohongshu.com 或 xhslink.com 的链接',
      });
    }
    // Production: fetch oembed/meta of the link; here we record the URL for the user pool.
    const sourceId = u.pathname.split('/').pop() ?? url;
    const fingerprint = sha1(`oembed:${sourceId}`);
    const existing = await this.prisma.inspireNote.findUnique({ where: { fingerprint } });
    if (existing) return existing;
    return this.prisma.inspireNote.create({
      data: {
        source: 'oembed',
        sourceId,
        fingerprint,
        payload: { url, title: '', body_excerpt: '', cover_url: '' },
        vertical: null,
        expiresAt: new Date(Date.now() + 30 * 86400_000),
      },
    });
  }

  async getByFingerprint(fp: string) {
    const n = await this.prisma.inspireNote.findUnique({ where: { fingerprint: fp } });
    if (!n) throw new NotFoundException('note not found');
    return n;
  }

  async addToPool(teamId: bigint, userId: bigint, noteFp: string) {
    const note = await this.prisma.inspireNote.findUnique({ where: { fingerprint: noteFp } });
    if (!note) throw new NotFoundException('note not found');
    return this.prisma.inspirePool.create({
      data: {
        teamId,
        userId,
        noteFp,
        noteSnapshot: note.payload as object,
      },
    });
  }
}

function safeParseUrl(s: string): URL | null {
  try {
    return new URL(s);
  } catch {
    return null;
  }
}
function sha1(s: string): string {
  return createHash('sha1').update(s).digest('hex');
}
