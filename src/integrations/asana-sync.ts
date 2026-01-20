import { request } from 'undici';

export type AsanaTaskStub = {
  gid: string;
  name: string;
  modified_at: string;
};

export async function listTasksUpdatedSince(params: {
  asanaPat: string;
  asanaProjectGid: string;
  since: string; // ISO
  limit?: number;
}): Promise<AsanaTaskStub[]> {
  const url = new URL(`https://app.asana.com/api/1.0/projects/${params.asanaProjectGid}/tasks`);
  url.searchParams.set('opt_fields', 'gid,name,modified_at');
  url.searchParams.set('limit', String(params.limit ?? 100));
  url.searchParams.set('modified_since', params.since);

  const res = await request(url.toString(), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${params.asanaPat}`,
      'Content-Type': 'application/json',
    },
  });

  const text = await res.body.text();
  if (res.statusCode < 200 || res.statusCode >= 300) {
    throw new Error(`Asana API GET project tasks failed: ${res.statusCode} ${text}`);
  }

  const parsed = JSON.parse(text) as any;
  const data = Array.isArray(parsed?.data) ? parsed.data : [];
  return data
    .map((t: any) => ({ gid: String(t.gid), name: String(t.name ?? ''), modified_at: String(t.modified_at ?? '') }))
    .filter((t: AsanaTaskStub) => t.gid);
}
