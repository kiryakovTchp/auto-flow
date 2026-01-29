import { useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  ListTodo,
  Plug,
  Webhook,
  Play,
  Settings,
  FolderKanban,
  ChevronDown,
  Check,
  LogOut,
  User,
} from 'lucide-react';
import { NavLink } from '@/components/NavLink';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useProject } from '@/contexts/ProjectContext';
import { useAuth } from '@/contexts/AuthContext';

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  const location = useLocation();
  const navigate = useNavigate();
  const { currentProject, projects, setCurrentProject } = useProject();
  const { user, logout } = useAuth();

  const isActive = (path: string) => location.pathname.startsWith(path);
  const navItems = currentProject
    ? [
        { title: 'Обзор', url: `/p/${currentProject.slug}/overview`, icon: LayoutDashboard },
        { title: 'Задачи', url: `/p/${currentProject.slug}/tasks`, icon: ListTodo },
        { title: 'Интеграции', url: `/p/${currentProject.slug}/integrations`, icon: Plug },
        { title: 'Вебхуки', url: `/p/${currentProject.slug}/webhooks`, icon: Webhook },
        { title: 'Запуски', url: `/p/${currentProject.slug}/runs`, icon: Play },
        { title: 'Настройки', url: `/p/${currentProject.slug}/settings`, icon: Settings },
      ]
    : [];

  return (
    <Sidebar collapsible="icon" className="border-r-2 border-border">
      <SidebarHeader className="border-b-2 border-border p-4">
        <NavLink to="/projects" className="flex items-center gap-2 font-bold text-lg">
          <div className="h-8 w-8 bg-primary flex items-center justify-center">
            <span className="text-primary-foreground font-mono text-sm">AF</span>
          </div>
          {!collapsed && <span>Auto-Flow</span>}
        </NavLink>
      </SidebarHeader>

      <SidebarContent>
        {/* Project Switcher */}
        <SidebarGroup>
          <SidebarGroupLabel className="text-xs uppercase tracking-wide text-muted-foreground">
            {!collapsed && 'Проект'}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton className="w-full border-2 border-border bg-background hover:bg-accent">
                  <FolderKanban className="h-4 w-4" />
                  {!collapsed && (
                    <>
                      <span className="flex-1 text-left truncate">
                        {currentProject?.name || 'Выберите проект'}
                      </span>
                      <ChevronDown className="h-4 w-4" />
                    </>
                  )}
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent 
                align="start" 
                className="w-56 border-2 border-border bg-popover"
              >
                {projects.map((project) => (
                  <DropdownMenuItem
                    key={project.id}
                    onClick={() => {
                      setCurrentProject(project);
                      navigate(`/p/${project.slug}/overview`);
                    }}
                    className="flex items-center gap-2"
                  >
                    <FolderKanban className="h-4 w-4" />
                    <span className="flex-1">{project.name}</span>
                    {currentProject?.id === project.id && (
                      <Check className="h-4 w-4" />
                    )}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                    <NavLink to="/projects" className="flex items-center gap-2">
                      <span>Все проекты</span>
                    </NavLink>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Project Navigation */}
        {currentProject && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-xs uppercase tracking-wide text-muted-foreground">
              {!collapsed && 'Навигация'}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {navItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive(item.url)}
                      tooltip={collapsed ? item.title : undefined}
                    >
                      <NavLink
                        to={item.url}
                        className="flex items-center gap-3"
                        activeClassName="bg-accent font-medium"
                      >
                        <item.icon className="h-4 w-4" />
                        {!collapsed && <span>{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="border-t-2 border-border p-4">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton className="w-full">
              <User className="h-4 w-4" />
              {!collapsed && (
                <>
                    <span className="flex-1 text-left truncate text-sm">
                      {user?.username}
                    </span>
                  <ChevronDown className="h-4 w-4" />
                </>
              )}
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent 
            align="start" 
            className="w-56 border-2 border-border bg-popover"
          >
            <DropdownMenuItem className="flex flex-col items-start gap-1">
              <span className="font-medium">{user?.username}</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={async () => {
                await logout();
                navigate('/login');
              }}
              className="text-destructive"
            >
              <LogOut className="h-4 w-4 mr-2" />
                Выйти
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
