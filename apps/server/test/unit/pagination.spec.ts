import { clampLimit, MAX_LIMIT } from '../../src/common/pagination';

describe('clampLimit', () => {
  it('returns the default for undefined', () => {
    expect(clampLimit(undefined)).toBe(20);
    expect(clampLimit(undefined, 5)).toBe(5);
  });

  it('parses numeric strings', () => {
    expect(clampLimit('10')).toBe(10);
  });

  it('clamps above the maximum', () => {
    expect(clampLimit(9999)).toBe(MAX_LIMIT);
  });

  it('falls back on non-positive / fractional values', () => {
    expect(clampLimit(0)).toBe(20);
    expect(clampLimit(-3)).toBe(20);
    expect(clampLimit(NaN)).toBe(20);
    expect(clampLimit('not a number')).toBe(20);
  });

  it('floors fractions', () => {
    expect(clampLimit(7.9)).toBe(7);
  });
});
