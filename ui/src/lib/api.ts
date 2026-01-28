export class ApiError extends Error {
  status: number;
  data: any;

  constructor(message: string, status: number, data?: any) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

const API_BASE = '/api/ui';

async function parseResponse(res: Response) {
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return res.json();
  }
  return res.text();
}

export async function apiFetch<T = any>(path: string, options: Omit<RequestInit, 'body'> & { body?: any } = {}): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };

  const hasBody = Object.prototype.hasOwnProperty.call(options, 'body');
  const body = (options as any).body;
  if (hasBody && body && typeof body === 'object' && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    (options as any).body = JSON.stringify(body);
  }

  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'same-origin',
    ...options,
    headers,
  });

  const data = await parseResponse(res);
  if (!res.ok) {
    const message = typeof data === 'string' ? data : data?.error || res.statusText;
    throw new ApiError(message, res.status, data);
  }
  return data as T;
}
