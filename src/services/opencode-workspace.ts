import fs from 'node:fs';
import path from 'node:path';

import { runCommand } from './run-command';

type WorkspaceLogger = {
  system?: (message: string) => void;
  stdout?: (line: string) => void;
  stderr?: (line: string) => void;
};

export type RepoCacheResult = {
  workspaceBase: string;
  repoDir: string;
  worktreesRoot: string;
  status: 'cloned' | 'updated';
};

export type CreateWorktreeParams = {
  repoDir: string;
  worktreesRoot: string;
  worktreeName: string;
  branchName: string;
  baseRef: string;
  scrub?: string;
  log?: WorkspaceLogger;
};

export type RemoveWorktreeParams = {
  repoDir: string;
  worktreeDir: string;
  branchName: string;
  scrub?: string;
  log?: WorkspaceLogger;
};

export function buildTokenRemote(owner: string, repo: string, token: string): string {
  return `https://x-access-token:${token}@github.com/${owner}/${repo}.git`;
}

export async function ensureRepoCache(params: {
  workspaceRoot: string;
  owner: string;
  repo: string;
  defaultBranch: string;
  tokenUrl: string;
  scrub?: string;
  log?: WorkspaceLogger;
}): Promise<RepoCacheResult> {
  const workspaceBase = path.join(params.workspaceRoot, `${params.owner}-${params.repo}`);
  const repoDir = path.join(workspaceBase, 'repo');
  const worktreesRoot = path.join(workspaceBase, 'worktrees');

  await fs.promises.mkdir(worktreesRoot, { recursive: true });

  const gitDir = path.join(repoDir, '.git');
  const hasRepo = await pathExists(gitDir);
  const repoExists = await pathExists(repoDir);

  if (!hasRepo) {
    if (repoExists) {
      await fs.promises.rm(repoDir, { recursive: true, force: true });
    }
    params.log?.system?.(`Cloning ${params.owner}/${params.repo}@${params.defaultBranch}`);
    await runCommand('git', ['clone', '--depth', '1', '--branch', params.defaultBranch, params.tokenUrl, repoDir], {
      cwd: workspaceBase,
      scrub: params.scrub,
      onStdoutLine: params.log?.stdout,
      onStderrLine: params.log?.stderr,
    });
    return { workspaceBase, repoDir, worktreesRoot, status: 'cloned' };
  }

  params.log?.system?.(`Updating repo cache ${params.owner}/${params.repo}`);
  await runCommand('git', ['remote', 'set-url', 'origin', params.tokenUrl], {
    cwd: repoDir,
    scrub: params.scrub,
    onStdoutLine: params.log?.stdout,
    onStderrLine: params.log?.stderr,
  });
  await runCommand('git', ['fetch', '--depth', '1', 'origin', params.defaultBranch], {
    cwd: repoDir,
    scrub: params.scrub,
    onStdoutLine: params.log?.stdout,
    onStderrLine: params.log?.stderr,
  });
  await runCommand('git', ['checkout', '-B', params.defaultBranch, `origin/${params.defaultBranch}`], {
    cwd: repoDir,
    onStdoutLine: params.log?.stdout,
    onStderrLine: params.log?.stderr,
  });
  await runCommand('git', ['reset', '--hard', `origin/${params.defaultBranch}`], {
    cwd: repoDir,
    onStdoutLine: params.log?.stdout,
    onStderrLine: params.log?.stderr,
  });
  await runCommand('git', ['clean', '-fd'], {
    cwd: repoDir,
    onStdoutLine: params.log?.stdout,
    onStderrLine: params.log?.stderr,
  });
  await runCommand('git', ['worktree', 'prune'], {
    cwd: repoDir,
    onStdoutLine: params.log?.stdout,
    onStderrLine: params.log?.stderr,
  });

  return { workspaceBase, repoDir, worktreesRoot, status: 'updated' };
}

export async function createWorktree(params: CreateWorktreeParams): Promise<string> {
  await fs.promises.mkdir(params.worktreesRoot, { recursive: true });
  const worktreeDir = path.join(params.worktreesRoot, params.worktreeName);
  params.log?.system?.(`Creating worktree ${params.worktreeName}`);
  await runCommand('git', ['worktree', 'add', '-b', params.branchName, worktreeDir, params.baseRef], {
    cwd: params.repoDir,
    scrub: params.scrub,
    onStdoutLine: params.log?.stdout,
    onStderrLine: params.log?.stderr,
  });
  return worktreeDir;
}

export async function removeWorktree(params: RemoveWorktreeParams): Promise<void> {
  params.log?.system?.('Cleaning up worktree');
  try {
    await runCommand('git', ['worktree', 'remove', '--force', params.worktreeDir], {
      cwd: params.repoDir,
      scrub: params.scrub,
      onStdoutLine: params.log?.stdout,
      onStderrLine: params.log?.stderr,
    });
  } catch {
    // ignore
  }

  try {
    await runCommand('git', ['branch', '-D', params.branchName], {
      cwd: params.repoDir,
      onStdoutLine: params.log?.stdout,
      onStderrLine: params.log?.stderr,
    });
  } catch {
    // ignore
  }

  try {
    await runCommand('git', ['worktree', 'prune'], {
      cwd: params.repoDir,
      onStdoutLine: params.log?.stdout,
      onStderrLine: params.log?.stderr,
    });
  } catch {
    // ignore
  }

  await fs.promises.rm(params.worktreeDir, { recursive: true, force: true });
}

async function pathExists(value: string): Promise<boolean> {
  try {
    await fs.promises.access(value);
    return true;
  } catch {
    return false;
  }
}
