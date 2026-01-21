import type { ProjectContactRow, ProjectLinkRow } from '../db/project-links';

export function buildProjectContextMarkdown(params: {
  knowledgeMarkdown: string;
  links: ProjectLinkRow[];
  contacts: ProjectContactRow[];
}): string {
  const out: string[] = [];

  const links = params.links;
  const contacts = params.contacts;
  const knowledge = String(params.knowledgeMarkdown ?? '').trim();

  if (contacts.length) {
    out.push('### Contacts');
    for (const c of contacts) {
      const bits = [c.role, c.name ?? '', c.handle ? `(${c.handle})` : ''].filter((x) => x && String(x).trim());
      out.push(`- ${bits.join(' ')}`);
    }
    out.push('');
  }

  if (links.length) {
    out.push('### Links');
    for (const l of links) {
      const title = (l.title ?? '').trim();
      const label = title ? `${title} (${l.kind})` : l.kind;
      out.push(`- ${label}: ${l.url}`);
    }
    out.push('');
  }

  if (knowledge) {
    out.push('### Notes');
    out.push(knowledge);
    out.push('');
  }

  return out.join('\n').trim();
}
