import { useEffect, useState } from 'react';
import {
  CheckCircle,
  AlertTriangle,
  Clock,
  Activity,
  GitPullRequest,
  ListTodo,
  ArrowRight,
  RefreshCw,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useProject } from '@/contexts/ProjectContext';
import { IntegrationBadge } from '@/components/IntegrationBadge';
import { StatusChip } from '@/components/StatusChip';
import { Task, TaskEvent } from '@/types';
import { apiFetch } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';

type OverviewResponse = {
  stats: {
    activeTasks: number;
    prOpen: number;
    successRate: number | null;
    avgCycleTimeDays: number | null;
  };
  recentTasks: Task[];
  recentEvents: TaskEvent[];
  integrations: { asana: boolean; github: boolean; opencode: boolean };
};

export function OverviewPage() {
  const { currentProject } = useProject();
  const { toast } = useToast();
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const canEdit = currentProject?.role === 'editor' || currentProject?.role === 'admin';

  useEffect(() => {
    if (!currentProject) return;
    setIsLoading(true);
    apiFetch<OverviewResponse>(`/projects/${encodeURIComponent(currentProject.slug)}/overview`)
      .then((res) => setData(res))
      .finally(() => setIsLoading(false));
  }, [currentProject]);

  if (!currentProject) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Выберите проект, чтобы увидеть обзор</p>
      </div>
    );
  }

  const stats = data?.stats || {
    activeTasks: 0,
    prOpen: 0,
    successRate: null,
    avgCycleTimeDays: null,
  };

  const statCards = [
    { label: 'Активные задачи', value: stats.activeTasks, icon: ListTodo, trend: 'Открытые элементы пайплайна' },
    { label: 'Открытые PR', value: stats.prOpen, icon: GitPullRequest, trend: 'Ожидание ревью или CI' },
    {
      label: 'Успешность',
      value: stats.successRate !== null ? `${stats.successRate}%` : '—',
      icon: CheckCircle,
      trend: 'Задеплоено vs ошибка',
    },
    {
      label: 'Средний цикл',
      value: stats.avgCycleTimeDays !== null ? `${stats.avgCycleTimeDays}д` : '—',
      icon: Clock,
      trend: 'Создано → задеплоено',
    },
  ];

  const handleSync = async () => {
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{currentProject.name}</h1>
          <p className="text-muted-foreground">{currentProject.slug}</p>
        </div>
        <Button className="shadow-sm" onClick={handleSync} disabled={isLoading || !canEdit}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Синхронизировать из Asana
        </Button>
      </div>

      <Card className="border-2 border-border">
        <CardHeader>
          <CardTitle className="text-base font-medium">Статус интеграций</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <IntegrationBadge type="asana" connected={!!data?.integrations.asana} />
            <IntegrationBadge type="github" connected={!!data?.integrations.github} />
            <IntegrationBadge type="opencode" connected={!!data?.integrations.opencode} />
          </div>
          {data && (!data.integrations.asana || !data.integrations.github) && (
            <div className="mt-4 p-3 bg-chart-4/10 border-2 border-chart-4/30 flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-chart-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-sm">Настройка не завершена</p>
                <p className="text-sm text-muted-foreground">
                  Подключите все интеграции, чтобы включить полную автоматизацию.{' '}
                  <Link to={`/p/${currentProject.slug}/settings`} className="underline hover:text-foreground">
                    Открыть настройки →
                  </Link>
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => (
          <Card key={stat.label} className="border-2 border-border">
            <CardContent className="pt-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                  <p className="text-3xl font-bold mt-1">{stat.value}</p>
                  <p className="text-xs text-muted-foreground mt-1">{stat.trend}</p>
                </div>
                <div className="h-10 w-10 border-2 border-border bg-accent flex items-center justify-center">
                  <stat.icon className="h-5 w-5" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-2 border-border">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base font-medium">Последние задачи</CardTitle>
            <Link to={`/p/${currentProject.slug}/tasks`}>
              <Button variant="ghost" size="sm">
                Все задачи <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {(data?.recentTasks || []).map((task) => (
                <Link
                  key={task.id}
                  to={`/p/${currentProject.slug}/tasks/${task.id}`}
                  className="flex items-center justify-between p-3 border-2 border-border hover:bg-accent transition-colors"
                >
                  <span className="font-medium text-sm truncate flex-1 mr-4">{task.title}</span>
                  <StatusChip status={task.status} />
                </Link>
              ))}
              {!data?.recentTasks?.length && (
                <div className="text-sm text-muted-foreground">Пока нет задач.</div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-2 border-border">
          <CardHeader>
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Последняя активность
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {(data?.recentEvents || []).map((event) => (
                <div key={event.id} className="flex items-start gap-3">
                  <div className="h-2 w-2 bg-primary mt-2 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm">
                      {event.message || event.type}
                      {event.taskTitle ? ` · ${event.taskTitle}` : ''}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(event.createdAt).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
              {!data?.recentEvents?.length && (
                <div className="text-sm text-muted-foreground">Пока нет активности.</div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
