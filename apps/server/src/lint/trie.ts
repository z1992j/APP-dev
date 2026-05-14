// AC-style Trie for fast multi-pattern exact match.
// O(n) over input text; suitable for L1 lint with thousands of terms.

export interface TrieMatch {
  term: string;
  start: number;
  end: number;
  meta: TrieMeta;
}

export interface TrieMeta {
  category: string;
  level: 'red' | 'yellow' | 'info';
  suggestion?: string;
}

interface Node {
  next: Map<string, Node>;
  term?: string;
  meta?: TrieMeta;
}

export class Trie {
  private readonly root: Node = { next: new Map() };

  add(term: string, meta: TrieMeta) {
    let cur = this.root;
    for (const ch of term) {
      let nxt = cur.next.get(ch);
      if (!nxt) {
        nxt = { next: new Map() };
        cur.next.set(ch, nxt);
      }
      cur = nxt;
    }
    cur.term = term;
    cur.meta = meta;
  }

  match(text: string): TrieMatch[] {
    const out: TrieMatch[] = [];
    for (let i = 0; i < text.length; i++) {
      let cur: Node | undefined = this.root;
      let j = i;
      while (j < text.length && cur) {
        cur = cur.next.get(text[j]);
        j++;
        if (cur?.term && cur.meta) {
          out.push({ term: cur.term, start: i, end: j, meta: cur.meta });
        }
      }
    }
    return out;
  }
}
