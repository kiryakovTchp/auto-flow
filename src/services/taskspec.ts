import type { AsanaTask } from '../integrations/asana';

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
  return `${taskSpecMarkdown}\n\n## OpenCode\n- Run: /opencode implement\n- PR MUST contain: Fixes #<issue_number>\n\n/opencode implement\n`;
}
