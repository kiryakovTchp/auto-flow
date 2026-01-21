import { request } from 'undici';

export type GithubIssue = {
  number: number;
  html_url: string;
};

export type GithubWebhook = {
  id: number;
  active: boolean;
  config?: { url?: string };
};

export type GithubCheckRun = {
  status: string;
  conclusion: string | null;
  html_url: string;
};

export class GithubClient {
  constructor(
    private readonly token: string,
    private readonly owner: string,
    private readonly repo: string,
  ) {}

  private async ghRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `https://api.github.com${path}`;

    const res = await request(url, {
      method,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'auto-flow-orchestrator',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const text = await res.body.text();
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw new Error(`GitHub API ${method} ${path} failed: ${res.statusCode} ${text}`);
    }

    return text ? (JSON.parse(text) as T) : (undefined as T);
  }

  async createIssue(params: { title: string; body: string; labels?: string[] }): Promise<GithubIssue> {
    const data = await this.ghRequest<any>('POST', `/repos/${this.owner}/${this.repo}/issues`, {
      title: params.title,
      body: params.body,
      labels: params.labels,
    });
    return { number: Number(data.number), html_url: String(data.html_url) };
  }

  async closeIssue(issueNumber: number): Promise<void> {
    await this.ghRequest('PATCH', `/repos/${this.owner}/${this.repo}/issues/${issueNumber}`, {
      state: 'closed',
      state_reason: 'completed',
    });
  }

  async closeIssueNotPlanned(issueNumber: number): Promise<void> {
    await this.ghRequest('PATCH', `/repos/${this.owner}/${this.repo}/issues/${issueNumber}`, {
      state: 'closed',
      state_reason: 'not_planned',
    });
  }

  async reopenIssue(issueNumber: number): Promise<void> {
    await this.ghRequest('PATCH', `/repos/${this.owner}/${this.repo}/issues/${issueNumber}`, {
      state: 'open',
    });
  }

  async listWebhooks(): Promise<GithubWebhook[]> {
    const data = await this.ghRequest<any[]>('GET', `/repos/${this.owner}/${this.repo}/hooks`);
    return data.map((x) => ({ id: Number(x.id), active: Boolean(x.active), config: { url: x?.config?.url } }));
  }

  async listCheckRunsForRef(ref: string): Promise<GithubCheckRun[]> {
    const data = await this.ghRequest<any>('GET', `/repos/${this.owner}/${this.repo}/commits/${ref}/check-runs`);
    const runs = Array.isArray(data?.check_runs) ? data.check_runs : [];
    return runs.map((r: any) => ({
      status: String(r?.status ?? ''),
      conclusion: r?.conclusion == null ? null : String(r.conclusion),
      html_url: String(r?.html_url ?? ''),
    }));
  }

  async addIssueComment(issueNumber: number, body: string): Promise<void> {
    await this.ghRequest('POST', `/repos/${this.owner}/${this.repo}/issues/${issueNumber}/comments`, { body });
  }

  async addIssueLabels(issueNumber: number, labels: string[]): Promise<void> {
    await this.ghRequest('POST', `/repos/${this.owner}/${this.repo}/issues/${issueNumber}/labels`, { labels });
  }

  async removeIssueLabel(issueNumber: number, label: string): Promise<void> {
    const enc = encodeURIComponent(label);
    await this.ghRequest('DELETE', `/repos/${this.owner}/${this.repo}/issues/${issueNumber}/labels/${enc}`);
  }
}
