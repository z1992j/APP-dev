import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.module';
import { Trie, TrieMatch } from './trie';

interface Violation {
  text: string;
  start: number;
  end: number;
  level: 'red' | 'yellow' | 'info';
  category: string;
  suggestion?: string;
  source: 'L1' | 'L1-regex';
}

@Injectable()
export class LintService implements OnModuleInit {
  private readonly log = new Logger('LintService');
  private trie = new Trie();
  private regexes: Array<{ re: RegExp; meta: { category: string; level: 'red' | 'yellow' | 'info'; suggestion?: string } }> = [];
  private currentVersion = 0;
  private lastReload = 0;

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.reload();
    // poll for updates every 5 minutes
    setInterval(() => this.reload().catch(() => undefined), 5 * 60 * 1000);
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
    // L2 (msgSecCheck) and L3 (LLM) are wired in production; stubbed in dev.
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
