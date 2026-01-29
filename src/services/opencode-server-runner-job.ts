import fs from 'node:fs';
import path from 'node:path';
import { getLatestTaskSpec } from '../db/taskspecs';
import { createAgentRun, getAgentRunById, insertAgentRunLog, updateAgentRun } from '../db/agent-runs';
import { insertTaskEvent } from '../db/task-events';
import {
  attachPrToTaskById,
  getTaskById,
  updateTaskStatusById,
} from '../db/tasks-v2';
import { getProjectKnowledge } from '../db/project-settings';
import { listProjectContacts, listProjectLinks } from '../db/project-links';
import { AsanaClient } from '../integrations/asana';
import { GithubClient } from '../integrations/github';
import { logger } from '../logger/logger';
import { getProjectSecretPlain } from './project-secure-config';
import { buildProjectContextMarkdown } from './project-context';
import { buildPrLinkedAsanaComment, getOpenCodeProjectConfig, type OpenCodePolicyConfig } from './opencode-runner';
import { getOpenCodeAccessToken } from './opencode-oauth';
import { buildTokenRemote, createWorktree, ensureRepoCache, removeWorktree } from './opencode-workspace';
import { runCommand } from './run-command';
import { registerRunProcess, unregisterRunProcess } from './opencode-runner-cancel';

const DEFAULT_COMMIT_PREFIX = 'opencode:';

export async function processOpenCodeRunJob(params: { projectId: string; taskId: string }): Promise<void> {
  const task = await getTaskById(params.taskId);
  if (!task || task.project_id !== params.projectId) return;
  if (task.status === 'AUTO_DISABLED' || task.status === 'CANCELLED') return;
  if (task.github_pr_number) return;

  const opencodeCfg = await getOpenCodeProjectConfig(params.projectId);
  if (opencodeCfg.mode !== 'server-runner') return;

  if (opencodeCfg.policy.writeMode !== 'pr_only') {
    await markTaskFailed(params.projectId, task, `OpenCode policy write_mode=${opencodeCfg.policy.writeMode} is not supported by server-runner`);
    return;
  }

  const workspaceRoot = opencodeCfg.workspaceRoot;
  if (!workspaceRoot) {
    await markTaskFailed(params.projectId, task, 'Missing OPENCODE_WORKSPACE_ROOT');
    return;
  }

  let accessToken: string | null = null;
  if (opencodeCfg.authMode === 'oauth') {
    try {
      accessToken = await getOpenCodeAccessToken(params.projectId);
    } catch (err: any) {
      await markTaskFailed(params.projectId, task, `OpenCode not connected: ${String(err?.message ?? err)}`);
      return;
    }
  } else if (opencodeCfg.authMode === 'local-cli') {
    if (!opencodeCfg.localCliReady) {
      await markTaskFailed(
        params.projectId,
        task,
        'Local CLI not ready. Run `opencode auth login` in the app container and enable Local CLI Ready in settings.',
      );
      return;
    }
    const homeDir = process.env.HOME || '/root';
    const dataHome = process.env.XDG_DATA_HOME || path.join(homeDir, '.local', 'share');
    const authFile = path.join(dataHome, 'opencode', 'auth.json');
    const legacyDir = path.join(homeDir, '.opencode');
    const hasAuth = await fileExists(authFile);
    const hasLegacy = await pathExists(legacyDir);
    if (!hasAuth && !hasLegacy) {
      await markTaskFailed(
        params.projectId,
        task,
        `OpenCode local CLI credentials not found. Run 'opencode auth login' in the app container.`,
      );
      return;
    }
  } else {
    await markTaskFailed(params.projectId, task, `Unknown OpenCode auth mode: ${String(opencodeCfg.authMode)}`);
    return;
  }

  const ghToken = await getProjectSecretPlain(params.projectId, 'GITHUB_TOKEN');
  if (!ghToken) {
    await markTaskFailed(params.projectId, task, 'Missing GITHUB_TOKEN');
    return;
  }

  const repoOwner = task.github_repo_owner;
  const repoName = task.github_repo_name;
  const issueNumber = task.github_issue_number;
  if (!repoOwner || !repoName || !issueNumber) {
    await markTaskFailed(params.projectId, task, 'Missing repo or issue metadata');
    return;
  }

  await updateTaskStatusById(task.id, 'ISSUE_CREATED');
  await insertTaskEvent({
    taskId: task.id,
    kind: 'opencode.run_started',
    eventType: 'opencode.run_started',
    source: 'system',
    refJson: { issueNumber, repo: `${repoOwner}/${repoName}` },
  });

  const gh = new GithubClient(ghToken, repoOwner, repoName);
  const repoInfo = await gh.getRepository();
  const defaultBranch = repoInfo.default_branch || 'main';

  const runId = Date.now();
  const worktreeName = `issue-${issueNumber}-${runId}`;

  let agentRunId: string | null = null;
  const logMode = opencodeCfg.logMode ?? 'safe';
  let logWriter: ReturnType<typeof createAgentRunLogger> | null = null;
  let repoDir: string | null = null;
  let workspaceDir = '';
  let branchName = '';
  try {
    const run = await createAgentRun({
      projectId: params.projectId,
      agentType: 'opencode',
      triggeredByUserId: null,
      status: 'running',
      inputSpec: {
        taskId: task.id,
        issueNumber,
        repo: `${repoOwner}/${repoName}`,
        mode: opencodeCfg.mode,
      },
    });
    agentRunId = run.id;
    await updateAgentRun({ runId: run.id, startedAt: new Date() });
    logWriter = createAgentRunLogger(run.id, logMode);
    await logWriter.system(`OpenCode run started (mode=${opencodeCfg.mode}, auth=${opencodeCfg.authMode}, log=${logMode})`);

    const tokenUrl = buildTokenRemote(repoOwner, repoName, ghToken);
    const cache = await ensureRepoCache({
      workspaceRoot,
      owner: repoOwner,
      repo: repoName,
      defaultBranch,
      tokenUrl,
      scrub: ghToken,
      log: logWriter,
    });
    repoDir = cache.repoDir;

    branchName = `opencode/issue-${issueNumber}-${runId}`;
    workspaceDir = await createWorktree({
      repoDir: cache.repoDir,
      worktreesRoot: cache.worktreesRoot,
      worktreeName,
      branchName,
      baseRef: `origin/${defaultBranch}`,
      scrub: ghToken,
      log: logWriter,
    });

    const [systemPromptRaw, configJsonRaw] = await Promise.all([
      getProjectSecretPlain(params.projectId, 'OPENCODE_SYSTEM_PROMPT'),
      getProjectSecretPlain(params.projectId, 'OPENCODE_CONFIG_JSON'),
    ]);

    const instructionsPath = await writeOpenCodeInstructions({
      workspaceDir,
      systemPrompt: systemPromptRaw,
      logWriter,
    });

    const configOverride = parseOpenCodeConfigOverride(configJsonRaw, logWriter);

    const prompt = await buildOpenCodePrompt({
      projectId: params.projectId,
      taskId: task.id,
      issueNumber,
      issueUrl: task.github_issue_url,
      repo: `${repoOwner}/${repoName}`,
    });

    const opencodeArgs = ['run'];
    if (opencodeCfg.model) {
      opencodeArgs.push('--model', opencodeCfg.model);
    }
    opencodeArgs.push(prompt);

    const opencodeConfig = buildOpenCodeConfig({ instructionsPath, override: configOverride });
    const opencodeEnv: Record<string, string> = {
      OPENCODE_CONFIG_CONTENT: JSON.stringify(opencodeConfig),
      OPENCODE_DISABLE_AUTOUPDATE: '1',
      OPENCODE_DISABLE_PRUNE: '1',
    };
    if (accessToken) {
      opencodeEnv.OPENAI_ACCESS_TOKEN = accessToken;
    }

    await logWriter.system('OpenCode run command starting');
    let lastHeartbeatAt = 0;
    const heartbeatMs = 60_000;
    const idleTimeoutMs = 5 * 60_000;
    const overallTimeoutMs = 45 * 60_000;
    const opencodeResult = await runCommand('opencode', opencodeArgs, {
      cwd: workspaceDir,
      env: opencodeEnv,
      onSpawn: (proc) => {
        if (agentRunId) registerRunProcess(agentRunId, proc);
      },
      onStdoutLine: (line) => logWriter?.stdout(line),
      onStderrLine: (line) => logWriter?.stderr(line),
      idleTimeoutMs,
      overallTimeoutMs,
      heartbeatMs,
      onHeartbeat: ({ elapsedMs, idleMs }) => {
        const now = Date.now();
        if (now - lastHeartbeatAt < heartbeatMs) return;
        lastHeartbeatAt = now;
        const elapsedMin = Math.floor(elapsedMs / 60000);
        const idleMin = Math.floor(idleMs / 60000);
        void logWriter?.system(`OpenCode still running (${elapsedMin}m elapsed, ${idleMin}m idle)`);
      },
    });
    await logWriter.system('OpenCode run command finished');
    void opencodeResult;
    if (agentRunId) unregisterRunProcess(agentRunId);

    await logWriter.system('Inspecting git status');
    const status = await runCommand('git', ['status', '--porcelain'], {
      cwd: workspaceDir,
      onStdoutLine: logWriter.stdout,
      onStderrLine: logWriter.stderr,
    });
    const changedFiles = parseGitStatusFiles(status.stdout);
    if (!changedFiles.length) {
      const message = 'OpenCode produced no changes';
      await logWriter.system(message);
      if (agentRunId) {
        await updateAgentRun({ runId: agentRunId, status: 'failed', outputSummary: message, finishedAt: new Date() });
      }
      await markTaskFailed(params.projectId, task, message);
      return;
    }

    const policyError = evaluatePolicies(changedFiles, opencodeCfg.policy);
    if (policyError) {
      if (agentRunId) {
        await insertAgentRunLog({ runId: agentRunId, stream: 'system', message: policyError });
        await updateAgentRun({ runId: agentRunId, status: 'failed', outputSummary: policyError, finishedAt: new Date() });
      }
      await markTaskFailed(params.projectId, task, policyError);
      return;
    }

    await logWriter.system(`Files changed: ${changedFiles.length}`);
    await logWriter.system('Staging changes');
    await runCommand('git', ['add', '-A'], {
      cwd: workspaceDir,
      onStdoutLine: logWriter.stdout,
      onStderrLine: logWriter.stderr,
    });
    await logWriter.system('Creating commit');
    await runCommand(
      'git',
      ['-c', 'user.name=opencode-bot', '-c', 'user.email=opencode@local', 'commit', '-m', buildCommitMessage(task.title, issueNumber)],
      {
        cwd: workspaceDir,
        onStdoutLine: logWriter.stdout,
        onStderrLine: logWriter.stderr,
      },
    );

    await logWriter.system(`Pushing branch ${branchName}`);
    await runCommand('git', ['push', tokenUrl, branchName], {
      cwd: workspaceDir,
      scrub: ghToken,
      onStdoutLine: logWriter.stdout,
      onStderrLine: logWriter.stderr,
    });

    await logWriter.system('Creating pull request');
    const pr = await gh.createPullRequest({
      title: task.title ? task.title : `OpenCode: Issue #${issueNumber}`,
      body: `Fixes #${issueNumber}\n\nGenerated by OpenCode server runner.`,
      head: branchName,
      base: defaultBranch,
    });

    await attachPrToTaskById({ taskId: task.id, prNumber: pr.number, prUrl: pr.html_url, sha: pr.head_sha });
    await updateTaskStatusById(task.id, 'PR_CREATED');

    if (agentRunId) {
      await updateAgentRun({
        runId: agentRunId,
        status: 'success',
        outputSummary: `PR created: ${pr.html_url}`,
        finishedAt: new Date(),
      });
    }
    await logWriter.system(`PR created: ${pr.html_url}`);

    await insertTaskEvent({
      taskId: task.id,
      kind: 'task.status_changed',
      eventType: 'task.status_changed',
      source: 'system',
      refJson: { from: task.status, to: 'PR_CREATED', reason: 'opencode.server_runner' },
    });

    await insertTaskEvent({
      taskId: task.id,
      kind: 'github.pr_created',
      eventType: 'github.pr_created',
      source: 'system',
      refJson: { prNumber: pr.number, prUrl: pr.html_url, headSha: pr.head_sha },
    });

    const asanaPat = await getProjectSecretPlain(params.projectId, 'ASANA_PAT');
    if (asanaPat) {
      const asana = new AsanaClient(asanaPat);
      const comment = buildPrLinkedAsanaComment({ prUrl: pr.html_url, issueUrl: task.github_issue_url });
      try {
        await asana.addComment(task.asana_gid, comment);
        await logWriter.system('Asana comment posted');
        await insertTaskEvent({
          taskId: task.id,
          kind: 'asana.comment_posted',
          eventType: 'asana.comment_posted',
          source: 'system',
          message: comment,
          refJson: { prNumber: pr.number, prUrl: pr.html_url },
        });
      } catch (err: any) {
        await logWriter.system(`Asana comment failed: ${String(err?.message ?? err)}`);
        await insertTaskEvent({
          taskId: task.id,
          kind: 'asana.comment_failed',
          eventType: 'asana.comment_failed',
          source: 'system',
          message: String(err?.message ?? err),
          refJson: { prNumber: pr.number, prUrl: pr.html_url },
        });
      }
    }
  } catch (err: any) {
    logger.error({ err, taskId: task.id }, 'OpenCode server runner failed');
    if (agentRunId) {
      const run = await getAgentRunById({ projectId: params.projectId, runId: agentRunId });
      if (run?.status === 'cancelled') {
        await insertAgentRunLog({ runId: agentRunId, stream: 'system', message: 'Run cancelled; skipping failure updates.' });
        return;
      }
      await insertAgentRunLog({ runId: agentRunId, stream: 'system', message: String(err?.message ?? err) });
      await updateAgentRun({ runId: agentRunId, status: 'failed', outputSummary: String(err?.message ?? err), finishedAt: new Date() });
    }
    await markTaskFailed(params.projectId, task, String(err?.message ?? err));
  } finally {
    if (repoDir && workspaceDir && branchName) {
      try {
        await removeWorktree({ repoDir, worktreeDir: workspaceDir, branchName, scrub: ghToken, log: logWriter ?? undefined });
      } catch (err) {
        logger.warn({ err, taskId: task.id }, 'Failed to clean up OpenCode worktree');
      }
    }
  }
}

async function buildOpenCodePrompt(params: {
  projectId: string;
  taskId: string;
  issueNumber: number;
  issueUrl: string | null;
  repo: string;
}): Promise<string> {
  const spec = await getLatestTaskSpec(params.taskId);
  const taskSpec = spec?.markdown ?? 'No TaskSpec found.';

  const ctx = buildProjectContextMarkdown({
    knowledgeMarkdown: await getProjectKnowledge(params.projectId),
    links: await listProjectLinks(params.projectId),
    contacts: await listProjectContacts(params.projectId),
  });

  const lines = [
    `Repository: ${params.repo}`,
    `Issue: #${params.issueNumber}${params.issueUrl ? ` (${params.issueUrl})` : ''}`,
    '',
    'TaskSpec:',
    '```',
    taskSpec,
    '```',
  ];

  if (ctx.trim()) {
    lines.push('', 'Project Context:', '```', ctx.trim(), '```');
  }

  lines.push(
    '',
    'Instructions:',
    '- Implement the TaskSpec in this repository.',
    '- Do not commit, push, or open PRs; leave changes in the working tree.',
    '- Follow existing project conventions.',
  );

  return lines.join('\n');
}

async function writeOpenCodeInstructions(params: {
  workspaceDir: string;
  systemPrompt: string | null;
  logWriter: ReturnType<typeof createAgentRunLogger> | null;
}): Promise<string | null> {
  const raw = String(params.systemPrompt ?? '').trim();
  if (!raw) return null;

  const dir = path.join(params.workspaceDir, '.opencode');
  const filePath = path.join(dir, 'auto-flow-instructions.md');
  await fs.promises.mkdir(dir, { recursive: true });
  await fs.promises.writeFile(filePath, `${raw}\n`, 'utf8');
  await params.logWriter?.system('OpenCode instructions file created');
  return filePath;
}

function parseOpenCodeConfigOverride(
  raw: string | null,
  logWriter: ReturnType<typeof createAgentRunLogger> | null,
): Record<string, any> | null {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      void logWriter?.system('OpenCode config override ignored: root must be a JSON object.');
      return null;
    }
    return parsed as Record<string, any>;
  } catch (err: any) {
    void logWriter?.system(`OpenCode config override ignored: ${String(err?.message ?? err)}`);
    return null;
  }
}

function buildOpenCodeConfig(params: { instructionsPath: string | null; override: Record<string, any> | null }): Record<string, any> {
  const base: Record<string, any> = {
    permission: 'allow',
    ruleset: [],
    default_agent: 'build',
  };

  if (params.instructionsPath) {
    base.instructions = [params.instructionsPath];
  }

  if (!params.override) return base;
  return mergeOpenCodeConfig(base, params.override);
}

function mergeOpenCodeConfig(base: Record<string, any>, override: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (isPlainObject(out[key]) && isPlainObject(value)) {
      out[key] = mergeOpenCodeConfig(out[key], value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

function isPlainObject(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function createAgentRunLogger(runId: string, logMode: 'safe' | 'raw') {
  let chain = Promise.resolve();

  const enqueue = (stream: 'stdout' | 'stderr' | 'system', message: string): void => {
    const line = sanitizeLogLine(message, logMode);
    if (!line) return;
    chain = chain
      .then(() => insertAgentRunLog({ runId, stream, message: line }))
      .catch(() => undefined);
  };

  return {
    system: async (message: string) => enqueue('system', message),
    stdout: (line: string) => enqueue('stdout', line),
    stderr: (line: string) => enqueue('stderr', line),
  };
}

function sanitizeLogLine(line: string, mode: 'safe' | 'raw'): string | null {
  const trimmed = line.replace(/\r/g, '').trim();
  if (!trimmed) return null;
  if (trimmed.length > 2000) {
    return `${trimmed.slice(0, 1997)}...`;
  }
  if (mode === 'safe') {
    if (isReasoningLine(trimmed)) return null;
  } else if (isReasoningLine(trimmed)) {
    return '[redacted reasoning]';
  }
  return trimmed;
}

function isReasoningLine(line: string): boolean {
  return /^(thought|analysis|reasoning|chain-of-thought)\b/i.test(line) || /"type"\s*:\s*"analysis"/i.test(line);
}

function buildCommitMessage(title: string | null, issueNumber: number): string {
  const base = title?.trim() ? title.trim() : `Issue #${issueNumber}`;
  const trimmed = base.length > 60 ? `${base.slice(0, 57)}...` : base;
  return `${DEFAULT_COMMIT_PREFIX} ${trimmed}`;
}

function parseGitStatusFiles(output: string): string[] {
  const files: string[] = [];
  for (const line of output.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const raw = trimmed.length > 3 ? trimmed.slice(3).trim() : '';
    if (!raw) continue;
    const resolved = raw.includes(' -> ') ? raw.split(' -> ').pop() ?? raw : raw;
    const normalized = normalizePath(resolved);
    if (normalized) files.push(normalized);
  }
  return Array.from(new Set(files));
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\.\//, '');
}

function globToRegExp(pattern: string): RegExp {
  let p = normalizePath(pattern.trim());
  if (!p) return /^$/;
  if (p.startsWith('/')) p = p.slice(1);
  if (!p.includes('/')) p = `**/${p}`;
  if (p.endsWith('/')) p += '**';

  const escaped = p.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const withGlob = escaped
    .replace(/\\\*\\\*/g, '.*')
    .replace(/\\\*/g, '[^/]*');
  return new RegExp(`^${withGlob}$`);
}

async function pathExists(value: string): Promise<boolean> {
  try {
    await fs.promises.access(value);
    return true;
  } catch {
    return false;
  }
}

async function fileExists(value: string): Promise<boolean> {
  try {
    const stat = await fs.promises.stat(value);
    return stat.isFile();
  } catch {
    return false;
  }
}

function evaluatePolicies(files: string[], policy: OpenCodePolicyConfig): string | null {
  if (policy.maxFilesChanged != null && files.length > policy.maxFilesChanged) {
    return `OpenCode policy violation: changed files (${files.length}) exceeds max_files_changed (${policy.maxFilesChanged}).`;
  }

  if (policy.denyPaths.length) {
    const matchers = policy.denyPaths.map((p) => ({ pattern: p, regex: globToRegExp(p) }));
    const matched = files.filter((file) => matchers.some((m) => m.regex.test(file)));
    if (matched.length) {
      const sample = matched.slice(0, 5).join(', ');
      return `OpenCode policy violation: deny_paths matched (${matched.length}): ${sample}.`;
    }
  }

  return null;
}

async function markTaskFailed(
  projectId: string,
  task: { id: string; asana_gid: string; status?: string | null },
  message: string,
): Promise<void> {
  await updateTaskStatusById(task.id, 'FAILED', message);
  await insertTaskEvent({
    taskId: task.id,
    kind: 'opencode.run_failed',
    eventType: 'opencode.run_failed',
    source: 'system',
    message,
  });
  await insertTaskEvent({
    taskId: task.id,
    kind: 'task.status_changed',
    eventType: 'task.status_changed',
    source: 'system',
    refJson: { from: task.status ?? null, to: 'FAILED', reason: 'opencode.run_failed' },
  });

  const asanaPat = await getProjectSecretPlain(projectId, 'ASANA_PAT');
  if (asanaPat) {
    const asana = new AsanaClient(asanaPat);
    try {
      await asana.addComment(task.asana_gid, `OpenCode server runner failed: ${message}`);
    } catch (err) {
      logger.warn({ err, taskId: task.id }, 'Failed to add Asana failure comment');
    }
  }
}
