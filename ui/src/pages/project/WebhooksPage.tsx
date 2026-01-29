import { useEffect, useState } from 'react';
import { Webhook, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useProject } from '@/contexts/ProjectContext';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiFetch } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';

type WebhookInfo = {
  provider: string;
  asanaProjectGid: string | null;
  webhookGid: string | null;
  targetUrl: string | null;
  lastDeliveryAt: string | null;
};

type WebhooksResponse = {
  githubUrl: string;
  asanaUrls: string[];
  hooks: WebhookInfo[];
};

export function WebhooksPage() {
  const { currentProject } = useProject();
  const { toast } = useToast();
  const [data, setData] = useState<WebhooksResponse | null>(null);
  const [publicBaseUrl, setPublicBaseUrl] = useState('');
  const [repoSyncResult, setRepoSyncResult] = useState('Еще не запускалось');
  const [githubValidation, setGithubValidation] = useState('Еще не проверялось');
  const canManage = currentProject?.role === 'admin';

  useEffect(() => {
    if (!currentProject) return;
    apiFetch<WebhooksResponse>(`/projects/${encodeURIComponent(currentProject.slug)}/webhooks`).then(setData);
  }, [currentProject]);

  const setupAsanaWebhooks = async () => {
    if (!currentProject || !publicBaseUrl.trim()) return;
    try {
      await apiFetch(`/projects/${encodeURIComponent(currentProject.slug)}/webhooks/asana/setup`, {
        method: 'POST',
        body: { public_base_url: publicBaseUrl.trim() },
      });
      toast({ title: 'Вебхуки Asana настроены', description: 'Вебхуки созданы для всех настроенных проектов.' });
    } catch (err: any) {
      toast({ title: 'Ошибка настройки', description: err?.message || 'Не удалось настроить вебхуки Asana.', variant: 'destructive' });
    }
  };

  const syncRepos = async () => {
    if (!currentProject) return;
    try {
      const res = await apiFetch<{ result: any }>(
        `/projects/${encodeURIComponent(currentProject.slug)}/webhooks/asana/sync-repos`,
        { method: 'POST' },
      );
      setRepoSyncResult(JSON.stringify(res.result, null, 2));
    } catch (err: any) {
      setRepoSyncResult(String(err?.message || err));
    }
  };

  const validateGithub = async () => {
    if (!currentProject) return;
    try {
      const res = await apiFetch<{ report: string[] }>(
        `/projects/${encodeURIComponent(currentProject.slug)}/webhooks/github/validate`,
        { method: 'POST' },
      );
      setGithubValidation(res.report.join('\n'));
    } catch (err: any) {
      setGithubValidation(String(err?.message || err));
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Вебхуки</h1>
        <p className="text-muted-foreground">Настройка входящих вебхуков Asana и GitHub</p>
      </div>

      <div className="grid gap-6">
        <Card className="border-2 border-border">
          <CardHeader>
            <CardTitle>URL вебхука GitHub</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="font-mono text-sm break-all">{data?.githubUrl || '—'}</div>
            <div className="text-xs text-muted-foreground mt-2">Настройте в GitHub Settings → Webhooks</div>
          </CardContent>
        </Card>

        <Card className="border-2 border-border">
          <CardHeader>
            <CardTitle>URL вебхука Asana</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 font-mono text-sm">
              {data?.asanaUrls?.length ? data.asanaUrls.map((url) => <div key={url}>{url}</div>) : '—'}
            </div>
          </CardContent>
        </Card>

        {canManage && (
          <Card className="border-2 border-border">
            <CardHeader>
              <CardTitle>Настроить вебхуки Asana</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="publicBaseUrl">Публичный базовый URL</Label>
                <Input
                  id="publicBaseUrl"
                  value={publicBaseUrl}
                  onChange={(e) => setPublicBaseUrl(e.target.value)}
                  placeholder="https://your-domain.com"
                  className="border-2"
                />
                <div className="text-xs text-muted-foreground">Базовый URL для callback вебхуков (без завершающего слеша)</div>
              </div>
              <Button onClick={setupAsanaWebhooks}>Настроить вебхуки Asana</Button>
            </CardContent>
          </Card>
        )}

        {canManage && (
          <Card className="border-2 border-border">
            <CardHeader>
              <CardTitle>Проверка</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" className="border-2" onClick={syncRepos}>
                  Синхронизировать репозитории в Asana
                </Button>
                <Button variant="outline" className="border-2" onClick={validateGithub}>
                  Проверить GitHub вебхуки
                </Button>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-2">Результат синхронизации репозиториев</div>
                <pre className="bg-muted p-3 border-2 border-border text-xs whitespace-pre-wrap">{repoSyncResult}</pre>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-2">Проверка GitHub</div>
                <pre className="bg-muted p-3 border-2 border-border text-xs whitespace-pre-wrap">{githubValidation}</pre>
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="border-2 border-border">
          <CardHeader>
            <CardTitle>Статус вебхуков</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {(data?.hooks || []).map((hook) => (
                <div key={`${hook.provider}-${hook.webhookGid || hook.asanaProjectGid}`} className="flex items-center gap-3">
                  <CheckCircle className="h-4 w-4 text-chart-2" />
                  <div className="text-sm">
                    {hook.provider}
                    {hook.asanaProjectGid ? ` · asana_project_gid=${hook.asanaProjectGid}` : ''}
                  </div>
                  <div className="text-xs text-muted-foreground ml-auto">
                    последнее: {hook.lastDeliveryAt || '—'}
                  </div>
                </div>
              ))}
              {!data?.hooks?.length && (
                <div className="text-sm text-muted-foreground">Пока нет доставок вебхуков.</div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
