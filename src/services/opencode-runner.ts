import { getProjectSecretPlain } from './project-secure-config';
import { getRuntimeConfig } from './secure-config';

export type OpenCodeMode = 'github-actions' | 'server-runner' | 'off';

export type OpenCodeAuthMode = 'oauth' | 'local-cli';

export type OpenCodeWriteMode = 'pr_only' | 'working_tree' | 'read_only';

export type OpenCodePolicyConfig = {
  writeMode: OpenCodeWriteMode;
  denyPaths: string[];
  maxFilesChanged: number | null;
};

export type OpenCodeProjectConfig = {
  mode: OpenCodeMode;
  authMode: OpenCodeAuthMode;
  localCliReady: boolean;
  command: string;
  prTimeoutMinutes: number;
  model: string;
  workspaceRoot: string | null;
  policy: OpenCodePolicyConfig;
};

const DEFAULT_OPENCODE_COMMAND = '/opencode implement';
const DEFAULT_OPENCODE_MODE: OpenCodeMode = 'github-actions';
const DEFAULT_PR_TIMEOUT_MINUTES = 60;
const DEFAULT_OPENCODE_MODEL = 'openai/gpt-4o-mini';
const DEFAULT_WRITE_MODE: OpenCodeWriteMode = 'pr_only';
const DEFAULT_AUTH_MODE: OpenCodeAuthMode = 'oauth';

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

export function normalizeAuthMode(raw: string | null | undefined): OpenCodeAuthMode | null {
  const v = String(raw ?? '').trim().toLowerCase();
  if (!v) return null;
  if (['oauth', 'openai', 'token'].includes(v)) return 'oauth';
  if (['local-cli', 'local', 'cli', 'manual'].includes(v)) return 'local-cli';
  return null;
}

export function normalizeBoolFlag(raw: string | null | undefined): boolean {
  const v = String(raw ?? '').trim().toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(v);
}

export function normalizeWriteMode(raw: string | null | undefined): OpenCodeWriteMode | null {
  const v = String(raw ?? '').trim().toLowerCase();
  if (!v) return null;
  if (['pr_only', 'pr-only', 'pr', 'pull-request'].includes(v)) return 'pr_only';
  if (['working_tree', 'working-tree', 'working', 'local', 'worktree'].includes(v)) return 'working_tree';
  if (['read_only', 'read-only', 'readonly', 'read'].includes(v)) return 'read_only';
  return null;
}

export function normalizeMaxFilesChanged(raw: string | null | undefined): number | null {
  const v = String(raw ?? '').trim();
  if (!v) return null;
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(n, 1000);
}

export function normalizeDenyPaths(raw: string | null | undefined): string[] {
  const v = String(raw ?? '').trim();
  if (!v) return [];
  return v
    .split(/[\n,]/g)
    .map((p) => p.trim())
    .filter(Boolean);
}

export function normalizeTimeoutMinutes(raw: string | null | undefined): number {
  const n = Number.parseInt(String(raw ?? '').trim(), 10);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_PR_TIMEOUT_MINUTES;
  return Math.max(5, Math.min(n, 24 * 60));
}

export async function getOpenCodeProjectConfig(projectId?: string | null): Promise<OpenCodeProjectConfig> {
  const [
    modeRaw,
    commandRaw,
    timeoutRaw,
    modelRaw,
    workspaceRootRaw,
    authModeRaw,
    localCliReadyRaw,
    writeModeRaw,
    denyPathsRaw,
    maxFilesRaw,
  ] = projectId
    ? await Promise.all([
        getProjectSecretPlain(projectId, 'OPENCODE_MODE'),
        getProjectSecretPlain(projectId, 'OPENCODE_COMMAND'),
        getProjectSecretPlain(projectId, 'OPENCODE_PR_TIMEOUT_MINUTES'),
        getProjectSecretPlain(projectId, 'OPENCODE_MODEL'),
        getProjectSecretPlain(projectId, 'OPENCODE_WORKSPACE_ROOT'),
        getProjectSecretPlain(projectId, 'OPENCODE_AUTH_MODE'),
        getProjectSecretPlain(projectId, 'OPENCODE_LOCAL_CLI_READY'),
        getProjectSecretPlain(projectId, 'OPENCODE_POLICY_WRITE_MODE'),
        getProjectSecretPlain(projectId, 'OPENCODE_POLICY_DENY_PATHS'),
        getProjectSecretPlain(projectId, 'OPENCODE_POLICY_MAX_FILES_CHANGED'),
      ])
    : [null, null, null, null, null, null, null, null, null, null];

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

  const authMode = normalizeAuthMode(authModeRaw) ?? DEFAULT_AUTH_MODE;
  const localCliReady = normalizeBoolFlag(localCliReadyRaw);

  const writeMode = normalizeWriteMode(writeModeRaw) ?? DEFAULT_WRITE_MODE;
  const denyPaths = normalizeDenyPaths(denyPathsRaw);
  const maxFilesChanged = normalizeMaxFilesChanged(maxFilesRaw);

  return {
    mode,
    authMode,
    localCliReady,
    command,
    prTimeoutMinutes,
    model,
    workspaceRoot,
    policy: { writeMode, denyPaths, maxFilesChanged },
  };
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
    lines.push('Verify OpenCode CLI is installed and OAuth is connected for this project.');
  } else {
    lines.push('Check GitHub Actions logs for the opencode workflow.');
  }

  return lines.join('\n');
}
