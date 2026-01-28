import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ExternalLink,
  Play,
  RefreshCw,
  GitBranch,
  MessageSquare,
  Clock,
  FileText,
  RotateCcw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { StatusChip } from '@/components/StatusChip';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useProject } from '@/contexts/ProjectContext';
import { Task, TaskEvent, TaskSpec } from '@/types';
import { apiFetch } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type TaskDetailResponse = {
  task: Task;
  latestSpec: TaskSpec | null;
  specs: TaskSpec[];
  events: TaskEvent[];
};

export function TaskDetailPage() {
  const { taskId } = useParams();
  const { currentProject } = useProject();
  const { toast } = useToast();
  const [data, setData] = useState<TaskDetailResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [repos, setRepos] = useState<Array<{ owner: string; repo: string }>>([]);
  const [note, setNote] = useState('');
  const [linkPr, setLinkPr] = useState({ pr: '', repo: '' });
  const [changeRepo, setChangeRepo] = useState('');
  const [createIssueRepo, setCreateIssueRepo] = useState('');

  const canEdit = currentProject?.role === 'editor' || currentProject?.role === 'admin';

  const load = async () => {
    if (!currentProject || !taskId) return;
    setIsLoading(true);
    try {
      const res = await apiFetch<TaskDetailResponse>(`/projects/${encodeURIComponent(currentProject.slug)}/tasks/${encodeURIComponent(taskId)}`);
      setData(res);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [currentProject, taskId]);

  useEffect(() => {
    if (!currentProject) return;
    apiFetch(`/projects/${encodeURIComponent(currentProject.slug)}/settings`).then((res: any) => {
      setRepos(res.repos || []);
      if (!createIssueRepo && res.repos?.[0]) {
        setCreateIssueRepo(`${res.repos[0].owner}/${res.repos[0].repo}`);
      }
    });
  }, [currentProject]);

  const repoOptions = useMemo(() => repos.map((r) => `${r.owner}/${r.repo}`), [repos]);

  if (!currentProject) {
    return null;
  }

  const task = data?.task;

  const runOpenCode = async () => {
    if (!taskId) return;
    try {
      await apiFetch(`/projects/${encodeURIComponent(currentProject.slug)}/tasks/${encodeURIComponent(taskId)}/actions/opencode-run`, {
        method: 'POST',
      });
      toast({ title: 'OpenCode triggered', description: 'Run queued or comment posted.' });
    } catch (err: any) {
      toast({ title: 'Run failed', description: err?.message || 'Could not start OpenCode.', variant: 'destructive' });
    }
  };

  const resync = async () => {
    if (!taskId) return;
    try {
      await apiFetch(`/projects/${encodeURIComponent(currentProject.slug)}/tasks/${encodeURIComponent(taskId)}/actions/resync`, {
        method: 'POST',
      });
      toast({ title: 'Resync started', description: 'Task will re-sync from Asana.' });
    } catch (err: any) {
      toast({ title: 'Resync failed', description: err?.message || 'Could not resync task.', variant: 'destructive' });
    }
  };

  const retry = async () => {
    if (!taskId) return;
    try {
      await apiFetch(`/projects/${encodeURIComponent(currentProject.slug)}/tasks/${encodeURIComponent(taskId)}/actions/retry`, {
        method: 'POST',
      });
      toast({ title: 'Retry started', description: 'Pipeline retried.' });
    } catch (err: any) {
      toast({ title: 'Retry failed', description: err?.message || 'Could not retry task.', variant: 'destructive' });
    }
  };

  const submitNote = async () => {
    if (!taskId || !note.trim()) return;
    try {
      await apiFetch(`/projects/${encodeURIComponent(currentProject.slug)}/tasks/${encodeURIComponent(taskId)}/actions/note`, {
        method: 'POST',
        body: { note: note.trim() },
      });
      setNote('');
      toast({ title: 'Note posted', description: 'Comment added to Asana.' });
      await load();
    } catch (err: any) {
      toast({ title: 'Note failed', description: err?.message || 'Could not post note.', variant: 'destructive' });
    }
  };

  const submitLinkPr = async () => {
    if (!taskId || !linkPr.pr.trim()) return;
    try {
      await apiFetch(`/projects/${encodeURIComponent(currentProject.slug)}/tasks/${encodeURIComponent(taskId)}/actions/force-pr`, {
        method: 'POST',
        body: { pr: linkPr.pr.trim(), repo: linkPr.repo || undefined },
      });
      setLinkPr({ pr: '', repo: '' });
      toast({ title: 'PR linked', description: 'Task updated with PR info.' });
      await load();
    } catch (err: any) {
      toast({ title: 'Link failed', description: err?.message || 'Could not link PR.', variant: 'destructive' });
    }
  };

  const submitChangeRepo = async () => {
    if (!taskId || !changeRepo) return;
    try {
      await apiFetch(`/projects/${encodeURIComponent(currentProject.slug)}/tasks/${encodeURIComponent(taskId)}/actions/change-repo`, {
        method: 'POST',
        body: { repo: changeRepo },
      });
      toast({ title: 'Repo updated', description: 'Repo updated in Asana.' });
      await load();
    } catch (err: any) {
      toast({ title: 'Change failed', description: err?.message || 'Could not change repo.', variant: 'destructive' });
    }
  };

  const submitCreateIssue = async () => {
    if (!taskId || !createIssueRepo) return;
    try {
      await apiFetch(`/projects/${encodeURIComponent(currentProject.slug)}/tasks/${encodeURIComponent(taskId)}/actions/create-issue`, {
        method: 'POST',
        body: { repo: createIssueRepo },
      });
      toast({ title: 'Issue creation started', description: 'Pipeline triggered after setting repo.' });
      await load();
    } catch (err: any) {
      toast({ title: 'Create issue failed', description: err?.message || 'Could not create issue.', variant: 'destructive' });
    }
  };

  if (isLoading && !task) {
    return (
      <div className="text-muted-foreground text-sm">Loading task...</div>
    );
  }

  if (!task) {
    return (
      <div className="text-muted-foreground text-sm">Task not found.</div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-4">
        <Link to={`/p/${currentProject.slug}/tasks`}>
          <Button variant="ghost" size="icon" className="shrink-0">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-2">
            <span className="font-mono text-sm text-muted-foreground">#{task.id}</span>
            <StatusChip status={task.status} />
          </div>
          <h1 className="text-2xl font-bold">{task.title}</h1>
          {task.lastError && (
            <p className="text-sm text-destructive mt-2">{task.lastError}</p>
          )}
        </div>
      </div>

      {canEdit && (
        <Card className="border-2 border-border">
          <CardContent className="pt-4">
            <div className="flex flex-wrap gap-2">
              <Button className="shadow-xs" onClick={runOpenCode}>
                <Play className="h-4 w-4 mr-2" />
                Run OpenCode
              </Button>
              <Button variant="outline" className="border-2" onClick={retry}>
                <RotateCcw className="h-4 w-4 mr-2" />
                Retry
              </Button>
              <Button variant="outline" className="border-2" onClick={resync}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Resync
              </Button>
              {task.status === 'NEEDS_REPO' && !task.githubIssueNumber && (
                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="outline" className="border-2">
                      <GitBranch className="h-4 w-4 mr-2" />
                      Create Issue
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="border-2 border-border">
                    <DialogHeader>
                      <DialogTitle>Create Issue</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3 pt-2">
                      <Label>Repository</Label>
                      <Select value={createIssueRepo} onValueChange={setCreateIssueRepo}>
                        <SelectTrigger className="border-2">
                          <SelectValue placeholder="Select repo" />
                        </SelectTrigger>
                        <SelectContent className="border-2 border-border bg-popover">
                          {repoOptions.map((v) => (
                            <SelectItem key={v} value={v}>
                              {v}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button onClick={submitCreateIssue} className="w-full">
                        Trigger Pipeline
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              )}
              {!task.githubIssueNumber && (
                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="outline" className="border-2">
                      <GitBranch className="h-4 w-4 mr-2" />
                      Change Repo
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="border-2 border-border">
                    <DialogHeader>
                      <DialogTitle>Change Repository</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3 pt-2">
                      <Label>Repository</Label>
                      <Select value={changeRepo} onValueChange={setChangeRepo}>
                        <SelectTrigger className="border-2">
                          <SelectValue placeholder="Select repo" />
                        </SelectTrigger>
                        <SelectContent className="border-2 border-border bg-popover">
                          {repoOptions.map((v) => (
                            <SelectItem key={v} value={v}>
                              {v}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button onClick={submitChangeRepo} className="w-full">
                        Update Repo
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              )}
              {task.githubIssueNumber && (
                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="outline" className="border-2">
                      <GitBranch className="h-4 w-4 mr-2" />
                      Link PR
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="border-2 border-border">
                    <DialogHeader>
                      <DialogTitle>Link PR</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3 pt-2">
                      <div className="space-y-2">
                        <Label>PR Number or URL</Label>
                        <Input
                          value={linkPr.pr}
                          onChange={(e) => setLinkPr((prev) => ({ ...prev, pr: e.target.value }))}
                          placeholder="123 or https://github.com/.../pull/123"
                          className="border-2"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Repository (optional)</Label>
                        <Select value={linkPr.repo} onValueChange={(value) => setLinkPr((prev) => ({ ...prev, repo: value }))}>
                          <SelectTrigger className="border-2">
                            <SelectValue placeholder="Use task/default" />
                          </SelectTrigger>
                          <SelectContent className="border-2 border-border bg-popover">
                            <SelectItem value="">(use task/default)</SelectItem>
                            {repoOptions.map((v) => (
                              <SelectItem key={v} value={v}>
                                {v}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <Button onClick={submitLinkPr} className="w-full">
                        Link PR
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              )}
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="outline" className="border-2">
                    <MessageSquare className="h-4 w-4 mr-2" />
                    Add Asana Note
                  </Button>
                </DialogTrigger>
                <DialogContent className="border-2 border-border">
                  <DialogHeader>
                    <DialogTitle>Post Note to Asana</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-3 pt-2">
                    <Textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Your comment..."
                      className="border-2"
                    />
                    <Button onClick={submitNote} className="w-full">
                      Post Note
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
              {task.githubPrUrl && (
                <Button variant="outline" className="border-2" onClick={() => window.open(task.githubPrUrl || '', '_blank')}>
                  <ExternalLink className="h-4 w-4 mr-2" />
                  View PR
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="spec">
        <TabsList className="border-2 border-border bg-transparent p-1 h-auto">
          <TabsTrigger
            value="spec"
            className="border-2 border-transparent data-[state=active]:border-border data-[state=active]:bg-accent"
          >
            <FileText className="h-4 w-4 mr-2" />
            Spec
          </TabsTrigger>
          <TabsTrigger
            value="timeline"
            className="border-2 border-transparent data-[state=active]:border-border data-[state=active]:bg-accent"
          >
            <Clock className="h-4 w-4 mr-2" />
            Timeline
          </TabsTrigger>
        </TabsList>

        <TabsContent value="spec" className="mt-4">
          <Card className="border-2 border-border">
            <CardHeader>
              <CardTitle className="text-base font-medium">Task Specification</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="prose prose-sm max-w-none">
                <pre className="bg-muted p-4 border-2 border-border text-sm whitespace-pre-wrap font-mono">
                  {data?.latestSpec?.content || 'No TaskSpec yet'}
                </pre>
              </div>
              {data?.latestSpec?.createdAt && (
                <p className="text-xs text-muted-foreground mt-4">
                  Generated {new Date(data.latestSpec.createdAt).toLocaleString()}
                </p>
              )}
              {data?.specs?.length ? (
                <div className="mt-4 space-y-2">
                  {data.specs.map((spec) => (
                    <details key={spec.id} className="border-2 border-border p-3">
                      <summary className="cursor-pointer text-sm font-medium">
                        v{spec.version} · {new Date(spec.createdAt).toLocaleString()}
                      </summary>
                      <pre className="bg-muted p-3 border-2 border-border text-sm whitespace-pre-wrap font-mono mt-2">
                        {spec.content}
                      </pre>
                    </details>
                  ))}
                </div>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="timeline" className="mt-4">
          <Card className="border-2 border-border">
            <CardHeader>
              <CardTitle className="text-base font-medium">Event Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {(data?.events || []).map((event, index) => (
                  <div key={event.id} className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <div className="h-3 w-3 bg-primary" />
                      {index < (data?.events?.length || 0) - 1 && <div className="w-0.5 flex-1 bg-border mt-1" />}
                    </div>
                    <div className="flex-1 pb-4">
                      <p className="font-medium text-sm">{event.message || event.type}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(event.createdAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))}
                {!data?.events?.length && <div className="text-sm text-muted-foreground">No activity yet.</div>}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Card className="border-2 border-border">
        <CardHeader>
          <CardTitle className="text-base font-medium">Links & References</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            {task.asanaTaskId && (
              <div className="p-3 border-2 border-border">
                <p className="text-xs text-muted-foreground mb-1">Asana Task</p>
                <span className="text-sm font-medium">{task.asanaTaskId}</span>
              </div>
            )}
            {task.githubIssueUrl && (
              <div className="p-3 border-2 border-border">
                <p className="text-xs text-muted-foreground mb-1">GitHub Issue</p>
                <a
                  href={task.githubIssueUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium hover:underline flex items-center gap-1"
                >
                  Issue #{task.githubIssueNumber}
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            )}
            {task.githubPrUrl && (
              <div className="p-3 border-2 border-border">
                <p className="text-xs text-muted-foreground mb-1">Pull Request</p>
                <a
                  href={task.githubPrUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium hover:underline flex items-center gap-1"
                >
                  PR #{task.githubPrNumber}
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
