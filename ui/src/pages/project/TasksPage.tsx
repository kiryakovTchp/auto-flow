import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Search,
  Plus,
  Filter,
  ArrowUpDown,
  ExternalLink,
  MoreHorizontal,
  Play,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { StatusChip } from '@/components/StatusChip';
import { Task, TaskStatus } from '@/types';
import { useProject } from '@/contexts/ProjectContext';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { apiFetch } from '@/lib/api';

const statusFilters: TaskStatus[] = [
  'RECEIVED',
  'TASKSPEC_CREATED',
  'NEEDS_REPO',
  'AUTO_DISABLED',
  'CANCELLED',
  'BLOCKED',
  'ISSUE_CREATED',
  'PR_CREATED',
  'WAITING_CI',
  'DEPLOYED',
  'FAILED',
];

const statusLabels: Record<TaskStatus, string> = {
  RECEIVED: 'Получено',
  TASKSPEC_CREATED: 'Спека создана',
  NEEDS_REPO: 'Нужен репозиторий',
  AUTO_DISABLED: 'Авто отключено',
  CANCELLED: 'Отменено',
  BLOCKED: 'Заблокировано',
  ISSUE_CREATED: 'Issue создан',
  PR_CREATED: 'PR создан',
  WAITING_CI: 'Ожидание CI',
  DEPLOYED: 'Задеплоено',
  FAILED: 'Ошибка',
};

export function TasksPage() {
  const { currentProject } = useProject();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortOrder, setSortOrder] = useState('updated_desc');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [asanaProjects, setAsanaProjects] = useState<string[]>([]);
  const [repos, setRepos] = useState<Array<{ owner: string; repo: string }>>([]);
  const [newTask, setNewTask] = useState({ title: '', notes: '', repo: '', asanaProjectGid: '', autoEnabled: true });

  const canEdit = currentProject?.role === 'editor' || currentProject?.role === 'admin';

  useEffect(() => {
    if (!currentProject) return;
    setIsLoading(true);
    const statusParam = statusFilter !== 'all' ? `?status=${encodeURIComponent(statusFilter)}` : '';
    apiFetch<{ tasks: Task[] }>(`/projects/${encodeURIComponent(currentProject.slug)}/tasks${statusParam}`)
      .then((res) => setTasks(res.tasks))
      .finally(() => setIsLoading(false));
  }, [currentProject, statusFilter]);

  useEffect(() => {
    if (!currentProject || !isCreateOpen) return;
    apiFetch(`/projects/${encodeURIComponent(currentProject.slug)}/settings`).then((res: any) => {
      setAsanaProjects(res.asanaProjects || []);
      setRepos(res.repos || []);
      setNewTask((prev) => ({
        ...prev,
        asanaProjectGid: res.asanaProjects?.[0] || '',
      }));
    });
  }, [currentProject, isCreateOpen]);

  const filteredTasks = useMemo(() => {
    const filtered = tasks.filter((task) => task.title.toLowerCase().includes(searchQuery.toLowerCase()));
    const getTime = (value: string) => {
      const time = new Date(value).getTime();
      return Number.isFinite(time) ? time : 0;
    };
    return [...filtered].sort((a, b) => {
      switch (sortOrder) {
        case 'updated_asc':
          return getTime(a.updatedAt) - getTime(b.updatedAt);
        case 'created_desc':
          return getTime(b.createdAt) - getTime(a.createdAt);
        case 'created_asc':
          return getTime(a.createdAt) - getTime(b.createdAt);
        case 'updated_desc':
        default:
          return getTime(b.updatedAt) - getTime(a.updatedAt);
      }
    });
  }, [tasks, searchQuery, sortOrder]);

  const runOpenCode = async (taskId: string) => {
    if (!currentProject) return;
    try {
      await apiFetch(`/projects/${encodeURIComponent(currentProject.slug)}/tasks/${taskId}/actions/opencode-run`, {
        method: 'POST',
      });
      toast({ title: 'OpenCode запущен', description: 'Запуск поставлен в очередь или комментарий опубликован.' });
    } catch (err: any) {
      toast({ title: 'Ошибка запуска', description: err?.message || 'Не удалось запустить OpenCode.', variant: 'destructive' });
    }
  };

  const resyncTask = async (taskId: string) => {
    if (!currentProject) return;
    try {
      await apiFetch(`/projects/${encodeURIComponent(currentProject.slug)}/tasks/${taskId}/actions/resync`, {
        method: 'POST',
      });
      toast({ title: 'Пересинхронизация запущена', description: 'Задача будет повторно синхронизирована из Asana.' });
    } catch (err: any) {
      toast({ title: 'Ошибка синхронизации', description: err?.message || 'Не удалось пересинхронизировать задачу.', variant: 'destructive' });
    }
  };

  const syncFromAsana = async () => {
    if (!currentProject) return;
    try {
      await apiFetch(`/projects/${encodeURIComponent(currentProject.slug)}/import/asana`, {
        method: 'POST',
        body: { days: 90 },
      });
      toast({ title: 'Синхронизация запущена', description: 'Импортируем задачи из Asana.' });
    } catch (err: any) {
      toast({ title: 'Ошибка синхронизации', description: err?.message || 'Не удалось синхронизировать задачи.', variant: 'destructive' });
    }
  };

  const handleCreateTask = async () => {
    if (!currentProject || !newTask.title.trim()) return;
    try {
      await apiFetch(`/projects/${encodeURIComponent(currentProject.slug)}/tasks`, {
        method: 'POST',
        body: {
          title: newTask.title.trim(),
          notes: newTask.notes.trim(),
          repo: newTask.repo || undefined,
          asana_project_gid: newTask.asanaProjectGid || undefined,
          auto_enabled: newTask.autoEnabled,
        },
      });
      toast({ title: 'Задача создана', description: 'Задача создана в Asana и пайплайн запущен.' });
      setIsCreateOpen(false);
      setNewTask({ title: '', notes: '', repo: '', asanaProjectGid: '', autoEnabled: true });
      if (currentProject) {
        const res = await apiFetch<{ tasks: Task[] }>(`/projects/${encodeURIComponent(currentProject.slug)}/tasks`);
        setTasks(res.tasks);
      }
    } catch (err: any) {
      toast({ title: 'Ошибка создания', description: err?.message || 'Не удалось создать задачу.', variant: 'destructive' });
    }
  };

  const isFiltered = Boolean(searchQuery.trim()) || statusFilter !== 'all';

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Задачи</h1>
          <p className="text-muted-foreground">{filteredTasks.length} задач</p>
        </div>
        {canEdit && (
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button className="shadow-sm">
                <Plus className="h-4 w-4 mr-2" />
                Создать задачу
              </Button>
            </DialogTrigger>
            <DialogContent className="border-2 border-border">
              <DialogHeader>
                <DialogTitle>Создать задачу в Asana</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label htmlFor="title">Название</Label>
                  <Input
                    id="title"
                    value={newTask.title}
                    onChange={(e) => setNewTask((prev) => ({ ...prev, title: e.target.value }))}
                    placeholder="Исправить выравнивание кнопки входа"
                    className="border-2"
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Проект Asana</Label>
                    <Select
                      value={newTask.asanaProjectGid}
                      onValueChange={(value) => setNewTask((prev) => ({ ...prev, asanaProjectGid: value }))}
                    >
                      <SelectTrigger className="border-2">
                        <SelectValue placeholder="Выберите проект Asana" />
                      </SelectTrigger>
                      <SelectContent className="border-2 border-border bg-popover">
                        {asanaProjects.map((gid) => (
                          <SelectItem key={gid} value={gid}>
                            {gid}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Репозиторий (необязательно)</Label>
                    <Select
                      value={newTask.repo}
                      onValueChange={(value) => setNewTask((prev) => ({ ...prev, repo: value }))}
                    >
                      <SelectTrigger className="border-2">
                        <SelectValue placeholder="Выберите репозиторий" />
                      </SelectTrigger>
                      <SelectContent className="border-2 border-border bg-popover">
                        <SelectItem value="">(нет)</SelectItem>
                        {repos.map((r) => {
                          const v = `${r.owner}/${r.repo}`;
                          return (
                            <SelectItem key={v} value={v}>
                              {v}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="notes">Описание (необязательно)</Label>
                  <Textarea
                    id="notes"
                    value={newTask.notes}
                    onChange={(e) => setNewTask((prev) => ({ ...prev, notes: e.target.value }))}
                    placeholder="Дополнительные детали задачи..."
                    className="border-2"
                  />
                </div>
                <Button onClick={handleCreateTask} className="w-full shadow-sm">
                  Создать задачу
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Card className="border-2 border-border">
        <CardContent className="pt-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Поиск задач..."
                className="pl-10 border-2"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-48 border-2">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Фильтр по статусу" />
              </SelectTrigger>
              <SelectContent className="border-2 border-border bg-popover">
                <SelectItem value="all">Все статусы</SelectItem>
                {statusFilters.map((status) => (
                  <SelectItem key={status} value={status}>
                    {statusLabels[status]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={sortOrder} onValueChange={setSortOrder}>
              <SelectTrigger className="w-full sm:w-56 border-2">
                <ArrowUpDown className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Сортировка" />
              </SelectTrigger>
              <SelectContent className="border-2 border-border bg-popover">
                <SelectItem value="updated_desc">Обновление: новые</SelectItem>
                <SelectItem value="updated_asc">Обновление: старые</SelectItem>
                <SelectItem value="created_desc">Создание: новые</SelectItem>
                <SelectItem value="created_asc">Создание: старые</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-2">
        {filteredTasks.map((task) => (
          <Link key={task.id} to={`/p/${currentProject?.slug}/tasks/${task.id}`} className="block">
            <Card className="border-2 border-border hover:shadow-sm transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="font-mono text-xs text-muted-foreground">#{task.id}</span>
                      <StatusChip status={task.status} />
                    </div>
                    <h3 className="font-medium truncate">{task.title}</h3>
                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                      <span>Обновлено {new Date(task.updatedAt).toLocaleDateString()}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {task.githubPrUrl && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.preventDefault();
                          window.open(task.githubPrUrl || '', '_blank');
                        }}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    )}

                    {canEdit && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.preventDefault()}>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="border-2 border-border bg-popover">
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.preventDefault();
                              runOpenCode(task.id);
                            }}
                          >
                            <Play className="h-4 w-4 mr-2" />
                            Запустить OpenCode
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.preventDefault();
                              resyncTask(task.id);
                            }}
                          >
                            <RefreshCw className="h-4 w-4 mr-2" />
                            Пересинхронизировать
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {isLoading && (
        <div className="text-center py-12 border-2 border-dashed border-border">
          <p className="text-muted-foreground">Загрузка задач...</p>
        </div>
      )}

      {!isLoading && filteredTasks.length === 0 && (
        <div className="text-center py-12 border-2 border-dashed border-border">
          <p className="text-muted-foreground">
            {isFiltered ? 'Нет задач по выбранным фильтрам' : 'Задач пока нет.'}
          </p>
          {!isFiltered && (
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              {canEdit && (
                <>
                  <Button onClick={syncFromAsana} className="shadow-sm">
                    Синхронизировать из Asana
                  </Button>
                  <Button variant="outline" className="border-2" onClick={() => setIsCreateOpen(true)}>
                    Создать задачу
                  </Button>
                </>
              )}
              {!canEdit && (
                <span className="text-xs text-muted-foreground">Обратитесь к администратору или проверьте интеграции.</span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
