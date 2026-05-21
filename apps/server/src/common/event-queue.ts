// Single-consumer / multi-producer async queue. Used to merge N parallel
// streaming generators into one SSE-friendly async iterator.

export class EventQueue<T> {
  private items: T[] = [];
  private resolvers: Array<(v: T | null) => void> = [];
  private closed = false;

  push(e: T): void {
    if (this.closed) return;
    const r = this.resolvers.shift();
    if (r) r(e);
    else this.items.push(e);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    while (this.resolvers.length) this.resolvers.shift()!(null);
  }

  async next(): Promise<T | null> {
    if (this.items.length) return this.items.shift()!;
    if (this.closed) return null;
    return new Promise<T | null>((r) => this.resolvers.push(r));
  }
}
