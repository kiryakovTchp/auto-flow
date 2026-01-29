import { useEffect, useState } from 'react';
import { CheckCircle, XCircle, Clock, Download } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useProject } from '@/contexts/ProjectContext';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { apiFetch } from '@/lib/api';

type RunRow = {
  id: string;
  status: 'queued' | 'running' | 'success' | 'failed' | 'cancelled';
  createdAt: string;
  startedAt?: string | null;
  finishedAt?: string | null;
  outputSummary?: string | null;
  taskId?: string | null;
};

export function RunsPage() {
  const { currentProject } = useProject();
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [selectedRun, setSelectedRun] = useState<{ id: string; logs: string } | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!currentProject) return;
    void refreshRuns();
    const timer = setInterval(() => void refreshRuns(), 15000);
    return () => clearInterval(timer);
  }, [currentProject]);

  const refreshRuns = async () => {
    if (!currentProject) return;
    setRefreshing(true);
    const runsRes = await apiFetch<{ runs: RunRow[] }>(`/projects/${encodeURIComponent(currentProject.slug)}/runs`);
    setRuns(runsRes.runs);
    setRefreshing(false);
  };

  const cancelRun = async (runId: string) => {
    if (!currentProject) return;
    if (!window.confirm('Отменить этот запуск?')) return;
    await apiFetch(`/projects/${encodeURIComponent(currentProject.slug)}/runs/${encodeURIComponent(runId)}/cancel`, { method: 'POST' });
    await refreshRuns();
  };

  const exportLogs = async (runId: string) => {
    if (!currentProject) return;
    const res = await apiFetch<{ logs: Array<{ created_at: string; stream: string; message: string }> }>(
      `/projects/${encodeURIComponent(currentProject.slug)}/runs/${encodeURIComponent(runId)}`,
    );
    const content = res.logs.map((l) => `[${l.created_at}] [${l.stream}] ${l.message}`).join('\n');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `opencode-run-${runId}.log.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="h-4 w-4 text-chart-2" />;
      case 'running':
        return <Clock className="h-4 w-4 text-chart-1 animate-pulse" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-destructive" />;
      default:
        return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'success':
        return <Badge className="bg-chart-2/20 text-chart-2 border-chart-2/30">Успех</Badge>;
      case 'running':
        return <Badge className="bg-chart-1/20 text-chart-1 border-chart-1/30">В работе</Badge>;
      case 'failed':
        return <Badge className="bg-destructive/20 text-destructive border-destructive/30">Ошибка</Badge>;
      case 'queued':
        return <Badge className="bg-muted text-muted-foreground border-border">В очереди</Badge>;
      default:
        return <Badge className="bg-muted text-muted-foreground border-border">Отменено</Badge>;
    }
  };

  const loadLogs = async (runId: string) => {
    if (!currentProject) return;
    const res = await apiFetch<{ logs: Array<{ created_at: string; stream: string; message: string }> }>(
      `/projects/${encodeURIComponent(currentProject.slug)}/runs/${encodeURIComponent(runId)}`,
    );
    const logs = res.logs.map((l) => `[${l.created_at}] [${l.stream}] ${l.message}`).join('\n');
    setSelectedRun({ id: runId, logs: logs || 'Логи недоступны.' });
  };

  if (!currentProject) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Запуски</h1>
        <p className="text-muted-foreground">История запусков OpenCode</p>
      </div>

      <div className="flex justify-end">
        <Button variant="outline" className="border-2" onClick={refreshRuns} disabled={refreshing}>
          {refreshing ? 'Обновляем…' : 'Обновить'}
        </Button>
      </div>

      <div className="space-y-4">
        {runs.map((run) => (
          <Card key={run.id} className="border-2 border-border">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2">
                    {getStatusIcon(run.status)}
                    {run.taskId ? (
                      <Link to={`/p/${currentProject.slug}/tasks/${run.taskId}`} className="font-medium hover:underline">
                        Задача #{run.taskId}
                      </Link>
                    ) : (
                      <span className="font-medium">Запуск {run.id}</span>
                    )}
                    {getStatusBadge(run.status)}
                  </div>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span>Создано {new Date(run.createdAt).toLocaleString()}</span>
                    {run.startedAt && <span>Начато {new Date(run.startedAt).toLocaleString()}</span>}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(run.status === 'running' || run.status === 'queued') && (
                    <Button variant="destructive" size="sm" className="border-2" onClick={() => cancelRun(run.id)}>
                      Отменить
                    </Button>
                  )}
                  <Dialog onOpenChange={(open) => open && loadLogs(run.id)}>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm" className="border-2">
                        Логи
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="border-2 border-border max-w-2xl">
                      <DialogHeader>
                        <DialogTitle className="flex items-center justify-between gap-4">
                          Логи запуска
                          <Button variant="outline" size="sm" className="border-2" onClick={() => exportLogs(run.id)}>
                            <Download className="mr-2 h-4 w-4" />
                            Экспорт
                          </Button>
                        </DialogTitle>
                      </DialogHeader>
                      <ScrollArea className="h-96 mt-4">
                        <pre className="bg-primary text-primary-foreground p-4 text-sm font-mono whitespace-pre-wrap">
                          {selectedRun?.id === run.id ? selectedRun.logs : 'Загрузка...'}
                        </pre>
                      </ScrollArea>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        {!runs.length && (
          <div className="text-center py-12 border-2 border-dashed border-border">
            <p className="text-muted-foreground">Пока нет запусков.</p>
          </div>
        )}
      </div>
    </div>
  );
}
