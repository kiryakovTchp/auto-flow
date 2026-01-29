import { useLocation, Link } from 'react-router-dom';
import { ChevronRight, Menu, Bell, HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { useProject } from '@/contexts/ProjectContext';
import { Badge } from '@/components/ui/badge';

const sectionTitles: Record<string, string> = {
  overview: 'Обзор',
  tasks: 'Задачи',
  integrations: 'Интеграции',
  webhooks: 'Вебхуки',
  runs: 'Запуски',
  settings: 'Настройки',
};

export function Topbar() {
  const location = useLocation();
  const { currentProject } = useProject();

  const pathSegments = location.pathname.split('/').filter(Boolean);
  const section = pathSegments[2] || '';
  const currentTitle = sectionTitles[section] || (pathSegments[pathSegments.length - 1] ?? '');

  const getBreadcrumbs = () => {
    const crumbs = [];
    
    if (location.pathname.startsWith('/p/') && currentProject) {
      crumbs.push({ label: currentProject.name, path: `/p/${currentProject.slug}/overview` });
      
      if (location.pathname !== '/project/overview') {
        crumbs.push({ label: currentTitle, path: location.pathname });
      }
    } else if (location.pathname === '/projects') {
      crumbs.push({ label: 'Проекты', path: '/projects' });
    }
    
    return crumbs;
  };

  const breadcrumbs = getBreadcrumbs();

  return (
    <header className="h-14 border-b-2 border-border bg-background flex items-center justify-between px-4">
      <div className="flex items-center gap-4">
        <SidebarTrigger className="lg:hidden">
          <Menu className="h-5 w-5" />
        </SidebarTrigger>

        {/* Breadcrumbs */}
        <nav className="flex items-center gap-2 text-sm">
          <Link to="/" className="text-muted-foreground hover:text-foreground">
            Главная
          </Link>
          {breadcrumbs.map((crumb, index) => (
            <span key={crumb.path} className="flex items-center gap-2">
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
              {index === breadcrumbs.length - 1 ? (
                <span className="font-medium">{crumb.label}</span>
              ) : (
                <Link to={crumb.path} className="text-muted-foreground hover:text-foreground">
                  {crumb.label}
                </Link>
              )}
            </span>
          ))}
        </nav>
      </div>

      <div className="flex items-center gap-2">
        {/* Role Badge */}
        {currentProject?.role && (
          <Badge variant="outline" className="hidden sm:flex uppercase text-xs">
            {currentProject.role}
          </Badge>
        )}

        <Button variant="ghost" size="icon">
          <Bell className="h-4 w-4" />
        </Button>

        <Button variant="ghost" size="icon">
          <HelpCircle className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
