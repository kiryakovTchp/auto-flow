import { getRuntimeConfig } from './secure-config';

export async function getOpenCodeLaunchConfig(): Promise<{ workdir: string | null; command: string | null }> {
  const cfg = await getRuntimeConfig();
  const workdir = cfg.OPENCODE_WORKDIR;

  // Defaults:
  // - mode: github-issue-command (agent listens to GitHub)
  // - launch command: just run `opencode` in that repo
  const command = 'opencode';

  return { workdir, command };
}
