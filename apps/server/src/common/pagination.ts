// Clamp a user-supplied limit to a safe range. Anything outside [1, MAX]
// (incl. undefined / NaN / negative / fractional) falls back to `def`.

export const MAX_LIMIT = 50;

export function clampLimit(raw: unknown, def = 20): number {
  const n = typeof raw === 'string' ? Number(raw) : (raw as number | undefined);
  if (!Number.isFinite(n) || n === undefined || n === null) return def;
  const floored = Math.floor(n as number);
  if (floored < 1) return def;
  if (floored > MAX_LIMIT) return MAX_LIMIT;
  return floored;
}
