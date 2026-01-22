import { request } from 'undici';

import { incExternalApiError } from '../metrics/metrics';

export type AsanaTask = {
  gid: string;
  name: string;
  notes: string | null;
  completed: boolean;
  permalink_url?: string;
};

export type AsanaEnumOption = {
  gid: string;
  name: string;
};

export type AsanaCustomFieldSummary = {
  gid: string;
  name: string;
  resource_subtype: string | null;
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
      incExternalApiError('asana', res.statusCode);
      throw new Error(`Asana API ${method} ${path} failed: ${res.statusCode} ${text}`);
    }

    return JSON.parse(text) as T;
  }

  async getTask(taskGid: string): Promise<AsanaTask> {
    const data = await this.asanaRequest<{ data: any }>(
      'GET',
      `/tasks/${taskGid}?opt_fields=gid,name,notes,completed,permalink_url,workspace.gid,custom_fields,custom_fields.gid,custom_fields.name,custom_fields.resource_subtype,custom_fields.boolean_value,custom_fields.enum_value.name,custom_fields.multi_enum_values.name`,
    );
    return {
      gid: String(data.data.gid),
      name: String(data.data.name),
      notes: typeof data.data.notes === 'string' ? data.data.notes : null,
      completed: Boolean(data.data.completed),
      permalink_url: typeof data.data.permalink_url === 'string' ? data.data.permalink_url : undefined,
      // keep raw custom fields for stage 5 gating
      ...(Array.isArray(data.data.custom_fields) ? { custom_fields: data.data.custom_fields } : {}),
      ...(data.data?.workspace?.gid ? { workspace: data.data.workspace } : {}),
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

  async createTask(params: {
    name: string;
    notes?: string | null;
    projects?: string[];
  }): Promise<{ taskGid: string; permalinkUrl: string | null }> {
    const data = await this.asanaRequest<{ data: any }>('POST', '/tasks', {
      data: {
        name: params.name,
        ...(params.notes != null ? { notes: params.notes } : {}),
        ...(params.projects?.length ? { projects: params.projects } : {}),
      },
    });
    return {
      taskGid: String(data.data.gid),
      permalinkUrl: typeof data.data.permalink_url === 'string' ? data.data.permalink_url : null,
    };
  }

  async getEnumOptionsForCustomField(customFieldGid: string): Promise<AsanaEnumOption[]> {
    const data = await this.asanaRequest<{ data: any }>(
      'GET',
      `/custom_fields/${customFieldGid}?opt_fields=enum_options.gid,enum_options.name`,
    );
    const opts = Array.isArray(data.data?.enum_options) ? data.data.enum_options : [];
    return opts
      .map((o: any) => ({ gid: String(o.gid), name: String(o.name) }))
      .filter((o: AsanaEnumOption) => o.gid && o.name);
  }

  async listWorkspaceCustomFields(workspaceGid: string): Promise<Array<{ gid: string; name: string; resource_subtype: string | null }>> {
    const data = await this.asanaRequest<{ data: any[] }>(
      'GET',
      `/workspaces/${workspaceGid}/custom_fields?opt_fields=gid,name,resource_subtype`,
    );

    const rows = Array.isArray(data.data) ? data.data : [];
    return rows
      .map((r: any) => ({
        gid: String(r.gid),
        name: String(r.name),
        resource_subtype: r.resource_subtype == null ? null : String(r.resource_subtype),
      }))
      .filter((r: any) => r.gid && r.name);
  }

  async getProjectCustomFields(projectGid: string): Promise<{ workspaceGid: string | null; fields: AsanaCustomFieldSummary[] }> {
    const data = await this.asanaRequest<{ data: any }>(
      'GET',
      `/projects/${projectGid}?opt_fields=workspace.gid,custom_field_settings.custom_field.gid,custom_field_settings.custom_field.name,custom_field_settings.custom_field.resource_subtype`,
    );

    const workspaceGid = data.data?.workspace?.gid ? String(data.data.workspace.gid) : null;
    const settings = Array.isArray(data.data?.custom_field_settings) ? data.data.custom_field_settings : [];
    const fields = settings
      .map((s: any) => s?.custom_field)
      .filter(Boolean)
      .map((f: any) => ({
        gid: String(f.gid),
        name: String(f.name),
        resource_subtype: f.resource_subtype == null ? null : String(f.resource_subtype),
      }))
      .filter((f: AsanaCustomFieldSummary) => f.gid && f.name);

    return { workspaceGid, fields };
  }

  async setTaskCustomFields(taskGid: string, customFields: Record<string, string | boolean | null>): Promise<void> {
    await this.asanaRequest('PUT', `/tasks/${taskGid}`, { data: { custom_fields: customFields } });
  }
}
