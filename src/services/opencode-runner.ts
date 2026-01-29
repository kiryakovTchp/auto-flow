import { getProjectSecretPlain } from './project-secure-config';
import type { ProjectSecretKey } from '../db/project-settings';
import { getRuntimeConfig } from './secure-config';

export type OpenCodeMode = 'github-actions' | 'server-runner' | 'off';

export type OpenCodeAuthMode = 'oauth' | 'local-cli';
export type OpenCodeLogMode = 'safe' | 'raw';

export type OpenCodeWriteMode = 'pr_only' | 'working_tree' | 'read_only';

export type OpenCodePolicyConfig = {
  writeMode: OpenCodeWriteMode;
  denyPaths: string[];
  maxFilesChanged: number | null;
};

export type OpenCodeConfigWarning = { key: string; message: string };

export type OpenCodeProjectConfig = {
  mode: OpenCodeMode;
  authMode: OpenCodeAuthMode;
  logMode: OpenCodeLogMode;
  localCliReady: boolean;
  command: string;
  prTimeoutMinutes: number;
  model: string;
  workspaceRoot: string | null;
  systemPrompt: string | null;
  configJson: string | null;
  policy: OpenCodePolicyConfig;
  warnings?: OpenCodeConfigWarning[];
};

const DEFAULT_OPENCODE_COMMAND = '/opencode implement';
const DEFAULT_OPENCODE_MODE: OpenCodeMode = 'github-actions';
const DEFAULT_PR_TIMEOUT_MINUTES = 60;
const DEFAULT_OPENCODE_MODEL = 'openai/gpt-4o-mini';
const DEFAULT_WRITE_MODE: OpenCodeWriteMode = 'pr_only';
const DEFAULT_AUTH_MODE: OpenCodeAuthMode = 'oauth';
const DEFAULT_LOG_MODE: OpenCodeLogMode = 'safe';

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

export function normalizeLogMode(raw: string | null | undefined): OpenCodeLogMode | null {
  const v = String(raw ?? '').trim().toLowerCase();
  if (!v) return null;
  if (['safe', 'default', 'filtered'].includes(v)) return 'safe';
  if (['raw', 'verbose', 'full'].includes(v)) return 'raw';
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
  const warnings: OpenCodeConfigWarning[] = [];
  const readSafe = async (key: ProjectSecretKey): Promise<string | null> => {
    if (!projectId) return null;
    try {
      return await getProjectSecretPlain(projectId, key);
    } catch (err: any) {
      warnings.push({ key, message: String(err?.message ?? err) });
      return null;
    }
  };

  const [
    modeRaw,
    commandRaw,
    timeoutRaw,
    modelRaw,
    workspaceRootRaw,
    systemPromptRaw,
    configJsonRaw,
    logModeRaw,
    authModeRaw,
    localCliReadyRaw,
    writeModeRaw,
    denyPathsRaw,
    maxFilesRaw,
  ] = await Promise.all([
    readSafe('OPENCODE_MODE'),
    readSafe('OPENCODE_COMMAND'),
    readSafe('OPENCODE_PR_TIMEOUT_MINUTES'),
    readSafe('OPENCODE_MODEL'),
    readSafe('OPENCODE_WORKSPACE_ROOT'),
    readSafe('OPENCODE_SYSTEM_PROMPT'),
    readSafe('OPENCODE_CONFIG_JSON'),
    readSafe('OPENCODE_LOG_MODE'),
    readSafe('OPENCODE_AUTH_MODE'),
    readSafe('OPENCODE_LOCAL_CLI_READY'),
    readSafe('OPENCODE_POLICY_WRITE_MODE'),
    readSafe('OPENCODE_POLICY_DENY_PATHS'),
    readSafe('OPENCODE_POLICY_MAX_FILES_CHANGED'),
  ]);

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
  const systemPrompt = String(systemPromptRaw ?? '').trim() || null;
  const configJson = String(configJsonRaw ?? '').trim() || null;

  const authMode = normalizeAuthMode(authModeRaw) ?? DEFAULT_AUTH_MODE;
  const localCliReady = normalizeBoolFlag(localCliReadyRaw);
  const logMode = normalizeLogMode(logModeRaw) ?? DEFAULT_LOG_MODE;

  const writeMode = normalizeWriteMode(writeModeRaw) ?? DEFAULT_WRITE_MODE;
  const denyPaths = normalizeDenyPaths(denyPathsRaw);
  const maxFilesChanged = normalizeMaxFilesChanged(maxFilesRaw);

  return {
    mode,
    authMode,
    logMode,
    localCliReady,
    command,
    prTimeoutMinutes,
    model,
    workspaceRoot,
    systemPrompt,
    configJson,
    policy: { writeMode, denyPaths, maxFilesChanged },
    warnings: warnings.length ? warnings : undefined,
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
