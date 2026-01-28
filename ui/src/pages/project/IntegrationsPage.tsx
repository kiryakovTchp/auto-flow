import { useEffect, useState } from 'react';
import { Link, CheckCircle, XCircle, Settings, RefreshCw } from 'lucide-react';
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
  config: { authMode: 'oauth' | 'local-cli'; localCliReady: boolean };
  webConfig: { url: string | null; embedEnabled: boolean; enabled: boolean };
};

export function IntegrationsPage() {
  const { currentProject } = useProject();
  const { toast } = useToast();
  const [settings, setSettings] = useState<SettingsResponse | null>(null);
  const [opencode, setOpencode] = useState<OpenCodeResponse | null>(null);
  const canManage = currentProject?.role === 'admin';

  useEffect(() => {
    if (!currentProject) return;
    apiFetch<SettingsResponse>(`/projects/${encodeURIComponent(currentProject.slug)}/settings`).then(setSettings);
    apiFetch<OpenCodeResponse>(`/projects/${encodeURIComponent(currentProject.slug)}/integrations/opencode`).then(setOpencode);
  }, [currentProject]);

  if (!currentProject) return null;

  const asanaConnected = Boolean(settings?.secrets.asanaPat && settings?.asanaProjects?.length);
  const githubConnected = Boolean(settings?.secrets.githubToken && settings?.repos?.length);
  const opencodeConnected = opencode?.status === 'connected';
  const opencodeAuthMode = opencode?.config?.authMode ?? 'oauth';

  const connectOpenCode = async () => {
    if (!currentProject) return;
    try {
      const res = await apiFetch<{ authorizeUrl: string }>(
        `/projects/${encodeURIComponent(currentProject.slug)}/integrations/opencode/connect`,
        { method: 'POST' },
      );
      window.location.href = res.authorizeUrl;
    } catch (err: any) {
      toast({ title: 'Connect failed', description: err?.message || 'Could not start OAuth.', variant: 'destructive' });
    }
  };

  const disconnectOpenCode = async () => {
    if (!currentProject) return;
    try {
      await apiFetch(`/projects/${encodeURIComponent(currentProject.slug)}/integrations/opencode/disconnect`, { method: 'POST' });
      toast({ title: 'Disconnected', description: 'OpenCode integration removed.' });
      const res = await apiFetch<OpenCodeResponse>(`/projects/${encodeURIComponent(currentProject.slug)}/integrations/opencode`);
      setOpencode(res);
    } catch (err: any) {
      toast({ title: 'Disconnect failed', description: err?.message || 'Could not disconnect.', variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Integrations</h1>
        <p className="text-muted-foreground">Connect and manage external services</p>
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
                      <span className="text-xs bg-chart-2/20 text-chart-2 px-2 py-0.5 border border-chart-2/30">Connected</span>
                    )}
                  </CardTitle>
                  <CardDescription>Sync tasks and status from Asana</CardDescription>
                </div>
                <Button variant="outline" className="border-2" asChild>
                  <Link to={`/p/${currentProject.slug}/settings`}>Open Settings</Link>
                </Button>
              </div>
            </CardHeader>
            {asanaConnected ? (
              <CardContent className="space-y-3">
                <div className="text-sm text-muted-foreground">
                  {settings?.asanaProjects?.length || 0} Asana project(s) connected.
                </div>
                <Button variant="outline" className="border-2" asChild>
                  <Link to={`/p/${currentProject.slug}/webhooks`}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Manage Webhooks
                  </Link>
                </Button>
              </CardContent>
            ) : (
              <CardContent>
                <EmptyState
                  icon={Settings}
                  title="Asana not configured"
                  description="Add ASANA_PAT and project GIDs in Settings to enable sync."
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
                      <span className="text-xs bg-chart-2/20 text-chart-2 px-2 py-0.5 border border-chart-2/30">Connected</span>
                    )}
                  </CardTitle>
                  <CardDescription>Create issues and track pull requests</CardDescription>
                </div>
                <Button variant="outline" className="border-2" asChild>
                  <Link to={`/p/${currentProject.slug}/settings`}>Open Settings</Link>
                </Button>
              </div>
            </CardHeader>
            {githubConnected ? (
              <CardContent>
                <div className="text-sm text-muted-foreground">{settings?.repos?.length || 0} repositories connected.</div>
              </CardContent>
            ) : (
              <CardContent>
                <EmptyState
                  icon={Settings}
                  title="GitHub not configured"
                  description="Add GITHUB_TOKEN and repository list in Settings."
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
                      <span className="text-xs bg-chart-2/20 text-chart-2 px-2 py-0.5 border border-chart-2/30">Connected</span>
                    )}
                  </CardTitle>
                  <CardDescription>AI-powered code generation and automation</CardDescription>
                </div>
                {canManage && (
                  opencodeConnected ? (
                    <Button variant="outline" className="border-2" onClick={disconnectOpenCode}>
                      Disconnect
                    </Button>
                  ) : opencodeAuthMode === 'local-cli' ? (
                    <Button variant="outline" className="border-2" asChild>
                      <Link to={`/p/${currentProject.slug}/settings`}>Open Settings</Link>
                    </Button>
                  ) : (
                    <Button onClick={connectOpenCode} className="shadow-xs">
                      Connect
                    </Button>
                  )
                )}
              </div>
            </CardHeader>
            {!opencodeConnected && opencodeAuthMode === 'local-cli' && (
              <CardContent>
                <div className="text-sm text-muted-foreground">
                  OAuth is disabled. Run <span className="font-mono">opencode auth login</span> on the server and enable Local CLI Ready in Settings.
                </div>
              </CardContent>
            )}
            {!opencodeConnected && opencodeAuthMode !== 'local-cli' && (
              <CardContent>
                <EmptyState
                  icon={Settings}
                  title="OpenCode not connected"
                  description="Connect OpenCode to enable automated task execution."
                  action={canManage ? { label: 'Connect OpenCode', onClick: connectOpenCode } : undefined}
                />
              </CardContent>
            )}
            {opencodeConnected && opencode?.webConfig?.enabled && opencode.webConfig.url && (
              <CardContent>
                <Button variant="outline" className="border-2" asChild>
                  <a href={opencode.webConfig.url} target="_blank" rel="noreferrer">Open OpenCode Web UI</a>
                </Button>
              </CardContent>
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
