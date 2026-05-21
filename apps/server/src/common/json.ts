// Lenient JSON extractor for LLM outputs that may include surrounding prose.
// Picks the substring from the first `{` (or `[`) to the matching last brace.

export function safeParseJsonObject<T>(s: string): T | null {
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(s.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}

export function safeParseJsonArray<T>(s: string): T[] | null {
  const start = s.indexOf('[');
  const end = s.lastIndexOf(']');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    const arr = JSON.parse(s.slice(start, end + 1));
    return Array.isArray(arr) ? (arr as T[]) : null;
  } catch {
    return null;
  }
}
