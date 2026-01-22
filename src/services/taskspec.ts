import type { AsanaTask } from '../integrations/asana';
import { normalizeOpenCodeCommand } from './opencode-runner';

export function buildTaskSpecMarkdown(params: {
  asanaTask: AsanaTask;
  asanaProjectGid?: string | null;
}): string {
  const t = params.asanaTask;

  const lines: string[] = [];

  lines.push(`**Task ID:** ${t.gid}`);
  lines.push(`**Title:** ${t.name}`);

  if (t.notes && t.notes.trim()) {
    lines.push('**Context:**');
    for (const l of t.notes.split('\n')) {
      lines.push(`- ${l}`.trimEnd());
    }
  }

  lines.push('**Requirements:**');
  lines.push('1. Implement the task described above');

  lines.push('**Constraints:**');
  lines.push('- No new dependencies unless absolutely necessary');

  lines.push('**Acceptance Criteria:**');
  lines.push('- [ ] Implemented per TaskSpec');

  if (t.permalink_url) {
    lines.push('');
    lines.push(`Asana: ${t.permalink_url}`);
  }

  return lines.join('\n');
}

export function buildIssueBodyWithCommand(taskSpecMarkdown: string): string {
  return buildIssueBodyWithCommandV2({ taskSpecMarkdown });
}

export function buildIssueBodyWithCommandV2(params: {
  taskSpecMarkdown: string;
  projectContextMarkdown?: string | null;
  opencodeCommand?: string | null;
}): string {
  const parts: string[] = [];
  parts.push(params.taskSpecMarkdown);

  const ctx = String(params.projectContextMarkdown ?? '').trim();
  if (ctx) {
    parts.push('');
    parts.push('## Project Context');
    parts.push(ctx);
  }

  parts.push('');
  parts.push('## OpenCode');
  const command = normalizeOpenCodeCommand(params.opencodeCommand);
  parts.push(`- Run: ${command}`);
  parts.push('- PR MUST contain: Fixes #<issue_number>');
  parts.push('');
  parts.push(command);
  parts.push('');

  return parts.join('\n');
}
