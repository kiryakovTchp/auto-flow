import { request } from 'undici';

export type AsanaTask = {
  gid: string;
  name: string;
  notes: string | null;
  completed: boolean;
  permalink_url?: string;
};

export type AsanaWebhook = {
  gid: string;
};

export class AsanaClient {
  constructor(private readonly pat: string) {}

  private async asanaRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `https://app.asana.com/api/1.0${path}`;
    const res = await request(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.pat}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const text = await res.body.text();
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw new Error(`Asana API ${method} ${path} failed: ${res.statusCode} ${text}`);
    }

    return JSON.parse(text) as T;
  }

  async getTask(taskGid: string): Promise<AsanaTask> {
    const data = await this.asanaRequest<{ data: any }>(
      'GET',
      `/tasks/${taskGid}?opt_fields=gid,name,notes,completed,permalink_url,custom_fields,custom_fields.gid,custom_fields.boolean_value,custom_fields.enum_value.name`,
    );
    return {
      gid: String(data.data.gid),
      name: String(data.data.name),
      notes: typeof data.data.notes === 'string' ? data.data.notes : null,
      completed: Boolean(data.data.completed),
      permalink_url: typeof data.data.permalink_url === 'string' ? data.data.permalink_url : undefined,
      // keep raw custom fields for stage 5 gating
      ...(Array.isArray(data.data.custom_fields) ? { custom_fields: data.data.custom_fields } : {}),
    } as any;
  }

  async setTaskCompleted(taskGid: string, completed: boolean): Promise<void> {
    await this.asanaRequest('PUT', `/tasks/${taskGid}`, { data: { completed } });
  }

  async addComment(taskGid: string, text: string): Promise<void> {
    await this.asanaRequest('POST', `/tasks/${taskGid}/stories`, { data: { text } });
  }

  async createWebhook(params: {
    resourceGid: string;
    targetUrl: string;
    filters?: Array<{ resource_type: string; action: string; fields?: string[] }>;
  }): Promise<{ webhookGid: string; hookSecret: string | null }> {
    const res = await request('https://app.asana.com/api/1.0/webhooks', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.pat}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        data: {
          resource: params.resourceGid,
          target: params.targetUrl,
          ...(params.filters ? { filters: params.filters } : {}),
        },
      }),
    });

    const hookSecret = (res.headers as any)?.['x-hook-secret'];
    const hookSecretStr = Array.isArray(hookSecret) ? hookSecret[0] : hookSecret;

    const text = await res.body.text();
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw new Error(`Asana API POST /webhooks failed: ${res.statusCode} ${text}`);
    }

    const parsed = JSON.parse(text) as any;
    const webhookGid = String(parsed?.data?.gid);

    return { webhookGid, hookSecret: typeof hookSecretStr === 'string' ? hookSecretStr : null };
  }
}
