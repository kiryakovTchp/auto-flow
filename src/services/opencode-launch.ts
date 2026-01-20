import { spawn } from 'node:child_process';
import fs from 'node:fs';

function escapeForDoubleQuotes(s: string): string {
  return s.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}

export async function launchOpenCodeInTerminal(params: {
  workdir: string;
  command?: string;
}): Promise<void> {
  if (!params.workdir.startsWith('/')) throw new Error('OPENCODE_WORKDIR must be an absolute path');
  if (!fs.existsSync(params.workdir) || !fs.statSync(params.workdir).isDirectory()) {
    throw new Error(`Workdir does not exist or is not a directory: ${params.workdir}`);
  }

  const cd = `cd "${escapeForDoubleQuotes(params.workdir)}"`;
  const cmd = params.command?.trim() ? `; ${params.command.trim()}` : '';

  const script = `tell application "Terminal"
  activate
  do script "${cd}${cmd}"
end tell`;

  await new Promise<void>((resolve, reject) => {
    const p = spawn('osascript', ['-e', script], { stdio: 'ignore' });
    p.on('error', reject);
    p.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`osascript exited with code ${code}`));
    });
  });
}
