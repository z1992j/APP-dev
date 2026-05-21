// Provider-agnostic surface for the small slice of Anthropic-style API we
// actually use. Default implementation talks to DeepSeek via its Anthropic
// compat gateway. Phase 3 can drop in a Qwen / Claude implementation.

import { Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';

export interface LlmClient {
  readonly provider: string;
  readonly model: string;
  messages: Anthropic['messages'];
}

interface RetryOpts {
  retries?: number;
  baseDelayMs?: number;
}

/**
 * Wrap a streaming or non-streaming call with bounded exponential backoff.
 * Retries on 5xx / 429 / network errors; never on 4xx (those are caller bugs).
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  log: Logger,
  opts: RetryOpts = {},
): Promise<T> {
  const retries = opts.retries ?? 2;
  const baseDelay = opts.baseDelayMs ?? 400;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (e: unknown) {
      lastErr = e;
      if (!isRetriable(e) || attempt === retries) throw e;
      const delay = baseDelay * 2 ** attempt + Math.floor(Math.random() * 100);
      log.warn(`LLM call failed (attempt ${attempt + 1}/${retries + 1}); retrying in ${delay}ms`);
      await sleep(delay);
    }
  }
  throw lastErr; // unreachable; satisfies TS
}

function isRetriable(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false;
  const o = e as { status?: number; statusCode?: number; code?: string };
  const status = o.status ?? o.statusCode;
  if (status && status >= 500) return true;
  if (status === 429) return true;
  if (o.code && ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED'].includes(o.code)) return true;
  return false;
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

/**
 * Build the DeepSeek-backed default LlmClient. apiKey may be empty in dev —
 * the SDK won't fail until you actually call .messages.*.
 */
export function makeDeepSeekClient(apiKey: string, baseURL: string, model: string): LlmClient {
  const c = new Anthropic({ apiKey, baseURL });
  return { provider: 'deepseek', model, messages: c.messages };
}
