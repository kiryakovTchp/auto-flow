import { request } from 'undici';

export type OpenCodeTriggerMode = 'github-issue-command';

// MVP: orchestrator does NOT run OpenCode.
// This module is here to make the intended integration explicit in UI/config.
export async function checkOpenCodeEndpoint(url: string): Promise<{ ok: boolean; status: number }> {
  const res = await request(url, { method: 'GET' });
  return { ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode };
}
