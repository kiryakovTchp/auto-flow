import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Webhook,
  Database,
  GitBranch,
  CheckCircle2,
  Server,
  Shield,
  Terminal,
  ExternalLink,
  Layers,
  Zap,
  RefreshCw,
  FileCode,
  Activity,
  Lock,
  Container,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

function StatusChip({ code, label }: { code: string; label: string }) {
  return (
    <div className="flex items-center gap-3 p-3 border-2 border-border bg-card">
      <code className="font-mono text-sm bg-muted px-2 py-1 border border-border">
        {code}
      </code>
      <span className="text-sm text-muted-foreground">{label}</span>
    </div>
  );
}

function FeatureCard({
  icon: Icon,
  title,
  children,
  className,
}: {
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'border-2 border-border bg-card p-6 shadow-sm hover:shadow-md transition-shadow',
        className,
      )}
    >
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 border-2 border-border bg-muted">
          <Icon className="h-5 w-5" />
        </div>
        <h3 className="font-semibold text-lg">{title}</h3>
      </div>
      <div className="text-muted-foreground text-sm leading-relaxed">{children}</div>
    </div>
  );
}

function Section({
  id,
  title,
  subtitle,
  children,
  className,
}: {
  id?: string;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={cn('py-16 md:py-24', className)}>
      <div className="container mx-auto px-4 md:px-6">
        {title && (
          <div className="mb-12">
            <h2 className="text-2xl md:text-3xl font-bold mb-2">{title}</h2>
            {subtitle && <p className="text-muted-foreground">{subtitle}</p>}
            <div className="w-16 h-1 bg-foreground mt-4" />
          </div>
        )}
        {children}
      </div>
    </section>
  );
}

function FlowStep({ number, title, description }: { number: number; title: string; description: string }) {
  return (
    <div className="flex gap-4">
      <div className="flex-shrink-0 w-10 h-10 border-2 border-border bg-foreground text-background flex items-center justify-center font-mono font-bold">
        {number}
      </div>
      <div className="flex-1 pb-8 border-l-2 border-border pl-6 -ml-5 relative">
        <div className="absolute -left-[7px] top-3 w-3 h-3 bg-muted border-2 border-border" />
        <h4 className="font-semibold mb-1">{title}</h4>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

export function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      <div
        className="fixed inset-0 pointer-events-none opacity-[0.02]"
        style={{
          backgroundImage: `
            linear-gradient(hsl(var(--foreground)) 1px, transparent 1px),
            linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)
          `,
          backgroundSize: '40px 40px',
        }}
      />

      <header className="sticky top-0 z-50 border-b-2 border-border bg-background">
        <div className="container mx-auto px-4 md:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-foreground flex items-center justify-center">
              <Zap className="h-5 w-5 text-background" />
            </div>
            <span className="font-bold text-xl tracking-tight">Auto-Flow</span>
          </div>
          <nav className="hidden md:flex items-center gap-6">
            <a href="#how-it-works" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Как работает
            </a>
            <a href="#statuses" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Статусы
            </a>
          </nav>
          <Button asChild className="shadow-xs hover:shadow-sm transition-shadow">
            <Link to="/login">
              Войти <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </header>

      <Section className="pt-20 md:pt-32 pb-16">
        <div className="max-w-4xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 border-2 border-border bg-muted text-sm mb-6">
            <Terminal className="h-4 w-4" />
            <span className="font-mono">internal engineering tool</span>
          </div>

          <h1 className="text-4xl md:text-6xl font-bold leading-tight mb-6">
            Auto-Flow — оркестратор<br />
            между <span className="bg-foreground text-background px-2">Asana</span> и{' '}
            <span className="bg-foreground text-background px-2">GitHub</span>
          </h1>

          <p className="text-lg md:text-xl text-muted-foreground mb-4 max-w-2xl">
            Связывает задачи в Asana с GitHub Issues и PR, отслеживает CI/CD статус и синхронизирует состояние через webhooks.
          </p>

          <div className="flex items-center gap-3 mb-8 p-3 border-2 border-border bg-muted/50 max-w-fit">
            <Shield className="h-5 w-5 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              <strong>Важно:</strong> AI не исполняется на сервере. OpenCode работает локально или через server-runner.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-4">
            <Button asChild size="lg" className="shadow-sm hover:shadow-md transition-shadow text-base">
              <Link to="/login">
                Войти в систему <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="shadow-xs hover:shadow-sm transition-shadow text-base">
              <a href="#how-it-works">Узнать подробнее</a>
            </Button>
          </div>
        </div>
      </Section>

      <Section className="bg-muted/30 border-y-2 border-border">
        <div className="grid md:grid-cols-3 gap-6">
          <FeatureCard icon={RefreshCw} title="Проблема синхронизации">
            Ручное копирование задач между Asana и GitHub, потеря контекста, устаревшие статусы и дублирование работы.
          </FeatureCard>
          <FeatureCard icon={Activity} title="Отсутствие трекинга">
            Невозможно отследить путь задачи от идеи до деплоя: где PR, прошел ли CI, когда задеплоилось?
          </FeatureCard>
          <FeatureCard icon={Layers} title="Решение — Auto-Flow">
            Единый источник истины в Postgres. Автоматическая связь Asana → Issue → PR → CI → Deploy → Asana.
          </FeatureCard>
        </div>
      </Section>

      <Section id="how-it-works" title="Как это работает" subtitle="MVP-поток от задачи до деплоя">
        <div className="grid md:grid-cols-2 gap-12">
          <div className="space-y-0">
            <FlowStep number={1} title="Задача помечается как auto" description="В Asana задача получает метку, запускающую автоматизацию." />
            <FlowStep number={2} title="Auto-Flow получает webhook" description="Webhook от Asana запускает обработку, запрашиваются детали задачи через Asana API." />
            <FlowStep number={3} title="Формируется TaskSpec" description="Создается Markdown-спецификация, версионно сохраняется в Postgres." />
            <FlowStep number={4} title="Создается GitHub Issue" description="Issue содержит TaskSpec и команду /opencode implement." />
            <FlowStep number={5} title="OpenCode обрабатывает Issue" description="Локально или через server-runner выполняется задача и открывается PR." />
            <FlowStep number={6} title="GitHub webhooks по PR и CI" description="Auto-Flow принимает события pull_request и workflow_run." />
            <FlowStep number={7} title="PR merge + зеленый CI" description="Задача переходит в DEPLOYED, Asana-задача закрывается автоматически." />
          </div>

          <div className="border-2 border-border bg-card p-6 h-fit">
            <h4 className="font-semibold mb-4 flex items-center gap-2">
              <Database className="h-5 w-5" />
              Источник истины
            </h4>
            <p className="text-sm text-muted-foreground mb-4">
              Все состояния задач хранятся в <strong>Postgres</strong>. TaskSpec версионируется, события логируются, связи сохраняются.
            </p>
            <div className="border-2 border-border bg-muted p-4">
              <code className="text-sm font-mono">Task → TaskSpec → Issue → PR → Deployment</code>
            </div>
          </div>
        </div>
      </Section>

      <Section className="bg-muted/30 border-y-2 border-border" title="Роли сервисов" subtitle="Четкое разделение ответственности">
        <div className="grid md:grid-cols-2 gap-6">
          <div className="border-2 border-border bg-card p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 bg-foreground text-background">
                <Webhook className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-bold text-xl">Auto-Flow</h3>
                <p className="text-sm text-muted-foreground">Оркестратор</p>
              </div>
            </div>
            <ul className="space-y-2 text-sm">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>Прием и обработка webhooks (Asana, GitHub)</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>Хранение состояния задач и связей</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>Генерация и версионирование TaskSpec</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>Создание/обновление GitHub Issues</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>Отслеживание PR и CI статусов</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>Обновление статуса в Asana</span>
              </li>
            </ul>
          </div>

          <div className="border-2 border-border bg-card p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 bg-muted border-2 border-border">
                <FileCode className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-bold text-xl">OpenCode</h3>
                <p className="text-sm text-muted-foreground">Исполнитель</p>
              </div>
            </div>
            <ul className="space-y-2 text-sm">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>Выполнение задачи по TaskSpec</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>Создание Pull Request</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>Работа локально или через server-runner</span>
              </li>
            </ul>
            <div className="mt-4 p-3 border-2 border-border bg-muted">
              <p className="text-xs text-muted-foreground">
                <strong>Важно:</strong> OpenCode не входит в состав Auto-Flow. Это внешний инструмент, запускаемый отдельно.
              </p>
            </div>
          </div>
        </div>
      </Section>

      <Section title="Архитектура" subtitle="Основные компоненты системы">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <FeatureCard icon={Server} title="Сервер (Express)">REST API, обработка webhooks, бизнес-логика оркестрации.</FeatureCard>
          <FeatureCard icon={Database} title="БД + миграции">PostgreSQL для хранения состояния. Все миграции версионированы.</FeatureCard>
          <FeatureCard icon={Webhook} title="Webhooks">Прием событий от Asana и GitHub с валидацией подписей.</FeatureCard>
          <FeatureCard icon={GitBranch} title="Интеграции">Asana API и GitHub API для синхронизации данных.</FeatureCard>
          <FeatureCard icon={Layers} title="UI (React SPA)">Управление проектами, задачами, настройками и мониторинг.</FeatureCard>
          <FeatureCard icon={Container} title="Deploy">Docker + Caddy для продакшен-развертывания.</FeatureCard>
        </div>
      </Section>

      <Section id="statuses" className="bg-muted/30 border-y-2 border-border" title="Статусы задач" subtitle="Жизненный цикл задачи в системе">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          <StatusChip code="RECEIVED" label="Получено" />
          <StatusChip code="TASKSPEC_CREATED" label="Спека создана" />
          <StatusChip code="NEEDS_REPO" label="Нужен репозиторий" />
          <StatusChip code="AUTO_DISABLED" label="Авто отключено" />
          <StatusChip code="CANCELLED" label="Отменено" />
          <StatusChip code="BLOCKED" label="Заблокировано" />
          <StatusChip code="ISSUE_CREATED" label="Issue создан" />
          <StatusChip code="PR_CREATED" label="PR создан" />
          <StatusChip code="WAITING_CI" label="Ожидание CI" />
          <StatusChip code="DEPLOYED" label="Задеплоено" />
          <StatusChip code="FAILED" label="Ошибка" />
        </div>
      </Section>

      <Section title="Webhooks и API" subtitle="Точки интеграции">
        <div className="grid md:grid-cols-2 gap-6 mb-8">
          <div className="border-2 border-border bg-card p-6">
            <div className="flex items-center gap-3 mb-4">
              <GitBranch className="h-5 w-5" />
              <h3 className="font-semibold">GitHub Webhook</h3>
            </div>
            <div className="space-y-3 text-sm">
              <div>
                <span className="text-muted-foreground">URL:</span>
                <code className="ml-2 font-mono bg-muted px-2 py-1 text-xs">https://&lt;PUBLIC_BASE_URL&gt;/webhooks/github</code>
              </div>
              <div>
                <span className="text-muted-foreground">Secret:</span>
                <code className="ml-2 font-mono bg-muted px-2 py-1 text-xs">GITHUB_WEBHOOK_SECRET</code>
              </div>
              <div>
                <span className="text-muted-foreground">Events:</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {['issues', 'pull_request', 'issue_comment', 'workflow_run', 'ping'].map((e) => (
                    <code key={e} className="font-mono bg-muted px-2 py-0.5 text-xs border border-border">
                      {e}
                    </code>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="border-2 border-border bg-card p-6">
            <div className="flex items-center gap-3 mb-4">
              <Webhook className="h-5 w-5" />
              <h3 className="font-semibold">Asana Webhook</h3>
            </div>
            <div className="space-y-3 text-sm">
              <div>
                <span className="text-muted-foreground">URL:</span>
                <code className="ml-2 font-mono bg-muted px-2 py-1 text-xs">https://&lt;PUBLIC_BASE_URL&gt;/webhooks/asana</code>
              </div>
              <div>
                <span className="text-muted-foreground">Handshake:</span>
                <code className="ml-2 font-mono bg-muted px-2 py-1 text-xs">X-Hook-Secret</code>
              </div>
              <div>
                <span className="text-muted-foreground">Подпись:</span>
                <code className="ml-2 font-mono bg-muted px-2 py-1 text-xs">X-Hook-Signature (HMAC-SHA256)</code>
              </div>
            </div>
          </div>
        </div>

        <div className="border-2 border-border bg-card p-6">
          <h3 className="font-semibold mb-4">API эндпоинты</h3>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
            <div>
              <code className="font-mono text-xs bg-muted px-2 py-1 border border-border">GET /api/v1/openapi.json</code>
              <p className="text-muted-foreground mt-1">OpenAPI спецификация</p>
            </div>
            <div>
              <code className="font-mono text-xs bg-muted px-2 py-1 border border-border">GET /health</code>
              <p className="text-muted-foreground mt-1">Health check</p>
            </div>
            <div>
              <code className="font-mono text-xs bg-muted px-2 py-1 border border-border">GET /metrics</code>
              <p className="text-muted-foreground mt-1">Метрики (защищено METRICS_TOKEN)</p>
            </div>
            <div>
              <code className="font-mono text-xs bg-muted px-2 py-1 border border-border">POST /webhooks/*</code>
              <p className="text-muted-foreground mt-1">Webhook endpoints</p>
            </div>
          </div>
        </div>
      </Section>

      <Section title="Конфигурация" subtitle="Переменные окружения">
        <div className="border-2 border-border bg-card p-6 overflow-x-auto">
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 text-sm font-mono">
            {[
              { name: 'PUBLIC_BASE_URL', desc: 'Публичный URL сервиса' },
              { name: 'PORT', desc: 'Порт сервера' },
              { name: 'ASANA_PAT', desc: 'Personal Access Token Asana' },
              { name: 'ASANA_PROJECT_GID', desc: 'GID проекта в Asana' },
              { name: 'ASANA_WEBHOOK_SECRET', desc: 'Секрет для webhooks Asana' },
              { name: 'GITHUB_TOKEN', desc: 'GitHub Personal Access Token' },
              { name: 'GITHUB_OWNER', desc: 'Владелец репозитория' },
              { name: 'GITHUB_REPO', desc: 'Имя репозитория' },
              { name: 'GITHUB_WEBHOOK_SECRET', desc: 'Секрет для webhooks GitHub' },
              { name: 'ADMIN_API_TOKEN', desc: 'Токен админского API' },
              { name: 'INIT_ADMIN_TOKEN', desc: 'Токен первичной инициализации' },
              { name: 'METRICS_TOKEN', desc: 'Токен доступа к метрикам' },
            ].map(({ name, desc }) => (
              <div key={name} className="p-3 border border-border bg-muted/50">
                <code className="text-xs">{name}</code>
                <p className="text-muted-foreground text-xs mt-1 font-sans">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </Section>

      <Section className="bg-muted/30 border-y-2 border-border">
        <div className="grid md:grid-cols-2 gap-8">
          <div>
            <div className="flex items-center gap-3 mb-6">
              <div className="p-3 bg-foreground text-background">
                <Lock className="h-6 w-6" />
              </div>
              <h3 className="text-xl font-bold">Безопасность</h3>
            </div>
            <ul className="space-y-3 text-sm">
              <li className="flex items-start gap-3 p-3 border-2 border-border bg-card">
                <Shield className="h-5 w-5 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium">Шифрование секретов</p>
                  <p className="text-muted-foreground">Все секреты хранятся в Postgres в зашифрованном виде</p>
                </div>
              </li>
              <li className="flex items-start gap-3 p-3 border-2 border-border bg-card">
                <Lock className="h-5 w-5 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium">Master Key</p>
                  <p className="text-muted-foreground">
                    Мастер-ключ: <code className="font-mono bg-muted px-1">data/master.key</code>
                  </p>
                  <p className="text-destructive text-xs mt-1">Потеря ключа = потеря доступа к секретам</p>
                </div>
              </li>
              <li className="flex items-start gap-3 p-3 border-2 border-border bg-card">
                <ExternalLink className="h-5 w-5 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium">Ротация секретов</p>
                  <p className="text-muted-foreground">
                    Если секреты попали в git — см. <code className="font-mono bg-muted px-1">docs/security.md</code>
                  </p>
                </div>
              </li>
            </ul>
          </div>

          <div>
            <div className="flex items-center gap-3 mb-6">
              <div className="p-3 bg-foreground text-background">
                <Container className="h-6 w-6" />
              </div>
              <h3 className="text-xl font-bold">Деплой</h3>
            </div>
            <div className="space-y-3">
              <div className="p-4 border-2 border-border bg-card">
                <h4 className="font-medium mb-2">Docker + Caddy</h4>
                <p className="text-sm text-muted-foreground mb-2">
                  Готовые конфиги в директории <code className="font-mono bg-muted px-1">deploy/</code>
                </p>
                <div className="flex gap-2">
                  <code className="font-mono text-xs bg-muted px-2 py-1 border border-border">docker-compose.yml</code>
                  <code className="font-mono text-xs bg-muted px-2 py-1 border border-border">Caddyfile</code>
                </div>
              </div>
              <div className="p-4 border-2 border-border bg-card">
                <h4 className="font-medium mb-2">Документация</h4>
                <div className="flex flex-wrap gap-2">
                  <code className="font-mono text-xs bg-muted px-2 py-1 border border-border">docs/ci-cd.md</code>
                  <code className="font-mono text-xs bg-muted px-2 py-1 border border-border">docs/deploy.md</code>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Section>

      <Section title="UI и маршруты">
        <div className="border-2 border-border bg-card p-6">
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { path: '/', desc: 'Главная страница' },
              { path: '/login', desc: 'Авторизация' },
              { path: '/init', desc: 'Первичная настройка' },
              { path: '/invite/:token', desc: 'Принятие приглашения' },
              { path: '/projects', desc: 'Список проектов' },
              { path: '/p/:slug/*', desc: 'Страницы проекта' },
              { path: '/admin', desc: 'Админ-панель (legacy)' },
            ].map(({ path, desc }) => (
              <div key={path} className="flex items-center gap-3 p-3 border border-border bg-muted/50">
                <code className="font-mono text-sm">{path}</code>
                <span className="text-muted-foreground text-sm">— {desc}</span>
              </div>
            ))}
          </div>
        </div>
      </Section>

      <Section className="text-center">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Готовы начать?</h2>
          <p className="text-lg text-muted-foreground mb-8">Войдите в систему и настройте первый проект за несколько минут.</p>
          <Button asChild size="lg" className="shadow-md hover:shadow-lg transition-shadow text-lg px-8">
            <Link to="/login">
              Войти в Auto-Flow <ArrowRight className="ml-2 h-5 w-5" />
            </Link>
          </Button>
        </div>
      </Section>

      <footer className="border-t-2 border-border bg-muted/30 py-8">
        <div className="container mx-auto px-4 md:px-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 bg-foreground flex items-center justify-center">
                <Zap className="h-4 w-4 text-background" />
              </div>
              <span className="font-semibold">Auto-Flow</span>
              <span className="text-muted-foreground text-sm">— Internal Engineering Tool</span>
            </div>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <a href="#how-it-works" className="hover:text-foreground transition-colors">
                Как работает
              </a>
              <a href="#statuses" className="hover:text-foreground transition-colors">
                Статусы
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
