import { useEffect, useState } from 'react';
import { CheckCircle, XCircle, Clock } from 'lucide-react';
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

  useEffect(() => {
    if (!currentProject) return;
    apiFetch<{ runs: RunRow[] }>(`/projects/${encodeURIComponent(currentProject.slug)}/runs`).then((res) => setRuns(res.runs));
  }, [currentProject]);

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
        return <Badge className="bg-chart-2/20 text-chart-2 border-chart-2/30">Success</Badge>;
      case 'running':
        return <Badge className="bg-chart-1/20 text-chart-1 border-chart-1/30">Running</Badge>;
      case 'failed':
        return <Badge className="bg-destructive/20 text-destructive border-destructive/30">Failed</Badge>;
      case 'queued':
        return <Badge className="bg-muted text-muted-foreground border-border">Queued</Badge>;
      default:
        return <Badge className="bg-muted text-muted-foreground border-border">Cancelled</Badge>;
    }
  };

  const loadLogs = async (runId: string) => {
    if (!currentProject) return;
    const res = await apiFetch<{ logs: Array<{ created_at: string; stream: string; message: string }> }>(
      `/projects/${encodeURIComponent(currentProject.slug)}/runs/${encodeURIComponent(runId)}`,
    );
    const logs = res.logs.map((l) => `[${l.created_at}] [${l.stream}] ${l.message}`).join('\n');
    setSelectedRun({ id: runId, logs: logs || 'No logs available.' });
  };

  if (!currentProject) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Runs</h1>
        <p className="text-muted-foreground">OpenCode execution history</p>
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
                        Task #{run.taskId}
                      </Link>
                    ) : (
                      <span className="font-medium">Run {run.id}</span>
                    )}
                    {getStatusBadge(run.status)}
                  </div>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span>Created {new Date(run.createdAt).toLocaleString()}</span>
                    {run.startedAt && <span>Started {new Date(run.startedAt).toLocaleString()}</span>}
                  </div>
                </div>
                <Dialog onOpenChange={(open) => open && loadLogs(run.id)}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm" className="border-2">
                      View Logs
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="border-2 border-border max-w-2xl">
                    <DialogHeader>
                      <DialogTitle>Run Logs</DialogTitle>
                    </DialogHeader>
                    <ScrollArea className="h-96 mt-4">
                      <pre className="bg-primary text-primary-foreground p-4 text-sm font-mono whitespace-pre-wrap">
                        {selectedRun?.id === run.id ? selectedRun.logs : 'Loading...'}
                      </pre>
                    </ScrollArea>
                  </DialogContent>
                </Dialog>
              </div>
            </CardContent>
          </Card>
        ))}
        {!runs.length && (
          <div className="text-center py-12 border-2 border-dashed border-border">
            <p className="text-muted-foreground">No runs yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}
