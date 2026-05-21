import { Inject, Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.module';
import { Trie, TrieMatch } from './trie';
import { LINT_EXTENSION, LintExtension } from './lint-extension';

interface Violation {
  text: string;
  start: number;
  end: number;
  level: 'red' | 'yellow' | 'info';
  category: string;
  suggestion?: string;
  source: 'L1' | 'L1-regex' | 'L2' | 'L3';
}

@Injectable()
export class LintService implements OnModuleInit {
  private readonly log = new Logger('LintService');
  private trie = new Trie();
  private regexes: Array<{ re: RegExp; meta: { category: string; level: 'red' | 'yellow' | 'info'; suggestion?: string } }> = [];
  private currentVersion = 0;
  private lastReload = 0;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(LINT_EXTENSION) private readonly ext: LintExtension,
  ) {}

  async onModuleInit() {
    await this.reload();
    // poll for updates every 5 minutes; log failures so silent drift is visible
    setInterval(
      () =>
        this.reload().catch((e: unknown) =>
          this.log.warn(`lint reload failed: ${e instanceof Error ? e.message : String(e)}`),
        ),
      5 * 60 * 1000,
    );
  }

  async reload() {
    const words = await this.prisma.lintWord.findMany({ where: { enabled: true } });
    const trie = new Trie();
    const regexes: typeof this.regexes = [];
    for (const w of words) {
      const meta = {
        category: w.category,
        level: w.level as 'red' | 'yellow' | 'info',
        suggestion: w.suggestion ?? undefined,
      };
      if (w.patternType === 'regex') {
        try {
          regexes.push({ re: new RegExp(w.term, 'g'), meta });
        } catch (e) {
          this.log.warn(`bad regex ${w.term}: ${(e as Error).message}`);
        }
      } else {
        trie.add(w.term, meta);
      }
    }
    this.trie = trie;
    this.regexes = regexes;
    this.currentVersion = Math.max(...words.map((w) => w.version), 0);
    this.lastReload = Date.now();
    this.log.log(`lint dict reloaded: ${words.length} entries, version ${this.currentVersion}`);
  }

  async lint(text: string, title?: string) {
    const target = `${title ?? ''}\n${text}`;
    const violations: Violation[] = [];
    // L1 trie
    const matches = this.trie.match(target);
    for (const m of dedup(matches)) {
      violations.push({
        text: m.term,
        start: m.start,
        end: m.end,
        level: m.meta.level,
        category: m.meta.category,
        suggestion: m.meta.suggestion,
        source: 'L1',
      });
    }
    // L1 regex
    for (const { re, meta } of this.regexes) {
      let m: RegExpExecArray | null;
      const r = new RegExp(re.source, 'g');
      while ((m = r.exec(target)) !== null) {
        violations.push({
          text: m[0],
          start: m.index,
          end: m.index + m[0].length,
          level: meta.level,
          category: meta.category,
          suggestion: meta.suggestion,
          source: 'L1-regex',
        });
      }
    }
    // L2: WeChat msgSecCheck — synchronous, blocks the response.
    // Dev binding is NoopLintExtension; prod overrides via LINT_EXTENSION provider.
    try {
      const l2 = await this.ext.checkSensitive(target);
      for (const v of l2) {
        violations.push({
          text: v.text,
          start: 0,
          end: 0,
          level: v.level,
          category: v.category,
          suggestion: v.suggestion,
          source: 'L2',
        });
      }
    } catch (e: unknown) {
      this.log.warn(`L2 check failed (non-fatal): ${e instanceof Error ? e.message : String(e)}`);
    }
    // L3: LLM check fires-and-forgets; results show on next /lint call.
    // We don't await it here so the editor stays snappy.
    void this.ext.checkContextual(text, title).catch(() => undefined);

    const hasRed = violations.some((v) => v.level === 'red');
    return {
      passed: !hasRed,
      violations: violations.sort((a, b) => a.start - b.start),
      version: this.currentVersion,
    };
  }

  version() {
    return { version: this.currentVersion, lastReload: this.lastReload };
  }
}

// Prefer longer match at same position; dedup overlaps.
function dedup(matches: TrieMatch[]): TrieMatch[] {
  const sorted = [...matches].sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));
  const out: TrieMatch[] = [];
  let lastEnd = -1;
  for (const m of sorted) {
    if (m.start >= lastEnd) {
      out.push(m);
      lastEnd = m.end;
    }
  }
  return out;
}
