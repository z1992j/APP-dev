import { pickUsage } from '../../src/common/llm-usage';
import { safeParseJsonObject, safeParseJsonArray } from '../../src/common/json';

describe('pickUsage', () => {
  it('extracts a full Anthropic usage payload', () => {
    expect(
      pickUsage({
        input_tokens: 120,
        cache_read_input_tokens: 80,
        output_tokens: 240,
        cache_creation_input_tokens: 0,
      }),
    ).toEqual({ input: 120, cached: 80, output: 240 });
  });

  it('treats missing fields as zero', () => {
    expect(pickUsage({ input_tokens: 50 })).toEqual({ input: 50, cached: 0, output: 0 });
  });

  it('survives null / undefined / wrong shape', () => {
    expect(pickUsage(null)).toEqual({ input: 0, cached: 0, output: 0 });
    expect(pickUsage(undefined)).toEqual({ input: 0, cached: 0, output: 0 });
    expect(pickUsage('garbage')).toEqual({ input: 0, cached: 0, output: 0 });
  });

  it('ignores non-numeric fields', () => {
    expect(
      pickUsage({ input_tokens: 'not a number', output_tokens: 5 }),
    ).toEqual({ input: 0, cached: 0, output: 5 });
  });
});

describe('safeParseJsonObject', () => {
  it('extracts a clean object', () => {
    expect(safeParseJsonObject('{"a":1}')).toEqual({ a: 1 });
  });

  it('strips surrounding prose', () => {
    expect(safeParseJsonObject('Sure, here it is: {"a":1} hope that helps')).toEqual({ a: 1 });
  });

  it('returns null on garbage', () => {
    expect(safeParseJsonObject('no json here')).toBeNull();
    expect(safeParseJsonObject('{not valid json}')).toBeNull();
  });
});

describe('safeParseJsonArray', () => {
  it('extracts an array', () => {
    expect(safeParseJsonArray<string>('["a","b"]')).toEqual(['a', 'b']);
  });

  it('rejects non-arrays', () => {
    expect(safeParseJsonArray('{"not":"array"}')).toBeNull();
  });
});
