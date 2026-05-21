// L2 (WeChat msgSecCheck) and L3 (LLM context) checks are stubbed in dev.
// Bind a production implementation via ConfigModule + provide override
// before launch — until then this no-op keeps the surface stable.

import { Injectable, Logger } from '@nestjs/common';

export interface LintViolationExt {
  source: 'L2' | 'L3';
  level: 'red' | 'yellow' | 'info';
  category: string;
  text: string;
  suggestion?: string;
}

export interface LintExtension {
  /** L2: WeChat msgSecCheck — fast, binary pass/fail. */
  checkSensitive(text: string): Promise<LintViolationExt[]>;
  /** L3: LLM context check — slow, async, may return empty. */
  checkContextual(text: string, title?: string): Promise<LintViolationExt[]>;
}

@Injectable()
export class NoopLintExtension implements LintExtension {
  private readonly log = new Logger('NoopLintExtension');

  async checkSensitive(_text: string): Promise<LintViolationExt[]> {
    // TODO(prod): replace with WeChat msgSecCheck client. Until WX_APPID /
    // WX_SECRET are wired we cannot make this call.
    return [];
  }

  async checkContextual(_text: string, _title?: string): Promise<LintViolationExt[]> {
    // TODO(prod): replace with an LLM call when AI budget allows. Should be
    // fire-and-forget so it doesn't block the editor.
    return [];
  }
}

export const LINT_EXTENSION = Symbol('LINT_EXTENSION');
