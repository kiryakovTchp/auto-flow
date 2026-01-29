import { spawn } from 'node:child_process';

const MAX_OUTPUT_CHARS = 20_000;

export type RunCommandOptions = {
  cwd: string;
  env?: Record<string, string>;
  scrub?: string;
  onStdoutLine?: (line: string) => void;
  onStderrLine?: (line: string) => void;
};

export async function runCommand(
  command: string,
  args: string[],
  opts: RunCommandOptions,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      cwd: opts.cwd,
      env: { ...process.env, ...(opts.env ?? {}) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    const stdoutBuffer = { value: '' };
    const stderrBuffer = { value: '' };

    proc.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      if (stdout.length < MAX_OUTPUT_CHARS) {
        stdout += text;
        if (stdout.length > MAX_OUTPUT_CHARS) stdout = stdout.slice(0, MAX_OUTPUT_CHARS);
      }
      emitLines(text, stdoutBuffer, opts.onStdoutLine, opts.scrub);
    });

    proc.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      if (stderr.length < MAX_OUTPUT_CHARS) {
        stderr += text;
        if (stderr.length > MAX_OUTPUT_CHARS) stderr = stderr.slice(0, MAX_OUTPUT_CHARS);
      }
      emitLines(text, stderrBuffer, opts.onStderrLine, opts.scrub);
    });

    proc.on('error', reject);
    proc.on('close', (code) => {
      flushBuffer(stdoutBuffer, opts.onStdoutLine, opts.scrub);
      flushBuffer(stderrBuffer, opts.onStderrLine, opts.scrub);
      const scrubbed = opts.scrub ? scrubOutput(stdout + stderr, opts.scrub) : null;
      const displayCommand = opts.scrub ? scrubOutput(`${command} ${args.join(' ')}`, opts.scrub) : `${command} ${args.join(' ')}`;
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      const message = scrubbed
        ? `Command failed: ${displayCommand}\n${scrubbed}`
        : `Command failed: ${displayCommand}`;
      reject(new Error(message));
    });
  });
}

function scrubOutput(value: string, secret: string): string {
  if (!secret) return value;
  return value.split(secret).join('***');
}

function emitLines(
  chunk: string,
  buffer: { value: string },
  onLine?: (line: string) => void,
  scrub?: string,
): void {
  if (!onLine) return;
  buffer.value += chunk;
  const parts = buffer.value.split(/\r?\n/);
  buffer.value = parts.pop() ?? '';
  for (const line of parts) {
    const cleaned = scrub ? scrubOutput(line, scrub) : line;
    onLine(cleaned);
  }
}

function flushBuffer(buffer: { value: string }, onLine?: (line: string) => void, scrub?: string): void {
  if (!onLine) return;
  const trimmed = buffer.value.trim();
  if (!trimmed) return;
  const cleaned = scrub ? scrubOutput(trimmed, scrub) : trimmed;
  onLine(cleaned);
  buffer.value = '';
}
