import { useEffect, useState } from 'react';
import { CheckCircle, XCircle, Settings, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useProject } from '@/contexts/ProjectContext';
import { useToast } from '@/hooks/use-toast';
import { EmptyState } from '@/components/EmptyState';
import { apiFetch } from '@/lib/api';

type SettingsResponse = {
  secrets: { asanaPat: boolean; githubToken: boolean; githubWebhookSecret: boolean };
  asanaProjects: string[];
  repos: Array<{ owner: string; repo: string; is_default?: boolean }>;
};

type OpenCodeResponse = {
  status: string;
  connectedAt: string | null;
  lastError: string | null;
  token: { expiresAt: string | null; scopes: string[]; lastRefreshAt: string | null; tokenType: string | null };
  config: { mode: string; authMode: 'oauth' | 'local-cli'; localCliReady: boolean; workspaceRoot: string | null };
  webConfig: { url: string | null; embedEnabled: boolean; enabled: boolean };
};

export function IntegrationsPage() {
  const { currentProject } = useProject();
  const { toast } = useToast();
  const [settings, setSettings] = useState<SettingsResponse | null>(null);
  const [opencode, setOpencode] = useState<OpenCodeResponse | null>(null);
  const [prepareBusy, setPrepareBusy] = useState(false);
  const canManage = currentProject?.role === 'admin';

  useEffect(() => {
    if (!currentProject) return;
    apiFetch<SettingsResponse>(`/projects/${encodeURIComponent(currentProject.slug)}/settings`).then(setSettings);
    apiFetch<OpenCodeResponse>(`/projects/${encodeURIComponent(currentProject.slug)}/integrations/opencode`).then(setOpencode);
  }, [currentProject]);

  if (!currentProject) return null;

  const asanaConnected = Boolean(settings?.secrets.asanaPat && settings?.asanaProjects?.length);
  const githubConnected = Boolean(settings?.secrets.githubToken && settings?.repos?.length);
  const opencodeAuthMode = opencode?.config?.authMode ?? 'oauth';
  const opencodeMode = opencode?.config?.mode ?? 'github-actions';
  const repoCount = settings?.repos?.length ?? 0;
  const opencodeConnected =
    opencode?.status === 'connected' || (opencodeAuthMode === 'local-cli' && opencode?.config?.localCliReady);

  const connectOpenCode = async () => {
    if (!currentProject) return;
    try {
      const res = await apiFetch<{ authorizeUrl: string }>(
        `/projects/${encodeURIComponent(currentProject.slug)}/integrations/opencode/connect`,
        { method: 'POST' },
      );
      window.location.href = res.authorizeUrl;
    } catch (err: any) {
      toast({ title: 'Не удалось подключить', description: err?.message || 'Не удалось запустить OAuth.', variant: 'destructive' });
    }
  };

  const disconnectOpenCode = async () => {
    if (!currentProject) return;
    try {
      await apiFetch(`/projects/${encodeURIComponent(currentProject.slug)}/integrations/opencode/disconnect`, { method: 'POST' });
      toast({ title: 'Отключено', description: 'Интеграция OpenCode отключена.' });
      const res = await apiFetch<OpenCodeResponse>(`/projects/${encodeURIComponent(currentProject.slug)}/integrations/opencode`);
      setOpencode(res);
    } catch (err: any) {
      toast({ title: 'Ошибка отключения', description: err?.message || 'Не удалось отключить интеграцию.', variant: 'destructive' });
    }
  };

  const prepareRepoCache = async () => {
    if (!currentProject || !canManage) return;
    setPrepareBusy(true);
    try {
      const res = await apiFetch<{ results: Array<{ status: string; owner: string; repo: string; message?: string }> }>(
        `/projects/${encodeURIComponent(currentProject.slug)}/integrations/opencode/prepare-repo`,
        { method: 'POST' },
      );
      const counts = { cloned: 0, updated: 0, failed: 0 };
      for (const item of res.results || []) {
        if (item.status === 'cloned') counts.cloned += 1;
        else if (item.status === 'updated') counts.updated += 1;
        else counts.failed += 1;
      }
      const description = `Склонировано: ${counts.cloned}, обновлено: ${counts.updated}, ошибки: ${counts.failed}.`;
      toast({
        title: counts.failed ? 'Кэш репозиториев готов с ошибками' : 'Кэш репозиториев готов',
        description,
        variant: counts.failed ? 'destructive' : undefined,
      });
    } catch (err: any) {
      toast({ title: 'Ошибка кэширования', description: err?.message || 'Не удалось подготовить кэш репозиториев.', variant: 'destructive' });
    } finally {
      setPrepareBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Интеграции</h1>
        <p className="text-muted-foreground">Подключайте и управляйте внешними сервисами</p>
      </div>

      <Tabs defaultValue="asana">
        <TabsList className="border-2 border-border bg-transparent p-1 h-auto flex-wrap">
          <TabsTrigger value="asana" className="border-2 border-transparent data-[state=active]:border-border data-[state=active]:bg-accent">
            Asana
            {asanaConnected ? (
              <CheckCircle className="h-3 w-3 ml-2 text-chart-2" />
            ) : (
              <XCircle className="h-3 w-3 ml-2 text-muted-foreground" />
            )}
          </TabsTrigger>
          <TabsTrigger value="github" className="border-2 border-transparent data-[state=active]:border-border data-[state=active]:bg-accent">
            GitHub
            {githubConnected ? (
              <CheckCircle className="h-3 w-3 ml-2 text-chart-2" />
            ) : (
              <XCircle className="h-3 w-3 ml-2 text-muted-foreground" />
            )}
          </TabsTrigger>
          <TabsTrigger value="opencode" className="border-2 border-transparent data-[state=active]:border-border data-[state=active]:bg-accent">
            OpenCode
            {opencodeConnected ? (
              <CheckCircle className="h-3 w-3 ml-2 text-chart-2" />
            ) : (
              <XCircle className="h-3 w-3 ml-2 text-muted-foreground" />
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="asana" className="mt-6 space-y-4">
          <Card className="border-2 border-border">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    Asana
                    {asanaConnected && (
                      <span className="text-xs bg-chart-2/20 text-chart-2 px-2 py-0.5 border border-chart-2/30">Подключено</span>
                    )}
                  </CardTitle>
                  <CardDescription>Синхронизация задач и статусов из Asana</CardDescription>
                </div>
                <Button variant="outline" className="border-2" asChild>
                  <Link to={`/p/${currentProject.slug}/settings`}>Открыть настройки</Link>
                </Button>
              </div>
            </CardHeader>
            {asanaConnected ? (
              <CardContent className="space-y-3">
                <div className="text-sm text-muted-foreground">
                  {settings?.asanaProjects?.length || 0} проект(ов) Asana подключено.
                </div>
                <Button variant="outline" className="border-2" asChild>
                  <Link to={`/p/${currentProject.slug}/webhooks`}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Управление вебхуками
                  </Link>
                </Button>
              </CardContent>
            ) : (
              <CardContent>
                <EmptyState
                  icon={Settings}
                  title="Asana не настроена"
                  description="Добавьте ASANA_PAT и GID проектов в настройках, чтобы включить синхронизацию."
                />
              </CardContent>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="github" className="mt-6 space-y-4">
          <Card className="border-2 border-border">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    GitHub
                    {githubConnected && (
                      <span className="text-xs bg-chart-2/20 text-chart-2 px-2 py-0.5 border border-chart-2/30">Подключено</span>
                    )}
                  </CardTitle>
                  <CardDescription>Создание issues и отслеживание pull request</CardDescription>
                </div>
                <Button variant="outline" className="border-2" asChild>
                  <Link to={`/p/${currentProject.slug}/settings`}>Открыть настройки</Link>
                </Button>
              </div>
            </CardHeader>
            {githubConnected ? (
              <CardContent>
                <div className="text-sm text-muted-foreground">{settings?.repos?.length || 0} репозиториев подключено.</div>
              </CardContent>
            ) : (
              <CardContent>
                <EmptyState
                  icon={Settings}
                  title="GitHub не настроен"
                  description="Добавьте GITHUB_TOKEN и список репозиториев в настройках."
                />
              </CardContent>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="opencode" className="mt-6 space-y-4">
          <Card className="border-2 border-border">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    OpenCode
                    {opencodeConnected && (
                      <span className="text-xs bg-chart-2/20 text-chart-2 px-2 py-0.5 border border-chart-2/30">Подключено</span>
                    )}
                  </CardTitle>
                  <CardDescription>AI‑генерация кода и автоматизация</CardDescription>
                </div>
                {canManage && (
                  opencodeConnected ? (
                    <Button variant="outline" className="border-2" onClick={disconnectOpenCode}>
                      Отключить
                    </Button>
                  ) : opencodeAuthMode === 'local-cli' ? (
                    <Button variant="outline" className="border-2" asChild>
                      <Link to={`/p/${currentProject.slug}/settings`}>Открыть настройки</Link>
                    </Button>
                  ) : (
                    <Button onClick={connectOpenCode} className="shadow-xs">
                      Подключить
                    </Button>
                  )
                )}
              </div>
            </CardHeader>
            {!opencodeConnected && opencodeAuthMode === 'local-cli' && (
              <CardContent>
                <div className="text-sm text-muted-foreground">
                  OAuth отключен. Запустите <span className="font-mono">opencode auth login</span> на сервере и включите Local CLI Ready в настройках.
                </div>
              </CardContent>
            )}
            {opencodeConnected && opencodeAuthMode === 'local-cli' && (
              <CardContent>
                <div className="text-sm text-muted-foreground">Local CLI аутентифицирован.</div>
              </CardContent>
            )}
            {!opencodeConnected && opencodeAuthMode !== 'local-cli' && (
              <CardContent>
                <EmptyState
                  icon={Settings}
                  title="OpenCode не подключен"
                  description="Подключите OpenCode, чтобы включить автоматическое выполнение задач."
                  action={canManage ? { label: 'Подключить OpenCode', onClick: connectOpenCode } : undefined}
                />
              </CardContent>
            )}
            {opencodeConnected && opencode?.webConfig?.enabled && opencode.webConfig.url && (
              <CardContent>
                <Button variant="outline" className="border-2" asChild>
                  <a href={opencode.webConfig.url} target="_blank" rel="noreferrer">Открыть OpenCode Web UI</a>
                </Button>
              </CardContent>
            )}
            {opencodeMode === 'server-runner' && (
              <CardContent className="space-y-3">
                <div className="text-sm text-muted-foreground">Кэш репозиториев для server-runner.</div>
                <div className="text-xs text-muted-foreground">
                  Корень workspace: <span className="font-mono">{opencode?.config?.workspaceRoot || 'не задано'}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    className="border-2"
                    onClick={prepareRepoCache}
                    disabled={!canManage || prepareBusy || !opencode?.config?.workspaceRoot || repoCount === 0}
                  >
                    {prepareBusy ? 'Подготовка...' : `Подготовить кэш репозиториев (${repoCount})`}
                  </Button>
                  {!opencode?.config?.workspaceRoot && (
                    <Button variant="outline" className="border-2" asChild>
                      <Link to={`/p/${currentProject.slug}/settings`}>Задать корень workspace</Link>
                    </Button>
                  )}
                </div>
              </CardContent>
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
