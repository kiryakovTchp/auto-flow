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

export function TasksPage() {
  const { currentProject } = useProject();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
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
    return tasks.filter((task) => task.title.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [tasks, searchQuery]);

  const runOpenCode = async (taskId: string) => {
    if (!currentProject) return;
    try {
      await apiFetch(`/projects/${encodeURIComponent(currentProject.slug)}/tasks/${taskId}/actions/opencode-run`, {
        method: 'POST',
      });
      toast({ title: 'OpenCode triggered', description: 'Run queued or comment posted.' });
    } catch (err: any) {
      toast({ title: 'Run failed', description: err?.message || 'Could not start OpenCode.', variant: 'destructive' });
    }
  };

  const resyncTask = async (taskId: string) => {
    if (!currentProject) return;
    try {
      await apiFetch(`/projects/${encodeURIComponent(currentProject.slug)}/tasks/${taskId}/actions/resync`, {
        method: 'POST',
      });
      toast({ title: 'Resync started', description: 'Task will re-sync from Asana.' });
    } catch (err: any) {
      toast({ title: 'Resync failed', description: err?.message || 'Could not resync task.', variant: 'destructive' });
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
      toast({ title: 'Task created', description: 'Asana task created and pipeline triggered.' });
      setIsCreateOpen(false);
      setNewTask({ title: '', notes: '', repo: '', asanaProjectGid: '', autoEnabled: true });
      if (currentProject) {
        const res = await apiFetch<{ tasks: Task[] }>(`/projects/${encodeURIComponent(currentProject.slug)}/tasks`);
        setTasks(res.tasks);
      }
    } catch (err: any) {
      toast({ title: 'Create failed', description: err?.message || 'Could not create task.', variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Tasks</h1>
          <p className="text-muted-foreground">{filteredTasks.length} tasks</p>
        </div>
        {canEdit && (
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button className="shadow-sm">
                <Plus className="h-4 w-4 mr-2" />
                Create Task
              </Button>
            </DialogTrigger>
            <DialogContent className="border-2 border-border">
              <DialogHeader>
                <DialogTitle>Create Task in Asana</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label htmlFor="title">Title</Label>
                  <Input
                    id="title"
                    value={newTask.title}
                    onChange={(e) => setNewTask((prev) => ({ ...prev, title: e.target.value }))}
                    placeholder="Fix login button alignment"
                    className="border-2"
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Asana Project</Label>
                    <Select
                      value={newTask.asanaProjectGid}
                      onValueChange={(value) => setNewTask((prev) => ({ ...prev, asanaProjectGid: value }))}
                    >
                      <SelectTrigger className="border-2">
                        <SelectValue placeholder="Select Asana project" />
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
                    <Label>Repository (optional)</Label>
                    <Select
                      value={newTask.repo}
                      onValueChange={(value) => setNewTask((prev) => ({ ...prev, repo: value }))}
                    >
                      <SelectTrigger className="border-2">
                        <SelectValue placeholder="Select repo" />
                      </SelectTrigger>
                      <SelectContent className="border-2 border-border bg-popover">
                        <SelectItem value="">(none)</SelectItem>
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
                  <Label htmlFor="notes">Notes (optional)</Label>
                  <Textarea
                    id="notes"
                    value={newTask.notes}
                    onChange={(e) => setNewTask((prev) => ({ ...prev, notes: e.target.value }))}
                    placeholder="Additional task details..."
                    className="border-2"
                  />
                </div>
                <Button onClick={handleCreateTask} className="w-full shadow-sm">
                  Create Task
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
                placeholder="Search tasks..."
                className="pl-10 border-2"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-48 border-2">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent className="border-2 border-border bg-popover">
                <SelectItem value="all">All Statuses</SelectItem>
                {statusFilters.map((status) => (
                  <SelectItem key={status} value={status}>
                    {status.replace('_', ' ')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" className="border-2">
              <ArrowUpDown className="h-4 w-4 mr-2" />
              Sort
            </Button>
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
                      <span>Updated {new Date(task.updatedAt).toLocaleDateString()}</span>
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
                            Run OpenCode
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.preventDefault();
                              resyncTask(task.id);
                            }}
                          >
                            <RefreshCw className="h-4 w-4 mr-2" />
                            Resync
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
          <p className="text-muted-foreground">Loading tasks...</p>
        </div>
      )}

      {!isLoading && filteredTasks.length === 0 && (
        <div className="text-center py-12 border-2 border-dashed border-border">
          <p className="text-muted-foreground">No tasks match your filters</p>
        </div>
      )}
    </div>
  );
}
