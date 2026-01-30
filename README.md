# Auto-Flow

Auto-Flow — оркестратор задач, который связывает **Asana** и **GitHub** и запускает цикл доставки через **OpenCode**. Сервис **не запускает AI и не выполняет код**: он принимает webhooks, хранит состояние, создает/обновляет GitHub Issue, отслеживает PR/CI и обновляет исходную задачу в Asana.

## Бизнес-логика и поток данных

Цель: превратить задачу из Asana в управляемый, измеримый и автоматизируемый pipeline доставки.

MVP‑поток:
1) В Asana задача помечается как “auto” (кастомное поле/правило).
2) Auto-Flow получает webhook, запрашивает детали задачи через Asana API.
3) Формируется **TaskSpec** (Markdown) и сохраняется версионно в Postgres.
4) Создается **GitHub Issue** с TaskSpec и командой `/opencode implement`.
5) OpenCode (на машине разработчика или через server-runner) обрабатывает Issue и открывает PR.
6) Auto-Flow принимает GitHub webhooks по PR и CI (`workflow_run`).
7) Когда **PR смержен + CI зелёный**, задача переводится в `DEPLOYED`, а Asana-задача закрывается.

Источник истины — Postgres. Статусы задач определены в `src/db/tasks-v2.ts`:
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
- `FAILED`

## Роли сервиса

Auto-Flow отвечает за:
- прием webhooks Asana/GitHub
- хранение состояния задач/связей
- генерацию/версионирование TaskSpec
- создание/обновление GitHub Issues
- трекинг PR и CI
- обновление статуса в Asana

OpenCode отвечает за:
- выполнение задачи и создание PR
- может работать локально (client) или через server-runner

## Основные компоненты

- Сервер (Express): `src/server.ts`
- БД + миграции: `src/db/*`, `src/db/sql/*.sql`
- Webhooks: `src/webhooks/*`
- Интеграции Asana/GitHub: `src/integrations/*`
- UI (React SPA): исходники в `ui/`, билд в `public/ui`
- Deploy (Docker + Caddy): `deploy/`

## Webhooks

GitHub webhook:
- URL: `https://<PUBLIC_BASE_URL>/webhooks/github`
- Secret: `GITHUB_WEBHOOK_SECRET`
- Events: `issues`, `pull_request`, `issue_comment`, `workflow_run`, `ping`

Asana webhook:
- URL: `https://<PUBLIC_BASE_URL>/webhooks/asana` (или per‑project)
- Handshake: `X-Hook-Secret`
- Подпись: `X-Hook-Signature` (HMAC‑SHA256 от raw body)

## UI и API

UI (SPA):
- `/`, `/login`, `/init`, `/invite/:token`, `/projects`, `/p/:slug/*`
- legacy `/admin` (Basic Auth)

API:
- `GET /api/v1/openapi.json` — OpenAPI
- `GET /health`
- `GET /metrics` (защищено `METRICS_TOKEN`)

## Быстрый старт (локально)

Требуется:
- Node.js 20+
- Docker (Postgres)

Запустить Postgres:
```
docker compose up -d
```

Установить зависимости:
```
npm ci
cd ui && npm ci
```

Собрать UI:
```
cd ui && npm run build
```

Создать `.env`:
```
cp .env.example .env
```

Запуск dev сервера:
```
npm run dev
```

Миграции выполняются автоматически при старте.

## Первичная настройка (UI)

1) Установить `INIT_ADMIN_TOKEN`.
2) Открыть `/init?token=<INIT_ADMIN_TOKEN>` и создать админа.
3) Войти через `/login`.
4) Создать проект в `/projects`.
5) Настроить проект в `/p/<slug>/settings`:
   - Asana секреты и поля
   - GitHub токен и репозитории
   - сопоставления (status/repo), если нужны
6) В `/p/<slug>/webhooks`:
   - создать Asana webhooks
   - проверить GitHub webhooks

## Конфигурация (ENV)

См. `src/config/env.ts` и `.env.example`. Ключевое:
- `PUBLIC_BASE_URL`, `PORT`
- Asana: `ASANA_PAT`, `ASANA_PROJECT_GID`, `ASANA_WEBHOOK_SECRET`
- GitHub: `GITHUB_TOKEN`, `GITHUB_OWNER`, `GITHUB_REPO`, `GITHUB_WEBHOOK_SECRET`
- Admin: `ADMIN_API_TOKEN`, `INIT_ADMIN_TOKEN`
- Ops: `METRICS_TOKEN`

## Безопасность

- Секреты хранятся **в Postgres в зашифрованном виде**.
- Мастер‑ключ: `data/master.key` (или volume `/app/data`). Потеря ключа = потеря доступа к секретам.
- Если секреты когда‑либо попадали в git, считайте их скомпрометированными и ротируйте (см. `docs/security.md`).

## Деплой

- Docker + Caddy: `deploy/`
- CI/CD: `docs/ci-cd.md`
- Полный гайд: `docs/deploy.md`

## Документация

- `docs/main-info.md` — обзор продукта на русском
- `docs/deploy.md` — деплой
- `docs/ci-cd.md` — CI/CD
- `docs/security.md` — безопасность
