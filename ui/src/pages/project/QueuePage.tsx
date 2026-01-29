import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Filter, Layers, CircleDot } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useProject } from '@/contexts/ProjectContext';
import { apiFetch } from '@/lib/api';

type JobRow = {
  id: string;
  status: string;
  kind: string;
  provider: string;
  attempts: number;
  maxAttempts: number;
  nextRunAt: string;
  lockedAt: string | null;
  lockedBy: string | null;
  lastError: string | null;
  createdAt: string;
};

const statusLabel: Record<string, string> = {
  pending: 'В очереди',
  processing: 'В работе',
  done: 'Готово',
  failed: 'Ошибка',
};

export function QueuePage() {
  const { currentProject } = useProject();
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [providerFilter, setProviderFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [onlyErrors, setOnlyErrors] = useState(false);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [hasMore, setHasMore] = useState(false);
  const [providers, setProviders] = useState<string[]>([]);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);

  useEffect(() => {
    if (!currentProject) return;
    void refreshData();
    const timer = setInterval(() => void refreshData(), 15000);
    return () => clearInterval(timer);
  }, [currentProject, statusFilter, providerFilter, query, onlyErrors, page, pageSize]);

  useEffect(() => {
    setPage(0);
  }, [statusFilter, providerFilter, query, onlyErrors, pageSize]);

  const refreshData = async () => {
    if (!currentProject) return;
    setLoading(true);
    try {
      const effectiveStatus = onlyErrors ? 'failed' : statusFilter === 'all' ? '' : statusFilter;
      const params = new URLSearchParams();
      params.set('limit', String(pageSize));
      params.set('offset', String(page * pageSize));
      if (effectiveStatus) params.set('status', effectiveStatus);
      if (providerFilter !== 'all') params.set('provider', providerFilter);
      if (query.trim()) params.set('query', query.trim());
      const res = await apiFetch<{ jobs: JobRow[]; hasMore: boolean; providers: string[] }>(
        `/projects/${encodeURIComponent(currentProject.slug)}/job-queue?${params.toString()}`,
      );
      setJobs(res.jobs);
      setHasMore(res.hasMore);
      setProviders(res.providers ?? []);
      setLastUpdatedAt(new Date());
    } finally {
      setLoading(false);
    }
  };

  const grouped = useMemo(() => {
    const buckets = new Map<string, JobRow[]>();
    for (const job of jobs) {
      const list = buckets.get(job.status) ?? [];
      list.push(job);
      buckets.set(job.status, list);
    }
    return buckets;
  }, [jobs]);

  if (!currentProject) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Очередь</h1>
          <p className="text-muted-foreground">Фоновые задачи проекта и статус обработки.</p>
          <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
            <CircleDot className="h-3 w-3 text-emerald-500" />
            Live · {lastUpdatedAt ? `Обновлено ${lastUpdatedAt.toLocaleTimeString()}` : 'обновляем…'}
          </div>
        </div>
        <Button variant="outline" className="border-2" onClick={refreshData} disabled={loading}>
          <RefreshCw className={loading ? 'mr-2 h-4 w-4 animate-spin' : 'mr-2 h-4 w-4'} />
          Обновить
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[200px] border-2" disabled={onlyErrors}>
            <SelectValue placeholder="Статус" />
          </SelectTrigger>
          <SelectContent className="border-2 border-border bg-popover">
            <SelectItem value="all">Все</SelectItem>
            <SelectItem value="pending">В очереди</SelectItem>
            <SelectItem value="processing">В работе</SelectItem>
            <SelectItem value="done">Готово</SelectItem>
            <SelectItem value="failed">Ошибка</SelectItem>
          </SelectContent>
        </Select>
        <Select value={providerFilter} onValueChange={setProviderFilter}>
          <SelectTrigger className="w-[200px] border-2">
            <SelectValue placeholder="Provider" />
          </SelectTrigger>
          <SelectContent className="border-2 border-border bg-popover">
            <SelectItem value="all">Все провайдеры</SelectItem>
            {providers.map((provider) => (
              <SelectItem key={provider} value={provider}>
                {provider}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск по типу"
          className="w-[220px] border-2"
        />
        <Button
          variant={onlyErrors ? 'default' : 'outline'}
          className="border-2"
          onClick={() => setOnlyErrors((prev) => !prev)}
        >
          Только ошибки
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">Страница {page + 1}</span>
        <Button variant="outline" className="border-2" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
          Назад
        </Button>
        <Button variant="outline" className="border-2" disabled={!hasMore} onClick={() => setPage((p) => p + 1)}>
          Вперед
        </Button>
        <Select value={String(pageSize)} onValueChange={(value) => setPageSize(Number(value))}>
          <SelectTrigger className="w-[140px] border-2">
            <SelectValue placeholder="Размер" />
          </SelectTrigger>
          <SelectContent className="border-2 border-border bg-popover">
            <SelectItem value="10">10 / стр</SelectItem>
            <SelectItem value="20">20 / стр</SelectItem>
            <SelectItem value="50">50 / стр</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-6">
        {Array.from(grouped.entries()).map(([status, items]) => (
          <div key={status} className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Layers className="h-4 w-4 text-muted-foreground" />
              {statusLabel[status] || status} · {items.length}
            </div>
            {items.map((job) => (
              <Card key={job.id} className="border-2 border-border">
                <CardContent className="p-4">
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-medium">{job.kind}</div>
                      <Badge className="bg-muted text-muted-foreground border-border">
                        {statusLabel[job.status] || job.status}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Provider: {job.provider} · Attempts: {job.attempts}/{job.maxAttempts}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Created: {new Date(job.createdAt).toLocaleString()} · Next: {new Date(job.nextRunAt).toLocaleString()}
                    </div>
                    {job.lockedAt && (
                      <div className="text-xs text-muted-foreground">
                        Locked: {new Date(job.lockedAt).toLocaleString()} · {job.lockedBy || 'unknown'}
                      </div>
                    )}
                    {job.lastError && <div className="text-xs text-destructive">{job.lastError}</div>}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ))}
        {!jobs.length && (
          <div className="text-center py-8 border-2 border-dashed border-border">
            <p className="text-muted-foreground">Очередь пуста.</p>
          </div>
        )}
      </div>
    </div>
  );
}
