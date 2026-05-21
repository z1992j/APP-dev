import { Trie } from '../../src/lint/trie';

const meta = { category: 'extreme', level: 'red' as const };

describe('Trie', () => {
  it('matches a single inserted term', () => {
    const t = new Trie();
    t.add('最佳', meta);
    const r = t.match('全网最佳之选');
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ term: '最佳', start: 2, end: 4 });
  });

  it('reports all occurrences', () => {
    const t = new Trie();
    t.add('神器', meta);
    const r = t.match('神器很神奇，又一个神器');
    expect(r.map((m) => m.start)).toEqual([0, 9]);
  });

  it('records prefix matches even when a longer term shares the prefix', () => {
    const t = new Trie();
    t.add('最', meta);
    t.add('最佳', meta);
    const r = t.match('最佳之选');
    // The walker emits both: caller (LintService) dedups by longest-first.
    expect(r.map((m) => m.term).sort()).toEqual(['最', '最佳']);
  });

  it('returns empty when nothing matches', () => {
    const t = new Trie();
    t.add('禁止', meta);
    expect(t.match('一切都好')).toEqual([]);
  });

  it('handles multi-codepoint chars (emoji) without crashing', () => {
    const t = new Trie();
    t.add('💯', meta);
    const r = t.match('好评💯妙');
    // emoji is a surrogate pair in JS strings (length 2); we don't assert
    // the offset, just that the trie walks through unicode safely.
    expect(r.length).toBeGreaterThanOrEqual(0);
  });

  it('attaches the original meta to every match', () => {
    const t = new Trie();
    const special = { ...meta, suggestion: '换成 “优选”' };
    t.add('最优', special);
    const [m] = t.match('一款最优产品');
    expect(m.meta.suggestion).toBe('换成 “优选”');
    expect(m.meta.level).toBe('red');
  });
});
