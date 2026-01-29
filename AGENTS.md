# Auto-Flow — руководство по репозиторию (с нуля)

Этот файл объясняет, как устроен проект Auto-Flow, какие у него компоненты, как они взаимодействуют, и как запускать/разворачивать сервис.

## 1. Что это за проект и зачем он нужен

Auto-Flow — небольшой оркестратор, который соединяет **Asana** и **GitHub** и запускает автоматический цикл доставки задач через **OpenCode**. Сам сервис **не запускает AI и не выполняет код** — он лишь обрабатывает webhooks, хранит состояние, создает/обновляет GitHub Issues и отслеживает PR + CI, после чего обновляет исходную задачу в Asana.【F:README.md†L1-L39】

Ключевая идея: OpenCode работает **на клиентской машине разработчика** и реагирует на команду в GitHub Issue (например, `/opencode implement`). Auto-Flow лишь создает Issue с TaskSpec и отслеживает дальнейший прогресс.【F:README.md†L18-L39】

## 2. Главный поток данных (pipeline)

Базовый поток работы (MVP):

1. В Asana появляется/обновляется задача, помеченная как «auto» (через кастомное поле/тег).
2. Auto-Flow получает Asana webhook и запрашивает полные детали задачи.
3. Auto-Flow генерирует **TaskSpec** (Markdown) и сохраняет версионно в Postgres.
4. Auto-Flow создает **GitHub Issue** с TaskSpec и командой `/opencode implement`.
5. OpenCode (на клиенте) берёт Issue, выполняет задачу и делает PR.
6. Auto-Flow получает GitHub webhooks по PR и CI (workflow_run).
7. Когда PR смёржен + CI зелёный → задача переводится в `DEPLOYED` и закрывается в Asana.【F:README.md†L21-L58】

Аналогичное описание и формулировка MVP есть в техспеке в `docs/main-info.md` (на русском).【F:docs/main-info.md†L1-L52】

## 3. Состояния задач (истина в БД)

Список текущих статусов задач хранится в `src/db/tasks-v2.ts`. Они отражают ключевые этапы pipeline:

- `RECEIVED`
- `TASKSPEC_CREATED`
- `NEEDS_REPO`
- `AUTO_DISABLED`
- `CANCELLED`
- `BLOCKED`
- `ISSUE_CREATED`
- `PR_CREATED`
- `WAITING_CI`
- `DEPLOYED`
- `FAILED`【F:src/db/tasks-v2.ts†L5-L23】

## 4. Архитектура и ключевые компоненты

### 4.1 Сервер (Express)

Входная точка — `src/server.ts`. Здесь:

- настраивается Express и middleware (JSON + raw body для проверок подписи, urlencoded формы, cookie-parser, pino logger);
- поднимаются UI-роуты и API;
- регистрируются webhooks Asana/GitHub;
- запускаются фоновые джобы/шедулеры;
- выполняются миграции и bootstrap дефолтного админа при старте.【F:src/server.ts†L1-L118】

### 4.2 Вебхуки

Вебхуки обрабатываются в папке `src/webhooks/`. Основные обработчики подключены в `src/server.ts`:

- `POST /webhooks/asana` → `asanaWebhookHandler`
- `POST /webhooks/github` → `githubWebhookHandler`
- per-project endpoints: `/webhooks/asana/:projectId`, `/webhooks/github/:projectId`【F:src/server.ts†L69-L91】

Сервис требует raw body для проверки подписи на webhooks, поэтому JSON body parser сохраняет `req.rawBody`.【F:src/server.ts†L20-L35】

### 4.3 UI и API

UI — серверный HTML без фронтенд-фреймворка. Роуты:

- `/init`, `/login`, `/app`, `/p/:slug/*` (session-based UI)
- legacy admin UI: `/admin` (Basic Auth)

API:

- `/api/v1` — OpenAPI-спецификация и проектный API
- `GET /health`, `GET /metrics` (метрики защищаются токеном)【F:README.md†L45-L64】【F:src/server.ts†L45-L68】

### 4.4 База данных и миграции

Postgres — единственный источник правды о задачах/связях. Миграции запускаются автоматически при старте (`runMigrations`).【F:src/server.ts†L96-L106】

Схема и бизнес-логика находятся в `src/db/`:

- `tasks-v2.ts`, `tasks.ts` — таблица задач и операции;
- `taskspecs.ts` — версии TaskSpec;
- `project-*` — проекты, настройки, webhooks, связи;
- `secrets.ts` / `app-secrets.ts` — хранение секретов;
- `migrations.ts` + `sql/*.sql` — SQL миграции.

### 4.5 Интеграции

- Asana API и сигнатуры webhooks — логика в `src/webhooks` и `src/integrations`.
- GitHub API, Issues/PR/CI — также в `src/webhooks` и `src/integrations`.

## 5. Конфигурация (ENV)

Основные переменные окружения описаны в `src/config/env.ts`:

- `PORT`, `PUBLIC_BASE_URL`
- Asana: `ASANA_PAT`, `ASANA_PROJECT_GID`, `ASANA_WEBHOOK_SECRET`
- GitHub: `GITHUB_TOKEN`, `GITHUB_OWNER`, `GITHUB_REPO`, `GITHUB_WEBHOOK_SECRET`
- Admin: `ADMIN_API_TOKEN`, `INIT_ADMIN_TOKEN`
- Ops: `METRICS_TOKEN`【F:src/config/env.ts†L3-L25】

Также см. `.env.example` в корне (если есть) и `deploy/.env.example` для production развертывания.【F:docs/deploy.md†L7-L27】

## 6. Как запускать локально

Из README:

1. Поднять Postgres через Docker:
   ```bash
   docker compose up -d
   ```
2. Установить зависимости:
   ```bash
   npm ci
   ```
3. Скопировать `.env`:
   ```bash
   cp .env.example .env
   ```
4. Запустить dev сервер:
   ```bash
   npm run dev
   ```

Сервер автоматически выполнит миграции БД при старте.【F:README.md†L70-L88】

## 7. UI (первичная настройка)

Краткая схема первичной настройки через UI:

1. Установить `INIT_ADMIN_TOKEN`.
2. Открыть `/init?token=<INIT_ADMIN_TOKEN>` и создать администратора.
3. Логин `/login`.
4. Создать проект в `/app`.
5. В `/p/<slug>/settings` — задать конфигурацию Asana/GitHub.
6. В `/p/<slug>/webhooks` — настроить Asana/GitHub webhooks.【F:README.md†L89-L104】

## 8. Webhooks (конфигурация в Asana/GitHub)

- **GitHub webhook**:
  - URL: `https://<PUBLIC_BASE_URL>/webhooks/github`
  - Secret: `GITHUB_WEBHOOK_SECRET`
  - Рекомендуемые события: `issues`, `pull_request`, `issue_comment`, `workflow_run`, `ping`【F:README.md†L108-L118】

- **Asana webhook**:
  - URL: `https://<PUBLIC_BASE_URL>/webhooks/asana` (или per-project)
  - Handshake: `X-Hook-Secret`
  - Подпись: `X-Hook-Signature` (HMAC-SHA256 от raw body)【F:README.md†L120-L126】

## 9. CI/CD и деплой

**CI**: GitHub Actions прогоняет `npm run build` на PR/пушах в `main`.
**Deploy**: workflow `deploy.yml` деплоит на staging/prod в зависимости от условий; используются секреты `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY`, `DEPLOY_PATH` (путь к репо на VPS).【F:docs/ci-cd.md†L1-L20】

**Production развёртывание** описано в `docs/deploy.md`:

- используется Docker + Caddy;
- требуется настроить `deploy/.env` (DOMAIN, ACME_EMAIL, INIT_ADMIN_TOKEN, PGPASSWORD и т.п.);
- запуск: `docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d --build`;
- мастер-ключ шифрования хранится в volume `/app/data`.
【F:docs/deploy.md†L1-L26】

## 10. Безопасность

Если когда-либо были закоммичены секреты — считайте их скомпрометированными и ротируйте (Asana PAT, GitHub PAT, webhook secret). Рекомендации по очистке истории приведены в `docs/security.md`.【F:docs/security.md†L1-L21】

## 11. Структура репозитория (ориентир по папкам)

```
/ (repo root)
├─ src/                # Основной сервер на TypeScript
│  ├─ server.ts        # Входная точка Express
│  ├─ routes/          # UI + API роуты
│  ├─ webhooks/        # Asana/GitHub webhooks
│  ├─ db/              # Postgres модели, миграции, SQL
│  ├─ services/        # фоновые процессы, очереди, reconciliation
│  ├─ integrations/    # SDK/HTTP интеграции (Asana/GitHub)
│  ├─ metrics/         # метрики (Prometheus текст)
│  └─ security/        # утилиты по безопасности/шифрованию
├─ docs/               # Документация по продукту/деплою
├─ deploy/             # Docker + Caddy deployment
├─ package.json        # Скрипты dev/build/start
└─ docker-compose.yml  # Локальный Postgres
```

Подробности по скриптам:

- `npm run dev` — dev сервер (ts-node-dev)
- `npm run build` — TypeScript build (`dist/`)
- `npm start` — запуск собранного сервера

См. `package.json`.【F:package.json†L5-L15】

