import type { AsanaTask } from '../integrations/asana';

export function buildIssueBodyFromAsanaTask(task: AsanaTask): string {
  const parts: string[] = [];

  parts.push('## TaskSpec');

  parts.push(`**Task ID:** ${task.gid}`);
  parts.push(`**Title:** ${task.name}`);

  if (task.notes && task.notes.trim()) {
    parts.push('');
    parts.push('**Context / Notes:**');
    parts.push(task.notes);
  }

  if (task.permalink_url) {
    parts.push('');
    parts.push(`Asana: ${task.permalink_url}`);
  }

  parts.push('');
  parts.push('/opencode implement');

  return parts.join('\n');
}
