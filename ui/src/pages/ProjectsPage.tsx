import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, FolderKanban, Users, Calendar, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { useProject } from '@/contexts/ProjectContext';
import { IntegrationBadge } from '@/components/IntegrationBadge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { apiFetch } from '@/lib/api';

export function ProjectsPage() {
  const { projects, setCurrentProject, refreshProjects, isLoading } = useProject();
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [inviteUrl, setInviteUrl] = useState('');
  const [newProject, setNewProject] = useState({ name: '', slug: '' });
  const { toast } = useToast();

  useEffect(() => {
    if (!projects.length) {
      void refreshProjects();
    }
  }, [projects.length, refreshProjects]);

  const filteredProjects = projects.filter(
    (p) =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.description || p.slug).toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleCreateProject = async () => {
    if (!newProject.name.trim() || !newProject.slug.trim()) return;
    try {
      await apiFetch('/projects', {
        method: 'POST',
        body: { name: newProject.name.trim(), slug: newProject.slug.trim() },
      });
      await refreshProjects();
      toast({
        title: 'Project Created',
        description: `${newProject.name} has been created successfully.`,
      });
      setIsCreateOpen(false);
      setNewProject({ name: '', slug: '' });
    } catch (err: any) {
      toast({
        title: 'Create failed',
        description: err?.message || 'Could not create project.',
        variant: 'destructive',
      });
    }
  };

  const handleCreateInvite = async () => {
    try {
      const data = await apiFetch<{ url: string }>('/invites', { method: 'POST' });
      setInviteUrl(data.url);
      setIsInviteOpen(true);
    } catch (err: any) {
      toast({
        title: 'Invite failed',
        description: err?.message || 'Could not create invite.',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="min-h-screen bg-background p-6 lg:p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold mb-2">Projects</h1>
            <p className="text-muted-foreground">
              Manage your orchestration projects
            </p>
          </div>
          
          <div className="flex items-center gap-2">
            <Button variant="outline" className="border-2" onClick={handleCreateInvite}>
              Create Invite
            </Button>
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
              <DialogTrigger asChild>
                <Button className="shadow-sm">
                  <Plus className="h-4 w-4 mr-2" />
                  New Project
                </Button>
              </DialogTrigger>
              <DialogContent className="border-2 border-border">
                <DialogHeader>
                  <DialogTitle>Create New Project</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Project Name</Label>
                    <Input
                      id="name"
                      value={newProject.name}
                      onChange={(e) => setNewProject({ ...newProject, name: e.target.value })}
                      placeholder="My Project"
                      className="border-2"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="slug">Project Slug</Label>
                    <Input
                      id="slug"
                      value={newProject.slug}
                      onChange={(e) => setNewProject({ ...newProject, slug: e.target.value })}
                      placeholder="my-project"
                      className="border-2"
                    />
                  </div>
                  <Button onClick={handleCreateProject} className="w-full shadow-sm">
                    Create Project
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search projects..."
            className="pl-10 border-2"
          />
        </div>

        {/* Projects Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredProjects.map((project) => (
            <Link
              key={project.id}
              to={`/p/${project.slug}/overview`}
              onClick={() => setCurrentProject(project)}
            >
              <Card className="border-2 border-border hover:shadow-md transition-shadow cursor-pointer h-full">
                <CardHeader>
                  <div className="flex items-start gap-3">
                    <div className="h-10 w-10 border-2 border-border bg-accent flex items-center justify-center shrink-0">
                      <FolderKanban className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <CardTitle className="text-lg truncate">{project.name}</CardTitle>
                      <CardDescription className="line-clamp-2">
                        {project.description || project.slug}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2 mb-4">
                    <IntegrationBadge type="asana" connected={project.integrations.asana} />
                    <IntegrationBadge type="github" connected={project.integrations.github} />
                    <IntegrationBadge type="opencode" connected={project.integrations.opencode} />
                  </div>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Users className="h-4 w-4" />
                      {project.memberCount}
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar className="h-4 w-4" />
                      {new Date(project.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        {isLoading && (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Loading projects...</p>
          </div>
        )}

        {!isLoading && filteredProjects.length === 0 && (
          <div className="text-center py-12">
            <p className="text-muted-foreground">No projects found</p>
          </div>
        )}
      </div>

      <Dialog open={isInviteOpen} onOpenChange={setIsInviteOpen}>
        <DialogContent className="border-2 border-border">
          <DialogHeader>
            <DialogTitle>Invite Link</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <Label>Share this link</Label>
            <Input value={inviteUrl} readOnly className="border-2" />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
