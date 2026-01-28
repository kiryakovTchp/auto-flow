import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ProjectProvider } from "@/contexts/ProjectContext";

// Layouts
import { ProjectLayout } from "@/components/layout/ProjectLayout";

// Auth Pages
import { LoginPage } from "@/pages/auth/LoginPage";
import { InitPage } from "@/pages/auth/InitPage";
import { InvitePage } from "@/pages/auth/InvitePage";

// Global Pages
import { ProjectsPage } from "@/pages/ProjectsPage";
import { DocsPage } from "@/pages/DocsPage";
import NotFound from "@/pages/NotFound";

// Project Pages
import { OverviewPage } from "@/pages/project/OverviewPage";
import { TasksPage } from "@/pages/project/TasksPage";
import { TaskDetailPage } from "@/pages/project/TaskDetailPage";
import { IntegrationsPage } from "@/pages/project/IntegrationsPage";
import { WebhooksPage } from "@/pages/project/WebhooksPage";
import { RunsPage } from "@/pages/project/RunsPage";
import { SettingsPage } from "@/pages/project/SettingsPage";

const queryClient = new QueryClient();

const RequireAuth = ({ children }: { children: JSX.Element }) => {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">
        Loading...
      </div>
    );
  }
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return children;
};

const HomeRedirect = () => {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">
        Loading...
      </div>
    );
  }
  return <Navigate to={isAuthenticated ? "/projects" : "/login"} replace />;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <ProjectProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              {/* Auth Routes */}
              <Route path="/login" element={<LoginPage />} />
              <Route path="/init" element={<InitPage />} />
              <Route path="/invite/:token" element={<InvitePage />} />

              {/* Redirect root to projects/login */}
              <Route path="/" element={<HomeRedirect />} />

              {/* Global Routes */}
              <Route
                path="/projects"
                element={
                  <RequireAuth>
                    <ProjectsPage />
                  </RequireAuth>
                }
              />
              <Route path="/app" element={<Navigate to="/projects" replace />} />
              <Route path="/docs" element={<DocsPage />} />

              {/* Project Routes */}
              <Route
                path="/p/:slug"
                element={
                  <RequireAuth>
                    <ProjectLayout />
                  </RequireAuth>
                }
              >
                <Route index element={<Navigate to="overview" replace />} />
                <Route path="overview" element={<OverviewPage />} />
                <Route path="tasks" element={<TasksPage />} />
                <Route path="tasks/:taskId" element={<TaskDetailPage />} />
                <Route path="integrations" element={<IntegrationsPage />} />
                <Route path="webhooks" element={<WebhooksPage />} />
                <Route path="runs" element={<RunsPage />} />
                <Route path="settings" element={<SettingsPage />} />
              </Route>
              
              {/* Catch-all */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </ProjectProvider>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
