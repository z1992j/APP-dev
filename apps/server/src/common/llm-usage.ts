// Normalize Anthropic-style token usage into a flat shape.
// The SDK reports cache_read_input_tokens / cache_creation_input_tokens
// separately; for billing we only care about input / cached / output.

export interface TokenStats {
  input: number;
  cached: number;
  output: number;
}

// `usage` matches the shape of Anthropic.MessageStreamUsage / Anthropic.Usage,
// but we accept anything-shaped because the SDK type unions across streaming
// vs non-streaming and we don't want to chase that here.
export function pickUsage(usage: unknown): TokenStats {
  if (!usage || typeof usage !== 'object') {
    return { input: 0, cached: 0, output: 0 };
  }
  const u = usage as Record<string, unknown>;
  const num = (k: string) => {
    const v = u[k];
    return typeof v === 'number' && Number.isFinite(v) ? v : 0;
  };
  return {
    input: num('input_tokens'),
    cached: num('cache_read_input_tokens'),
    output: num('output_tokens'),
  };
}
