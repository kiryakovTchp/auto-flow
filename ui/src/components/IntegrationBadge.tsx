import { cn } from '@/lib/utils';
import { CheckCircle, XCircle, AlertCircle } from 'lucide-react';

interface IntegrationBadgeProps {
  type: 'asana' | 'github' | 'opencode';
  connected: boolean;
  error?: boolean;
  className?: string;
}

const integrationLabels = {
  asana: 'Asana',
  github: 'GitHub',
  opencode: 'OpenCode',
};

export function IntegrationBadge({ type, connected, error, className }: IntegrationBadgeProps) {
  const Icon = error ? AlertCircle : connected ? CheckCircle : XCircle;
  
  return (
    <div
      className={cn(
        'inline-flex items-center gap-2 px-3 py-2 border-2 border-border text-sm',
        connected && !error && 'bg-chart-2/10',
        error && 'bg-destructive/10',
        !connected && !error && 'bg-muted',
        className
      )}
    >
      <Icon className={cn(
        'h-4 w-4',
        connected && !error && 'text-chart-2',
        error && 'text-destructive',
        !connected && !error && 'text-muted-foreground'
      )} />
      <span>{integrationLabels[type]}</span>
    </div>
  );
}
