import { useEffect, useState } from 'react';
import {
  Key,
  GitBranch,
  Settings2,
  Map,
  Database,
  KeyRound,
  BookOpen,
  Link as LinkIcon,
  Plus,
  Trash2,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useProject } from '@/contexts/ProjectContext';
import { useToast } from '@/hooks/use-toast';
import { apiFetch } from '@/lib/api';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

type SettingsData = {
  secrets: { asanaPat: boolean; githubToken: boolean; githubWebhookSecret: boolean; opencodeWorkdir: boolean };
  secretErrors?: Array<{ key: string; message: string }>;
  opencode: {
    mode: string;
    authMode: string;
    logMode: string;
    localCliReady: boolean;
    command: string;
    prTimeoutMinutes: number;
    model: string;
    workspaceRoot: string | null;
    policy: { writeMode: string; denyPaths: string[]; maxFilesChanged: number | null };
    warnings?: Array<{ key: string; message: string }>;
  };
  asanaFields: { workspace_gid: string | null; auto_field_gid: string | null; repo_field_gid: string | null; status_field_gid: string | null } | null;
  statusMap: Array<{ option_name: string; mapped_status: string }>;
  repoMap: Array<{ option_name: string; owner: string; repo: string }>;
  asanaProjects: string[];
  repos: Array<{ owner: string; repo: string; is_default: boolean }>;
  links: Array<{ id: string; kind: string; url: string; title: string | null; tags: string | null }>;
  contacts: Array<{ id: string; role: string; name: string | null; handle: string | null }>;
  apiTokens: Array<{ id: string; name: string | null; createdAt: string; lastUsedAt: string | null; revokedAt: string | null; tokenHash: string }>;
  knowledge: string | null;
};

const settingsSections = [
  { id: 'secrets', label: 'Секреты', icon: Key },
  { id: 'opencode', label: 'OpenCode', icon: Settings2 },
  { id: 'asana-fields', label: 'Поля Asana', icon: Settings2 },
  { id: 'asana-projects', label: 'Проекты Asana', icon: Database },
  { id: 'status-mapping', label: 'Сопоставление статусов', icon: Map },
  { id: 'repo-mapping', label: 'Сопоставление репозиториев', icon: Database },
  { id: 'repos', label: 'Репозитории', icon: GitBranch },
  { id: 'api-tokens', label: 'API токены', icon: KeyRound },
  { id: 'knowledge', label: 'База знаний', icon: BookOpen },
  { id: 'links', label: 'Контакты и ссылки', icon: LinkIcon },
];

export function SettingsPage() {
  const { currentProject } = useProject();
  const { toast } = useToast();
  const [activeSection, setActiveSection] = useState('secrets');
  const [settings, setSettings] = useState<SettingsData | null>(null);

  const [secretsForm, setSecretsForm] = useState({ asana_pat: '', github_token: '', github_webhook_secret: '', opencode_workdir: '' });
  const [asanaFieldForm, setAsanaFieldForm] = useState({ workspace_gid: '', auto_field_gid: '', repo_field_gid: '', status_field_gid: '' });
  const [asanaDetectSample, setAsanaDetectSample] = useState('');
  const [statusMapForm, setStatusMapForm] = useState({ option_name: '', mapped_status: '' });
  const [repoMapForm, setRepoMapForm] = useState({ option_name: '', owner: '', repo: '' });
  const [asanaProjectForm, setAsanaProjectForm] = useState('');
  const [repoForm, setRepoForm] = useState({ owner: '', repo: '', is_default: false });
  const [tokenName, setTokenName] = useState('');
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [knowledge, setKnowledge] = useState('');
  const [contactForm, setContactForm] = useState({ role: '', name: '', handle: '' });
  const [linkForm, setLinkForm] = useState({ kind: '', title: '', url: '', tags: '' });
  const [opencodeForm, setOpencodeForm] = useState({
    mode: 'github-actions',
    authMode: 'oauth',
    logMode: 'safe',
    localCliReady: false,
    command: '/opencode implement',
    prTimeoutMinutes: '60',
    model: 'openai/gpt-4o-mini',
    workspaceRoot: '',
    writeMode: 'pr_only',
    maxFilesChanged: '',
    denyPaths: '',
  });

  const canManage = currentProject?.role === 'admin';

  const refresh = async () => {
    if (!currentProject) return;
    const res = await apiFetch<SettingsData>(`/projects/${encodeURIComponent(currentProject.slug)}/settings`);
    setSettings(res);
    setKnowledge(res.knowledge || '');
    setAsanaFieldForm({
      workspace_gid: res.asanaFields?.workspace_gid || '',
      auto_field_gid: res.asanaFields?.auto_field_gid || '',
      repo_field_gid: res.asanaFields?.repo_field_gid || '',
      status_field_gid: res.asanaFields?.status_field_gid || '',
    });
    setOpencodeForm({
      mode: res.opencode.mode,
      authMode: res.opencode.authMode,
      logMode: res.opencode.logMode,
      localCliReady: res.opencode.localCliReady,
      command: res.opencode.command,
      prTimeoutMinutes: String(res.opencode.prTimeoutMinutes),
      model: res.opencode.model,
      workspaceRoot: res.opencode.workspaceRoot || '',
      writeMode: res.opencode.policy.writeMode,
      maxFilesChanged: res.opencode.policy.maxFilesChanged ? String(res.opencode.policy.maxFilesChanged) : '',
      denyPaths: res.opencode.policy.denyPaths.join('\n'),
    });
  };

  useEffect(() => {
    if (!currentProject) return;
    void refresh();
  }, [currentProject]);

  if (!currentProject) return null;

  const submitSecrets = async () => {
    if (!canManage) return;
    try {
      await apiFetch(`/projects/${encodeURIComponent(currentProject.slug)}/settings/secrets`, {
        method: 'POST',
        body: secretsForm,
      });
      toast({ title: 'Секреты сохранены', description: 'Секреты проекта обновлены.' });
      setSecretsForm({ asana_pat: '', github_token: '', github_webhook_secret: '', opencode_workdir: '' });
      await refresh();
    } catch (err: any) {
      toast({ title: 'Ошибка сохранения', description: err?.message || 'Не удалось сохранить секреты.', variant: 'destructive' });
    }
  };

  const submitOpencode = async () => {
    if (!canManage) return;
    try {
      await apiFetch(`/projects/${encodeURIComponent(currentProject.slug)}/settings/opencode`, {
        method: 'POST',
        body: {
          opencode_mode: opencodeForm.mode,
          opencode_command: opencodeForm.command,
          opencode_pr_timeout_min: opencodeForm.prTimeoutMinutes,
          opencode_model: opencodeForm.model,
          opencode_workspace_root: opencodeForm.workspaceRoot,
          opencode_log_mode: opencodeForm.logMode,
          opencode_auth_mode: opencodeForm.authMode,
          opencode_local_cli_ready: opencodeForm.localCliReady ? '1' : '',
          opencode_policy_write_mode: opencodeForm.writeMode,
          opencode_policy_max_files_changed: opencodeForm.maxFilesChanged,
          opencode_policy_deny_paths: opencodeForm.denyPaths,
        },
      });
      toast({ title: 'OpenCode сохранен', description: 'Настройки раннера обновлены.' });
      await refresh();
    } catch (err: any) {
      toast({ title: 'Ошибка сохранения', description: err?.message || 'Не удалось сохранить настройки OpenCode.', variant: 'destructive' });
    }
  };

  const resetBrokenSecrets = async () => {
    if (!canManage || !currentProject || !settings) return;
    const keys = Array.from(
      new Set([
        ...(settings.secretErrors?.map((e) => e.key) ?? []),
        ...(settings.opencode?.warnings?.map((e) => e.key) ?? []),
      ]),
    );
    if (!keys.length) {
      toast({ title: 'Нет поврежденных секретов', description: 'Нечего сбрасывать.' });
      return;
    }
    if (!window.confirm(`Сбросить ${keys.length} секрет(ов)? Это очистит их.`)) return;
    try {
      await apiFetch(`/projects/${encodeURIComponent(currentProject.slug)}/settings/secrets/reset`, {
        method: 'POST',
        body: { keys },
      });
      toast({ title: 'Секреты сброшены', description: 'Пересохраните затронутые секреты.' });
      await refresh();
    } catch (err: any) {
      toast({ title: 'Ошибка сброса', description: err?.message || 'Не удалось сбросить секреты.', variant: 'destructive' });
    }
  };

  const repairBrokenSecrets = async () => {
    if (!canManage || !currentProject) return;
    if (!window.confirm('Исправить секреты? Поврежденные значения будут очищены.')) return;
    try {
      const res = await apiFetch<{ result: { repaired: string[]; cleared: string[]; failed: Array<{ key: string; message: string }> } }>(
        `/projects/${encodeURIComponent(currentProject.slug)}/settings/secrets/repair`,
        { method: 'POST' },
      );
      const repaired = res.result.repaired?.length ?? 0;
      const cleared = res.result.cleared?.length ?? 0;
      const failed = res.result.failed?.length ?? 0;
      toast({
        title: 'Секреты восстановлены',
        description: `Исправлено: ${repaired}, очищено: ${cleared}, ошибки: ${failed}. Пересохраните очищенные секреты.`,
      });
      await refresh();
    } catch (err: any) {
      toast({ title: 'Ошибка восстановления', description: err?.message || 'Не удалось восстановить секреты.', variant: 'destructive' });
    }
  };

  const submitAsanaFields = async () => {
    if (!canManage) return;
    try {
      await apiFetch(`/projects/${encodeURIComponent(currentProject.slug)}/settings/asana-fields`, {
        method: 'POST',
        body: asanaFieldForm,
      });
      toast({ title: 'Поля Asana сохранены', description: 'Конфигурация кастомных полей обновлена.' });
      await refresh();
    } catch (err: any) {
      toast({ title: 'Ошибка сохранения', description: err?.message || 'Не удалось сохранить поля.', variant: 'destructive' });
    }
  };

  const detectAsanaFields = async () => {
    if (!canManage || !asanaDetectSample.trim()) return;
    try {
      const res = await apiFetch(`/projects/${encodeURIComponent(currentProject.slug)}/settings/asana-fields/detect`, {
        method: 'POST',
        body: { sample_task_gid: asanaDetectSample.trim() },
      });
      toast({ title: 'Обнаружение завершено', description: res.ok ? 'Поля обнаружены.' : 'Некоторые поля не найдены.' });
      await refresh();
    } catch (err: any) {
      toast({ title: 'Ошибка обнаружения', description: err?.message || 'Не удалось определить поля.', variant: 'destructive' });
    }
  };

  const addStatusMap = async () => {
    if (!canManage) return;
    try {
      await apiFetch(`/projects/${encodeURIComponent(currentProject.slug)}/settings/asana-status-map`, {
        method: 'POST',
        body: statusMapForm,
      });
      setStatusMapForm({ option_name: '', mapped_status: '' });
      await refresh();
    } catch (err: any) {
      toast({ title: 'Ошибка добавления', description: err?.message || 'Не удалось добавить сопоставление.', variant: 'destructive' });
    }
  };

  const deleteStatusMap = async (optionName: string) => {
    if (!canManage) return;
    await apiFetch(`/projects/${encodeURIComponent(currentProject.slug)}/settings/asana-status-map/${encodeURIComponent(optionName)}`, {
      method: 'DELETE',
    });
    await refresh();
  };

  const addRepoMap = async () => {
    if (!canManage) return;
    await apiFetch(`/projects/${encodeURIComponent(currentProject.slug)}/settings/repo-map`, {
      method: 'POST',
      body: repoMapForm,
    });
    setRepoMapForm({ option_name: '', owner: '', repo: '' });
    await refresh();
  };

  const deleteRepoMap = async (optionName: string) => {
    if (!canManage) return;
    await apiFetch(`/projects/${encodeURIComponent(currentProject.slug)}/settings/repo-map/${encodeURIComponent(optionName)}`, {
      method: 'DELETE',
    });
    await refresh();
  };

  const addAsanaProject = async () => {
    if (!canManage || !asanaProjectForm.trim()) return;
    await apiFetch(`/projects/${encodeURIComponent(currentProject.slug)}/asana-projects`, {
      method: 'POST',
      body: { asana_project_gid: asanaProjectForm.trim() },
    });
    setAsanaProjectForm('');
    await refresh();
  };

  const removeAsanaProject = async (gid: string) => {
    if (!canManage) return;
    await apiFetch(`/projects/${encodeURIComponent(currentProject.slug)}/asana-projects/${encodeURIComponent(gid)}`, { method: 'DELETE' });
    await refresh();
  };

  const addRepo = async () => {
    if (!canManage || !repoForm.owner.trim() || !repoForm.repo.trim()) return;
    await apiFetch(`/projects/${encodeURIComponent(currentProject.slug)}/repos`, {
      method: 'POST',
      body: { owner: repoForm.owner.trim(), repo: repoForm.repo.trim(), is_default: repoForm.is_default },
    });
    setRepoForm({ owner: '', repo: '', is_default: false });
    await refresh();
  };

  const removeRepo = async (owner: string, repo: string) => {
    if (!canManage) return;
    await apiFetch(`/projects/${encodeURIComponent(currentProject.slug)}/repos`, {
      method: 'DELETE',
      body: { owner, repo },
    });
    await refresh();
  };

  const setDefaultRepo = async (owner: string, repo: string) => {
    if (!canManage) return;
    await apiFetch(`/projects/${encodeURIComponent(currentProject.slug)}/repos/default`, {
      method: 'POST',
      body: { owner, repo },
    });
    await refresh();
  };

  const createApiToken = async () => {
    if (!canManage) return;
    const res = await apiFetch<{ token: string }>(`/projects/${encodeURIComponent(currentProject.slug)}/api-tokens`, {
      method: 'POST',
      body: { name: tokenName.trim() },
    });
    setCreatedToken(res.token);
    setTokenName('');
    await refresh();
  };

  const revokeToken = async (id: string) => {
    if (!canManage) return;
    await apiFetch(`/projects/${encodeURIComponent(currentProject.slug)}/api-tokens/${encodeURIComponent(id)}`, { method: 'DELETE' });
    await refresh();
  };

  const saveKnowledge = async () => {
    if (!canManage) return;
    await apiFetch(`/projects/${encodeURIComponent(currentProject.slug)}/knowledge`, {
      method: 'PUT',
      body: { markdown: knowledge },
    });
    toast({ title: 'База знаний сохранена', description: 'Контекст проекта обновлен.' });
  };

  const addContact = async () => {
    if (!canManage || !contactForm.role.trim()) return;
    await apiFetch(`/projects/${encodeURIComponent(currentProject.slug)}/contacts`, {
      method: 'POST',
      body: contactForm,
    });
    setContactForm({ role: '', name: '', handle: '' });
    await refresh();
  };

  const deleteContact = async (id: string) => {
    if (!canManage) return;
    await apiFetch(`/projects/${encodeURIComponent(currentProject.slug)}/contacts/${encodeURIComponent(id)}`, { method: 'DELETE' });
    await refresh();
  };

  const addLink = async () => {
    if (!canManage || !linkForm.kind.trim() || !linkForm.url.trim()) return;
    await apiFetch(`/projects/${encodeURIComponent(currentProject.slug)}/links`, {
      method: 'POST',
      body: linkForm,
    });
    setLinkForm({ kind: '', title: '', url: '', tags: '' });
    await refresh();
  };

  const deleteLink = async (id: string) => {
    if (!canManage) return;
    await apiFetch(`/projects/${encodeURIComponent(currentProject.slug)}/links/${encodeURIComponent(id)}`, { method: 'DELETE' });
    await refresh();
  };

  const renderSection = () => {
    if (!settings) {
      return (
        <Card className="border-2 border-border">
          <CardContent className="py-12 text-center text-muted-foreground">Загрузка настроек...</CardContent>
        </Card>
      );
    }

    switch (activeSection) {
      case 'secrets':
        return (
          <Card className="border-2 border-border">
            <CardHeader>
              <CardTitle>Секреты проекта</CardTitle>
              <CardDescription>Зашифрованные переменные окружения</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Asana PAT</Label>
                  <Input
                    type="password"
                    value={secretsForm.asana_pat}
                    onChange={(e) => setSecretsForm((p) => ({ ...p, asana_pat: e.target.value }))}
                    placeholder={settings.secrets.asanaPat ? '••••••••' : 'вставьте токен'}
                    className="border-2"
                  />
                </div>
                <div className="space-y-2">
                  <Label>GitHub Token</Label>
                  <Input
                    type="password"
                    value={secretsForm.github_token}
                    onChange={(e) => setSecretsForm((p) => ({ ...p, github_token: e.target.value }))}
                    placeholder={settings.secrets.githubToken ? '••••••••' : 'вставьте токен'}
                    className="border-2"
                  />
                </div>
                <div className="space-y-2">
                  <Label>GitHub Webhook Secret</Label>
                  <Input
                    type="password"
                    value={secretsForm.github_webhook_secret}
                    onChange={(e) => setSecretsForm((p) => ({ ...p, github_webhook_secret: e.target.value }))}
                    placeholder={settings.secrets.githubWebhookSecret ? '••••••••' : 'секрет'}
                    className="border-2"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Рабочая директория OpenCode</Label>
                  <Input
                    value={secretsForm.opencode_workdir}
                    onChange={(e) => setSecretsForm((p) => ({ ...p, opencode_workdir: e.target.value }))}
                    placeholder="/Users/.../repo"
                    className="border-2"
                  />
                </div>
              </div>
              {canManage && <Button onClick={submitSecrets}>Сохранить секреты</Button>}
            </CardContent>
          </Card>
        );

      case 'opencode':
        return (
          <Card className="border-2 border-border">
            <CardHeader>
              <CardTitle>OpenCode Runner</CardTitle>
              <CardDescription>Настройка запуска OpenCode для проекта</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Режим</Label>
                  <Select value={opencodeForm.mode} onValueChange={(value) => setOpencodeForm((p) => ({ ...p, mode: value }))}>
                    <SelectTrigger className="border-2">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="border-2 border-border bg-popover">
                      <SelectItem value="github-actions">github-actions</SelectItem>
                      <SelectItem value="server-runner">server-runner</SelectItem>
                      <SelectItem value="off">off</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Режим авторизации</Label>
                  <Select value={opencodeForm.authMode} onValueChange={(value) => setOpencodeForm((p) => ({ ...p, authMode: value }))}>
                    <SelectTrigger className="border-2">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="border-2 border-border bg-popover">
                      <SelectItem value="oauth">oauth</SelectItem>
                      <SelectItem value="local-cli">local-cli</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Режим записи</Label>
                  <Select value={opencodeForm.writeMode} onValueChange={(value) => setOpencodeForm((p) => ({ ...p, writeMode: value }))}>
                    <SelectTrigger className="border-2">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="border-2 border-border bg-popover">
                      <SelectItem value="pr_only">pr_only</SelectItem>
                      <SelectItem value="working_tree">working_tree</SelectItem>
                      <SelectItem value="read_only">read_only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Режим логов</Label>
                  <Select value={opencodeForm.logMode} onValueChange={(value) => setOpencodeForm((p) => ({ ...p, logMode: value }))}>
                    <SelectTrigger className="border-2">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="border-2 border-border bg-popover">
                      <SelectItem value="safe">safe (фильтрованные)</SelectItem>
                      <SelectItem value="raw">raw (без фильтра)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Показывает stdout/stderr. Внутренние рассуждения скрыты.</p>
                </div>
                <div className="space-y-2">
                  <Label>Комментарий‑триггер</Label>
                  <Input
                    value={opencodeForm.command}
                    onChange={(e) => setOpencodeForm((p) => ({ ...p, command: e.target.value }))}
                    className="border-2"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Таймаут PR (мин)</Label>
                  <Input
                    value={opencodeForm.prTimeoutMinutes}
                    onChange={(e) => setOpencodeForm((p) => ({ ...p, prTimeoutMinutes: e.target.value }))}
                    className="border-2"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Модель</Label>
                  <Input
                    value={opencodeForm.model}
                    onChange={(e) => setOpencodeForm((p) => ({ ...p, model: e.target.value }))}
                    className="border-2"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Корень workspace</Label>
                  <Input
                    value={opencodeForm.workspaceRoot}
                    onChange={(e) => setOpencodeForm((p) => ({ ...p, workspaceRoot: e.target.value }))}
                    className="border-2"
                  />
                </div>
                <div className="flex items-center gap-3">
                  <Switch
                    checked={opencodeForm.localCliReady}
                    onCheckedChange={(value) => setOpencodeForm((p) => ({ ...p, localCliReady: value }))}
                  />
                  <Label>Local CLI готов</Label>
                </div>
                <div className="space-y-2">
                  <Label>Макс. измененных файлов</Label>
                  <Input
                    value={opencodeForm.maxFilesChanged}
                    onChange={(e) => setOpencodeForm((p) => ({ ...p, maxFilesChanged: e.target.value }))}
                    className="border-2"
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Запрещенные пути</Label>
                  <Textarea
                    value={opencodeForm.denyPaths}
                    onChange={(e) => setOpencodeForm((p) => ({ ...p, denyPaths: e.target.value }))}
                    className="border-2"
                  />
                </div>
              </div>
              {canManage && <Button onClick={submitOpencode}>Сохранить OpenCode</Button>}
            </CardContent>
          </Card>
        );

      case 'asana-fields':
        return (
          <Card className="border-2 border-border">
            <CardHeader>
              <CardTitle>Кастомные поля Asana</CardTitle>
              <CardDescription>Workspace и GID кастомных полей</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>GID workspace</Label>
                  <Input
                    value={asanaFieldForm.workspace_gid}
                    onChange={(e) => setAsanaFieldForm((p) => ({ ...p, workspace_gid: e.target.value }))}
                    className="border-2"
                  />
                </div>
                <div className="space-y-2">
                  <Label>GID поля Auto</Label>
                  <Input
                    value={asanaFieldForm.auto_field_gid}
                    onChange={(e) => setAsanaFieldForm((p) => ({ ...p, auto_field_gid: e.target.value }))}
                    className="border-2"
                  />
                </div>
                <div className="space-y-2">
                  <Label>GID поля Repo (enum)</Label>
                  <Input
                    value={asanaFieldForm.repo_field_gid}
                    onChange={(e) => setAsanaFieldForm((p) => ({ ...p, repo_field_gid: e.target.value }))}
                    className="border-2"
                  />
                </div>
                <div className="space-y-2">
                  <Label>GID поля статуса (enum)</Label>
                  <Input
                    value={asanaFieldForm.status_field_gid}
                    onChange={(e) => setAsanaFieldForm((p) => ({ ...p, status_field_gid: e.target.value }))}
                    className="border-2"
                  />
                </div>
              </div>
              {canManage && <Button onClick={submitAsanaFields}>Сохранить поля</Button>}

              <div className="pt-4 border-t border-border">
                <Label>Автоопределение по ссылке задачи/проекта</Label>
                <div className="flex gap-2 mt-2">
                  <Input
                    value={asanaDetectSample}
                    onChange={(e) => setAsanaDetectSample(e.target.value)}
                    placeholder="https://app.asana.com/0/PROJECT/TASK"
                    className="border-2"
                  />
                  {canManage && (
                    <Button variant="outline" className="border-2" onClick={detectAsanaFields}>
                      Определить
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        );

      case 'asana-projects':
        return (
          <Card className="border-2 border-border">
            <CardHeader>
              <CardTitle>Проекты Asana</CardTitle>
              <CardDescription>GID проектов для синхронизации</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  value={asanaProjectForm}
                  onChange={(e) => setAsanaProjectForm(e.target.value)}
                  placeholder="123456..."
                  className="border-2"
                />
                {canManage && <Button onClick={addAsanaProject}>Добавить</Button>}
              </div>
              <div className="space-y-2">
                {settings.asanaProjects.map((gid) => (
                  <div key={gid} className="flex items-center justify-between p-3 border-2 border-border">
                    <span className="font-mono text-sm">{gid}</span>
                    {canManage && (
                      <Button variant="ghost" size="icon" className="text-destructive" onClick={() => removeAsanaProject(gid)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
                {!settings.asanaProjects.length && <div className="text-sm text-muted-foreground">Нет проектов Asana.</div>}
              </div>
            </CardContent>
          </Card>
        );

      case 'status-mapping':
        return (
          <Card className="border-2 border-border">
            <CardHeader>
              <CardTitle>Сопоставление статусов</CardTitle>
              <CardDescription>Опция Asana → статус</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2 sm:grid-cols-2">
                <Input
                  value={statusMapForm.option_name}
                  onChange={(e) => setStatusMapForm((p) => ({ ...p, option_name: e.target.value }))}
                  placeholder="Отменено"
                  className="border-2"
                />
                <Input
                  value={statusMapForm.mapped_status}
                  onChange={(e) => setStatusMapForm((p) => ({ ...p, mapped_status: e.target.value }))}
                  placeholder="CANCELLED"
                  className="border-2"
                />
              </div>
              {canManage && <Button onClick={addStatusMap}>Добавить сопоставление</Button>}
              <div className="space-y-2">
                {settings.statusMap.map((m) => (
                  <div key={m.option_name} className="flex items-center justify-between p-3 border-2 border-border">
                    <div>
                      <div className="font-medium">{m.option_name}</div>
                      <div className="text-xs text-muted-foreground">{m.mapped_status}</div>
                    </div>
                    {canManage && (
                      <Button variant="ghost" size="icon" className="text-destructive" onClick={() => deleteStatusMap(m.option_name)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
                {!settings.statusMap.length && <div className="text-sm text-muted-foreground">Сопоставлений пока нет.</div>}
              </div>
            </CardContent>
          </Card>
        );

      case 'repo-mapping':
        return (
          <Card className="border-2 border-border">
            <CardHeader>
              <CardTitle>Сопоставление репозиториев</CardTitle>
              <CardDescription>Переопределение опции Asana → owner/repo</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2 sm:grid-cols-3">
                <Input
                  value={repoMapForm.option_name}
                  onChange={(e) => setRepoMapForm((p) => ({ ...p, option_name: e.target.value }))}
                  placeholder="Frontend"
                  className="border-2"
                />
                <Input
                  value={repoMapForm.owner}
                  onChange={(e) => setRepoMapForm((p) => ({ ...p, owner: e.target.value }))}
                  placeholder="my-org"
                  className="border-2"
                />
                <Input
                  value={repoMapForm.repo}
                  onChange={(e) => setRepoMapForm((p) => ({ ...p, repo: e.target.value }))}
                  placeholder="frontend-repo"
                  className="border-2"
                />
              </div>
              {canManage && <Button onClick={addRepoMap}>Добавить переопределение</Button>}
              <div className="space-y-2">
                {settings.repoMap.map((m) => (
                  <div key={m.option_name} className="flex items-center justify-between p-3 border-2 border-border">
                    <div>
                      <div className="font-medium">{m.option_name}</div>
                      <div className="text-xs text-muted-foreground">{m.owner}/{m.repo}</div>
                    </div>
                    {canManage && (
                      <Button variant="ghost" size="icon" className="text-destructive" onClick={() => deleteRepoMap(m.option_name)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
                {!settings.repoMap.length && <div className="text-sm text-muted-foreground">Переопределений нет.</div>}
              </div>
            </CardContent>
          </Card>
        );

      case 'repos':
        return (
          <Card className="border-2 border-border">
            <CardHeader>
              <CardTitle>Подключенные репозитории</CardTitle>
              <CardDescription>GitHub репозитории, связанные с проектом</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2 sm:grid-cols-3">
                <Input
                  value={repoForm.owner}
                  onChange={(e) => setRepoForm((p) => ({ ...p, owner: e.target.value }))}
                  placeholder="owner"
                  className="border-2"
                />
                <Input
                  value={repoForm.repo}
                  onChange={(e) => setRepoForm((p) => ({ ...p, repo: e.target.value }))}
                  placeholder="repo"
                  className="border-2"
                />
                <div className="flex items-center gap-2">
                  <Switch
                    checked={repoForm.is_default}
                    onCheckedChange={(value) => setRepoForm((p) => ({ ...p, is_default: value }))}
                  />
                  <Label>По умолчанию</Label>
                </div>
              </div>
              {canManage && <Button onClick={addRepo}>Добавить репозиторий</Button>}

              <div className="space-y-2">
                {settings.repos.map((repo) => (
                  <div key={`${repo.owner}/${repo.repo}`} className="flex items-center justify-between p-3 border-2 border-border">
                    <div>
                      <div className="font-medium">{repo.owner}/{repo.repo}</div>
                      <div className="text-xs text-muted-foreground">{repo.is_default ? 'по умолчанию' : 'дополнительный'}</div>
                    </div>
                    {canManage && (
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" className="border-2" onClick={() => setDefaultRepo(repo.owner, repo.repo)}>
                          Сделать по умолчанию
                        </Button>
                        <Button variant="ghost" size="icon" className="text-destructive" onClick={() => removeRepo(repo.owner, repo.repo)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
                {!settings.repos.length && <div className="text-sm text-muted-foreground">Репозиториев нет.</div>}
              </div>
            </CardContent>
          </Card>
        );

      case 'api-tokens':
        return (
          <Card className="border-2 border-border">
            <CardHeader>
              <CardTitle>API токены</CardTitle>
              <CardDescription>Bearer токены на уровне проекта</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {createdToken && (
                <div className="p-3 border-2 border-border bg-muted">
                  <div className="text-xs text-muted-foreground">Токен создан (показывается один раз)</div>
                  <div className="font-mono text-sm break-all mt-2">{createdToken}</div>
                </div>
              )}
              <div className="flex gap-2">
                <Input
                  value={tokenName}
                  onChange={(e) => setTokenName(e.target.value)}
                    placeholder="Название токена (необязательно)"
                  className="border-2"
                />
                {canManage && <Button onClick={createApiToken}>Создать</Button>}
              </div>
              <div className="space-y-2">
                {settings.apiTokens.map((t) => (
                  <div key={t.id} className="flex items-center justify-between p-3 border-2 border-border">
                    <div>
                      <div className="font-medium">{t.name || '(без имени)'}</div>
                      <div className="text-xs text-muted-foreground">{t.tokenHash.slice(0, 10)}...</div>
                    </div>
                    {canManage && !t.revokedAt && (
                      <Button variant="ghost" size="icon" className="text-destructive" onClick={() => revokeToken(t.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
                {!settings.apiTokens.length && <div className="text-sm text-muted-foreground">Токенов пока нет.</div>}
              </div>
            </CardContent>
          </Card>
        );

      case 'knowledge':
        return (
          <Card className="border-2 border-border">
            <CardHeader>
              <CardTitle>База знаний</CardTitle>
              <CardDescription>Контекст и документация для AI помощника</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                value={knowledge}
                onChange={(e) => setKnowledge(e.target.value)}
                className="border-2 min-h-48"
                disabled={!canManage}
              />
              {canManage && <Button onClick={saveKnowledge}>Сохранить изменения</Button>}
            </CardContent>
          </Card>
        );

      case 'links':
        return (
          <div className="space-y-6">
            <Card className="border-2 border-border">
              <CardHeader>
                <CardTitle>Контакты</CardTitle>
                <CardDescription>Контакты команды и точки эскалации</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-2 sm:grid-cols-3">
                  <Input
                    value={contactForm.role}
                    onChange={(e) => setContactForm((p) => ({ ...p, role: e.target.value }))}
                    placeholder="Роль"
                    className="border-2"
                  />
                  <Input
                    value={contactForm.name}
                    onChange={(e) => setContactForm((p) => ({ ...p, name: e.target.value }))}
                    placeholder="Имя"
                    className="border-2"
                  />
                  <Input
                    value={contactForm.handle}
                    onChange={(e) => setContactForm((p) => ({ ...p, handle: e.target.value }))}
                    placeholder="Контакт"
                    className="border-2"
                  />
                </div>
                {canManage && <Button onClick={addContact}>Добавить контакт</Button>}
                <div className="space-y-2">
                  {settings.contacts.map((c) => (
                    <div key={c.id} className="flex items-center justify-between p-3 border-2 border-border">
                      <div>
                        <div className="font-medium">{c.role}</div>
                        <div className="text-xs text-muted-foreground">{c.name || ''} {c.handle || ''}</div>
                      </div>
                      {canManage && (
                        <Button variant="ghost" size="icon" className="text-destructive" onClick={() => deleteContact(c.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                  {!settings.contacts.length && <div className="text-sm text-muted-foreground">Контактов нет.</div>}
                </div>
              </CardContent>
            </Card>

            <Card className="border-2 border-border">
              <CardHeader>
                <CardTitle>Ссылки</CardTitle>
                <CardDescription>Документы, дашборды, runbooks</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-2 sm:grid-cols-2">
                  <Input
                    value={linkForm.kind}
                    onChange={(e) => setLinkForm((p) => ({ ...p, kind: e.target.value }))}
                    placeholder="Тип"
                    className="border-2"
                  />
                  <Input
                    value={linkForm.title}
                    onChange={(e) => setLinkForm((p) => ({ ...p, title: e.target.value }))}
                    placeholder="Название"
                    className="border-2"
                  />
                  <Input
                    value={linkForm.url}
                    onChange={(e) => setLinkForm((p) => ({ ...p, url: e.target.value }))}
                    placeholder="URL"
                    className="border-2"
                  />
                  <Input
                    value={linkForm.tags}
                    onChange={(e) => setLinkForm((p) => ({ ...p, tags: e.target.value }))}
                    placeholder="Теги"
                    className="border-2"
                  />
                </div>
                {canManage && <Button onClick={addLink}>Добавить ссылку</Button>}
                <div className="space-y-2">
                  {settings.links.map((l) => (
                    <div key={l.id} className="flex items-center justify-between p-3 border-2 border-border">
                      <div>
                        <div className="font-medium">{l.kind} · {l.title || l.url}</div>
                        <div className="text-xs text-muted-foreground">{l.url}</div>
                      </div>
                      {canManage && (
                        <Button variant="ghost" size="icon" className="text-destructive" onClick={() => deleteLink(l.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                  {!settings.links.length && <div className="text-sm text-muted-foreground">Ссылок нет.</div>}
                </div>
              </CardContent>
            </Card>
          </div>
        );

      default:
        return (
          <Card className="border-2 border-border">
          <CardContent className="py-12 text-center text-muted-foreground">Раздел не найден.</CardContent>
          </Card>
        );
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Настройки</h1>
          <p className="text-muted-foreground">Настройка проекта и интеграций</p>
        </div>
        <Button variant="outline" className="border-2" onClick={refresh}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Обновить
        </Button>
      </div>

      {(settings?.secretErrors?.length || settings?.opencode?.warnings?.length) && (
        <Card className="border-2 border-destructive">
          <CardHeader>
            <CardTitle>Предупреждения конфигурации</CardTitle>
            <CardDescription>Некоторые секреты не удалось расшифровать. Пересохраните их.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {settings?.secretErrors?.map((err, idx) => (
              <div key={`secret-${idx}`} className="text-destructive">
                Секрет {err.key}: {err.message}
              </div>
            ))}
            {settings?.opencode?.warnings?.map((err, idx) => (
              <div key={`oc-${idx}`} className="text-destructive">
                OpenCode {err.key}: {err.message}
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={repairBrokenSecrets}>Исправить секреты</Button>
              <Button variant="destructive" onClick={resetBrokenSecrets}>Сбросить секреты</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-4">
        <Card className="border-2 border-border lg:col-span-1 h-fit">
          <CardContent className="p-2">
            <nav className="space-y-1">
              {settingsSections.map((section) => (
                <button
                  key={section.id}
                  onClick={() => setActiveSection(section.id)}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors text-left ${
                    activeSection === section.id ? 'bg-accent font-medium' : 'hover:bg-muted'
                  }`}
                >
                  <section.icon className="h-4 w-4" />
                  {section.label}
                </button>
              ))}
            </nav>
          </CardContent>
        </Card>

        <div className="lg:col-span-3">{renderSection()}</div>
      </div>
    </div>
  );
}
