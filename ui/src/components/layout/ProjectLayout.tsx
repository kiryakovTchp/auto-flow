import { Outlet, useParams } from 'react-router-dom';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import { AppSidebar } from './AppSidebar';
import { Topbar } from './Topbar';
import { useEffect } from 'react';
import { useProject } from '@/contexts/ProjectContext';
import { apiFetch } from '@/lib/api';

export function ProjectLayout() {
  const { slug } = useParams();
  const { projects, currentProject, setCurrentProject, isLoading, refreshProjects } = useProject();

  useEffect(() => {
    if (!slug) return;
    const match = projects.find((p) => p.slug === slug);
    if (match) {
      if (!currentProject || currentProject.slug !== slug) {
        setCurrentProject(match);
      }
      return;
    }

    void (async () => {
      try {
        const data = await apiFetch<{ project: any; role: any; integrations: any }>(`/projects/${encodeURIComponent(slug)}`);
        const mapped = {
          id: data.project.id,
          slug: data.project.slug,
          name: data.project.name,
          createdAt: data.project.createdAt,
          role: data.role,
          integrations: data.integrations,
          memberCount: 0,
        };
        setCurrentProject(mapped);
      } catch {
        await refreshProjects();
      }
    })();
  }, [slug, projects, currentProject, setCurrentProject, refreshProjects]);

  if (isLoading && !currentProject) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">
        Loading project...
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <SidebarInset className="flex-1 flex flex-col">
          <Topbar />
          <main className="flex-1 overflow-auto p-6">
            <Outlet />
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
