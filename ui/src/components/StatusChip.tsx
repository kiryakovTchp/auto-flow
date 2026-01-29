import { TaskStatus } from '@/types';
import { cn } from '@/lib/utils';

const statusConfig: Record<TaskStatus, { label: string; className: string }> = {
  RECEIVED: { label: 'Получено', className: 'bg-muted text-muted-foreground' },
  TASKSPEC_CREATED: { label: 'Спека создана', className: 'bg-accent text-accent-foreground' },
  NEEDS_REPO: { label: 'Нужен репозиторий', className: 'bg-chart-4/20 text-chart-4' },
  AUTO_DISABLED: { label: 'Авто отключено', className: 'bg-muted text-muted-foreground' },
  CANCELLED: { label: 'Отменено', className: 'bg-muted text-muted-foreground line-through' },
  BLOCKED: { label: 'Заблокировано', className: 'bg-destructive/20 text-destructive' },
  ISSUE_CREATED: { label: 'Issue создан', className: 'bg-chart-3/20 text-chart-3' },
  PR_CREATED: { label: 'PR создан', className: 'bg-chart-2/20 text-chart-2' },
  WAITING_CI: { label: 'Ожидание CI', className: 'bg-chart-1/20 text-chart-1' },
  DEPLOYED: { label: 'Задеплоено', className: 'bg-chart-2/20 text-chart-2 font-medium' },
  FAILED: { label: 'Ошибка', className: 'bg-destructive/20 text-destructive font-medium' },
};

interface StatusChipProps {
  status: TaskStatus;
  className?: string;
}

export function StatusChip({ status, className }: StatusChipProps) {
  const config = statusConfig[status];
  
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-1 text-xs font-medium border-2 border-border',
        config.className,
        className
      )}
    >
      {config.label}
    </span>
  );
}
