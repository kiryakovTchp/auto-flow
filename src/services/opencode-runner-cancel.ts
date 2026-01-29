import type { ChildProcess } from 'node:child_process';

const activeRuns = new Map<string, ChildProcess>();

export function registerRunProcess(runId: string, proc: ChildProcess): void {
  activeRuns.set(runId, proc);
}

export function unregisterRunProcess(runId: string): void {
  activeRuns.delete(runId);
}

export function cancelRunProcess(runId: string): boolean {
  const proc = activeRuns.get(runId);
  if (!proc) return false;
  try {
    proc.kill('SIGTERM');
    return true;
  } catch {
    return false;
  } finally {
    activeRuns.delete(runId);
  }
}
