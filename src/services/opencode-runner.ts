import { getProjectSecretPlain } from './project-secure-config';
import { getRuntimeConfig } from './secure-config';

export type OpenCodeMode = 'github-actions' | 'server-runner' | 'off';

export type OpenCodeProjectConfig = {
  mode: OpenCodeMode;
  command: string;
  prTimeoutMinutes: number;
  model: string;
  workspaceRoot: string | null;
};

const DEFAULT_OPENCODE_COMMAND = '/opencode implement';
const DEFAULT_OPENCODE_MODE: OpenCodeMode = 'github-actions';
const DEFAULT_PR_TIMEOUT_MINUTES = 60;
const DEFAULT_OPENCODE_MODEL = 'openai/gpt-4o-mini';

export function normalizeOpenCodeMode(raw: string | null | undefined): OpenCodeMode | null {
  const v = String(raw ?? '').trim().toLowerCase();
  if (!v) return null;
  if (['off', 'disabled', 'false', '0', 'none'].includes(v)) return 'off';
  if (
    [
      'github-actions',
      'github',
      'actions',
      'issue-comment',
      'github-issue-command',
      'on',
      'enabled',
      'true',
      '1',
    ].includes(v)
  ) {
    return 'github-actions';
  }
  if (['server-runner', 'server', 'direct', 'local-runner', 'runner'].includes(v)) {
    return 'server-runner';
  }
  return null;
}

export function normalizeOpenCodeCommand(raw: string | null | undefined): string {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return DEFAULT_OPENCODE_COMMAND;
  if (trimmed.includes('/opencode') || trimmed.includes('/oc')) return trimmed;
  return DEFAULT_OPENCODE_COMMAND;
}

export function normalizeTimeoutMinutes(raw: string | null | undefined): number {
  const n = Number.parseInt(String(raw ?? '').trim(), 10);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_PR_TIMEOUT_MINUTES;
  return Math.max(5, Math.min(n, 24 * 60));
}

export async function getOpenCodeProjectConfig(projectId?: string | null): Promise<OpenCodeProjectConfig> {
  const [modeRaw, commandRaw, timeoutRaw, modelRaw, workspaceRootRaw] = projectId
    ? await Promise.all([
        getProjectSecretPlain(projectId, 'OPENCODE_MODE'),
        getProjectSecretPlain(projectId, 'OPENCODE_COMMAND'),
        getProjectSecretPlain(projectId, 'OPENCODE_PR_TIMEOUT_MINUTES'),
        getProjectSecretPlain(projectId, 'OPENCODE_MODEL'),
        getProjectSecretPlain(projectId, 'OPENCODE_WORKSPACE_ROOT'),
      ])
    : [null, null, null, null, null];

  const runtime = await getRuntimeConfig();
  const mode =
    normalizeOpenCodeMode(modeRaw) ??
    normalizeOpenCodeMode(runtime.OPENCODE_MODE) ??
    DEFAULT_OPENCODE_MODE;

  const command = normalizeOpenCodeCommand(commandRaw);

  const timeoutFromEnv = process.env.OPENCODE_PR_TIMEOUT_MINUTES ?? null;
  const prTimeoutMinutes = normalizeTimeoutMinutes(timeoutRaw ?? timeoutFromEnv);
  const model = String(modelRaw ?? '').trim() || DEFAULT_OPENCODE_MODEL;
  const workspaceRoot = String(workspaceRootRaw ?? '').trim() || null;

  return { mode, command, prTimeoutMinutes, model, workspaceRoot };
}

export function buildIssueCreatedAsanaComment(params: { issueUrl: string; command?: string | null; triggered: boolean }): string {
  const lines = [`GitHub issue created: ${params.issueUrl}`];
  if (params.triggered && params.command) {
    lines.push(`OpenCode trigger posted: ${params.command}`);
  }
  return lines.join('\n');
}

export function buildPrLinkedAsanaComment(params: { prUrl: string; issueUrl?: string | null }): string {
  const lines = [`PR linked: ${params.prUrl}`];
  if (params.issueUrl) lines.push(`Issue: ${params.issueUrl}`);
  return lines.join('\n');
}

export function buildOpenCodeTimeoutComment(params: { issueUrl?: string | null; minutes: number; mode?: OpenCodeMode }): string {
  const lines = [`OpenCode did not open a PR within ${params.minutes} minutes.`];
  if (params.issueUrl) lines.push(`Issue: ${params.issueUrl}`);

  if (params.mode === 'server-runner') {
    lines.push('Check Auto-Flow server logs for OpenCode runner output.');
    lines.push('Verify OpenCode CLI is installed and OPENAI_API_KEY is configured.');
  } else {
    lines.push('Check GitHub Actions logs for the opencode workflow.');
  }

  return lines.join('\n');
}
