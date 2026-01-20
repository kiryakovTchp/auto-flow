export type CiConclusion = 'success' | 'failure' | 'neutral' | 'cancelled' | 'timed_out' | 'action_required' | 'skipped' | 'stale' | 'startup_failure';

export function normalizeConclusion(x: unknown): string | null {
  if (typeof x !== 'string') return null;
  return x;
}
