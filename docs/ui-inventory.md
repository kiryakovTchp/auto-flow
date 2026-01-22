# UI Inventory (Auto-Flow)

Этот документ описывает текущий UI в репозитории: какие страницы существуют, какие на них элементы/формы, какие действия доступны пользователю, и какими функциями/роутами в коде эти действия реализованы.

Текущий UI — это сервер‑рендеренные HTML-страницы (без React/Vue). CSS вшит прямо в HTML (inline `<style>`), состояние — через cookie-сессии (для основного UI) и Basic Auth (для legacy admin UI).

## 1) Где живет UI в коде

- Основной UI (cookie session):
  - `src/routes/auth-ui.ts`
  - `src/routes/project-tasks-ui.ts`
  - `src/routes/auth-ui-webhooks.ts`
  - `src/routes/asana-import-ui.ts`
  - Общая обертка страницы/стили: `src/services/html.ts` (`pageShell()`, `escapeHtml()`)
- Legacy admin UI (Basic Auth, отдельный дизайн):
  - `src/routes/admin-ui.ts`
  - `src/routes/admin-ui-protected.ts`
  - JSON admin API, который дергает admin UI: `src/routes/admin-api.ts`, `src/routes/admin-protected.ts`
- Подключение роутов (где какие URL живут): `src/server.ts`

## 2) Глобальные UI-примитивы (то, что “похоже на дизайн-систему”)

### 2.1. Примитивы основного UI (`pageShell()`)

Источник: `src/services/html.ts`.

- Контейнер страницы: `.wrap` (max-width ~980px, padding)
- Карточка-контейнер: `.card` (полупрозрачный фон, рамка, скругление)
- Вторичный текст: `.muted`
- Навигация/чипсы: `.nav` + `.pill`
- Таблицы (список задач, таймлайн): `table`, `th`, `td` с “плашками” строк
- Контролы: `input`, `select`, `textarea`, `button`, `pre`

### 2.2. Примитивы auth UI (`layout()`)

Источник: `src/routes/auth-ui.ts`.

Там есть отдельная мини-обертка `layout(title, body)` и повторяющиеся классы `.wrap`, `.card`, `.row`, `.muted`, `.nav`, `.pill`, базовые стили форм.

### 2.3. Примитивы legacy admin UI

Источник: `src/routes/admin-ui.ts`.

- Используются CSS variables в `:root` (bg0/bg1/card/text/accent и т.д.)
- Сетка `.grid`, карточки `.card`, бейдж-статус `.pill` + `.dot`.
- JS-логика внутри `<script>` (fetch JSON API, логирование в `<pre id="out">`).

## 3) Карта страниц (routes → что на экране → какие действия)

Ниже перечислены страницы, как они доступны в браузере.

### 3.1. Login

- URL:
  - `GET /login` (показ формы)
  - `POST /login` (логин)
- Код:
  - Роутер: `authUiRouter()` в `src/routes/auth-ui.ts`
  - UI функция: `loginPage(error?)`
- Элементы:
  - Поля: `username`, `password`
  - Кнопка: `Login`
  - Ошибка (красным) при неверных кредах
- Действие:
  - `POST /login` → `authenticateUser()` (`src/security/sessions.ts`) + `createSession()` (`src/db/auth.ts`) + установка cookie `SESSION_COOKIE`

### 3.2. Init Admin (первичная инициализация)

- URL:
  - `GET /init?token=...` (страница создания первого админа)
  - `POST /init` (создание пользователя)
- Код:
  - Роутер: `authUiRouter()` в `src/routes/auth-ui.ts`
  - UI функция: `initAdminPage()`
- Элементы:
  - Поля: `token`, `username` (default `admin`), `password`
  - Кнопка: `Create Admin`
- Действие:
  - `POST /init` → `createUser()` + `createProject()` (создает `default`) + `createMembership()` + `createSession()`
- Валидации:
  - `INIT_ADMIN_TOKEN` должен совпасть
  - Пароль минимум 8 символов
  - Запрещено, если пользователь `admin` уже существует

### 3.3. Invite (принять приглашение)

- URL:
  - `GET /invite/:token`
  - `POST /invite/:token`
- Код:
  - `authUiRouter()` в `src/routes/auth-ui.ts`
  - UI функция: `invitePage(token)`
- Элементы:
  - Поля: `username`, `password`
  - Кнопка: `Create Account`
- Действие:
  - `POST /invite/:token` → `getInviteByTokenHash()` + `createUser()` + `consumeInvite()` + (если есть проекты) `createMembership(viewer)` + `createSession()`

### 3.4. Docs (внутренние ссылки/шпаргалка)

- URL: `GET /docs`
- Код: `authUiRouter()` в `src/routes/auth-ui.ts`
- Элементы:
  - Заголовок, статус логина
  - “Quick links”: `/health`, `/metrics`, `/api/v1/openapi.json`, `/app`
  - Текстовые блоки команд: docker compose / dev / init / curl examples
- Действий (кроме навигации) нет.

### 3.5. App / Projects (список проектов)

- URL:
  - `GET /app`
  - `POST /logout`
  - `POST /app/invites`
  - `POST /app/projects`
- Код:
  - `authUiRouter()` в `src/routes/auth-ui.ts`
  - UI функция: `appPage(username, projects)`
- Элементы:
  - Список проектов (пилюли-ссылки на `/p/:slug`)
  - Кнопка: `Logout`
  - Блок `Create Invite` → кнопка `Create Invite Link`
  - Блок `Create Project` → поля `slug`, `name`, кнопка `Create`
- Действия:
  - Logout: `deleteSession()` + очистка cookie
  - Create Invite: `createInvite()` (7 дней) и показ страницы с URL-инвайтом
  - Create Project: `createProject()` + `createMembership(role=admin)`

### 3.6. Project Dashboard (список задач проекта)

- URL: `GET /p/:slug`
- Код:
  - `projectTasksUiRouter()` в `src/routes/project-tasks-ui.ts`
  - UI функция: `projectDashboardPage(p, tasks, statusFilter, opts)`
- Элементы:
  - Верх: название проекта + табы (Home/Settings/Webhooks/API/Knowledge)
  - Фильтр по статусу (`select name="status"`) + кнопка `Apply`
  - Импорт из Asana: поле `days` + кнопка `Sync from Asana`
  - (Только admin/editor) Создание задачи в Asana:
    - `title`
    - `asana_project_gid` (select)
    - `notes` (textarea)
    - `repo` (select, optional)
    - `auto_enabled` (checkbox)
    - кнопка `Create Task`
  - Таблица задач: ID (ссылка на `/p/:slug/t/:id`), Status, Title, Issue, PR, CI, Updated
- Действия:
  - Фильтр: `GET /p/:slug?status=...` → `listTasksByProject(projectId, status?)`
  - Импорт: `POST /p/:slug/import/asana` → `importAsanaTasksForProject()` (см. 3.10)
  - Create Task: `POST /p/:slug/tasks/create`:
    - Asana: `AsanaClient.createTask()`
    - (опционально) выставление custom fields: `AsanaClient.setTaskCustomFields()`
    - запуск пайплайна: `processAsanaTaskStage5()`
    - лог события: `insertTaskEvent(kind='manual.create_task', ...)`

### 3.7. Task Details (карточка задачи)

- URL: `GET /p/:slug/t/:id`
- Код:
  - `projectTasksUiRouter()` в `src/routes/project-tasks-ui.ts`
  - UI функция: `taskPage(p, task, latestSpec, specs, events, repos, opts)`
- Элементы (информация):
  - Заголовок: `Task <id>`
  - Пилюли: `Status`, `Asana GID`
  - Ссылки (если есть): GitHub Issue / PR / CI
  - Title (plain text)
  - Latest TaskSpec (pre)
  - TaskSpec Versions (пилюли vN + timestamp)
  - Timeline (таблица событий)
- Элементы (действия, только admin/editor):
  - `POST /p/:slug/t/:id/retry` → кнопка `Retry pipeline`
    - Код: `processAsanaTaskStage5()` + `insertTaskEvent(kind='manual.retry')`
  - `POST /p/:slug/t/:id/resync` → кнопка `Re-sync from Asana`
    - Код: `processAsanaTaskStage5()` + `insertTaskEvent(kind='manual.resync')`
  - `POST /p/:slug/t/:id/repo/change` (только если issue еще не создан): select repo + `Change Repo`
    - Код: `AsanaClient.setTaskCustomFields()` + `insertTaskEvent(kind='manual.change_repo')` + `processAsanaTaskStage5()`
  - `POST /p/:slug/t/:id/pr/force` (только если issue уже есть):
    - Поле `pr` (номер или URL)
    - Select `repo` (optional)
    - Кнопка `Force Link PR`
    - Код: `GithubClient.getPullRequest()` + `attachPrToTaskById()` + `updateTaskStatusById()` + (если merged) `setMergeCommitShaByTaskId()` + (опционально) `finalizeTaskIfReady()`
  - `POST /p/:slug/t/:id/note` → textarea `note` + `Post Note`
    - Код: `AsanaClient.addComment()` + `insertTaskEvent(kind='manual.note')`
- Отдельный блок “Repo Required”:
  - Появляется если `status === 'NEEDS_REPO'` и `github_issue_number` отсутствует
  - `POST /p/:slug/t/:id/issue/create` → select repo + `Create Issue`
    - Код: выставление repo в Asana enum поле + `processAsanaTaskStage5()` + `insertTaskEvent(kind='manual.issue_create')`

### 3.8. Project Settings

- URL: `GET /p/:slug/settings`
- Код:
  - `authUiRouter()` в `src/routes/auth-ui.ts`
  - UI функция: `projectSettingsPage(...)`
- Навигация: те же табы (Home/Settings/Webhooks/API/Knowledge)
- Блоки и действия (все POST ниже требуют role=admin):
  1) Secrets (шифруются в БД)
     - `POST /p/:slug/settings/secrets`
     - Поля: `asana_pat`, `github_token`, `github_webhook_secret`, `opencode_workdir`
     - Код: `setProjectSecret(projectId, key, value)` (`src/services/project-secure-config.ts`)
  2) Asana custom fields (GID'ы)
     - `POST /p/:slug/settings/asana-fields`
     - Поля: `workspace_gid`, `auto_field_gid`, `repo_field_gid`, `status_field_gid`
     - Код: `upsertAsanaFieldConfig()`
  3) Asana status mapping (option name → ACTIVE/BLOCKED/CANCELLED)
     - Upsert: `POST /p/:slug/settings/asana-status-map` (поля `option_name`, `mapped_status`)
     - Delete: `POST /p/:slug/settings/asana-status-map/delete` (поле `option_name`)
     - Код: `upsertAsanaStatusMap()`, `deleteAsanaStatusMap()`
  4) Repo mapping override (Asana option name → owner/repo)
     - Upsert: `POST /p/:slug/settings/repo-map` (поля `option_name`, `owner`, `repo`)
     - Delete: `POST /p/:slug/settings/repo-map/delete` (поле `option_name`)
     - Код: `upsertRepoMap()`, `deleteRepoMap()`
  5) Asana projects list
     - Add: `POST /p/:slug/settings/asana/add` (поле `asana_project_gid`) → `addProjectAsanaProject()`
     - Remove: `POST /p/:slug/settings/asana/remove` (поле `asana_project_gid`) → `removeProjectAsanaProject()`
  6) GitHub repos list
     - Add/Update: `POST /p/:slug/settings/repos/add` (поля `owner`, `repo`, `is_default`) → `addProjectGithubRepo()`
     - Set default: `POST /p/:slug/settings/repos/default` (поля `owner`, `repo`) → `setDefaultRepo()`
     - Remove: `POST /p/:slug/settings/repos/remove` (поля `owner`, `repo`) → `removeProjectGithubRepo()`
  7) Contacts
     - Add: `POST /p/:slug/settings/contacts/add` (поля `role`, `name`, `handle`) → `addProjectContact()`
     - Delete: `POST /p/:slug/settings/contacts/delete` (поле `id`) → `deleteProjectContact()`
  8) Links
     - Add: `POST /p/:slug/settings/links/add` (поля `kind`, `url`, `title`, `tags`) → `addProjectLink()`
     - Delete: `POST /p/:slug/settings/links/delete` (поле `id`) → `deleteProjectLink()`

### 3.9. Project Webhooks

- URL:
  - `GET /p/:slug/webhooks`
  - `POST /p/:slug/webhooks/asana/setup`
  - `POST /p/:slug/webhooks/asana/sync-repos`
  - `POST /p/:slug/webhooks/github/validate`
- Код:
  - `projectWebhooksUiRouter()` в `src/routes/auth-ui-webhooks.ts`
  - UI функция: `webhooksPage(params)`
- Элементы:
  - Блок “GitHub webhook URL” (готовая URL)
  - Блок “Copy/paste” с подсказкой настроек GitHub
  - Блок “Asana webhook URL(s)” (по каждому Asana project gid)
  - Форма “Setup Asana webhooks”: поле `public_base_url` + кнопка
  - Кнопка “Sync repos to Asana Repo field” + вывод результата
  - Кнопка “Validate GitHub Webhooks” + вывод результата
  - “Webhook health” (текст: provider/asana_project_gid/webhook_gid/last_delivery_at)
- Действия:
  - Setup Asana: `AsanaClient.createWebhook()` + `upsertProjectWebhook()` + (опц.) `encryptWebhookSecret()`
  - Sync repos: `syncReposToAsanaRepoField()`
  - Validate GitHub: `GithubClient.listWebhooks()` и проверка совпадения URL

### 3.10. Import from Asana (результат)

- URL: `POST /p/:slug/import/asana`
- Код:
  - Роутер: `asanaImportUiRouter()` в `src/routes/asana-import-ui.ts`
  - Действие: `importAsanaTasksForProject({ projectId, projectSlug, days })` (`src/services/import-from-asana.ts`)
- Элементы:
  - Страница с `<pre>` где распечатан JSON результата (или текст ошибки)
  - Ссылка “Back”

## 4) Legacy Admin UI (/admin)

Это отдельная страница “быстрого старта” для инстанса целиком (не per-project), живет под Basic Auth.

### 4.1. Admin UI page

- URL: `GET /admin/` (в коде: `adminUiRouter()` монтируется на `/admin`)
- Код:
  - UI: `src/routes/admin-ui.ts` (`adminUiRouter()`)
  - Защита: `src/routes/admin-ui-protected.ts` (`requireAdminBasicAuth`)
- Карточки/элементы:
  1) “Credentials & Repo”
     - Поля: `Asana PAT`, `GitHub Token`, `GitHub Owner`, `GitHub Repo`, `Asana Project GID`, `Public Base URL`
     - Кнопки: `Save Config`, `Reload`
  2) “OpenCode”
     - Поля: `Mode`, `Endpoint (optional)`, `Local Repo Path (workdir)`
     - Кнопки: `Save OpenCode`, `Launch OpenCode`
  3) “Webhooks”
     - Поля: `GitHub Webhook Secret`, `Asana Webhook Secret`, `Asana Resource GID (project)`, `Asana Target URL (optional)`
     - Кнопки: `Save Webhook Secrets`, `Setup Asana Webhook`, `List Tasks`
     - Лог: `<pre id="out">`

### 4.2. JS actions → admin JSON API

Источник JS: `<script>` внутри `src/routes/admin-ui.ts`.

- `Save Config` → `POST /api/admin/config`
  - Backend: `adminApiRouter()` в `src/routes/admin-api.ts`
  - Storage: `setConfig(key, value)` в `src/services/secure-config.ts`
- `Save OpenCode` → `POST /api/admin/config` (ключи `OPENCODE_*`)
- `Launch OpenCode` → `POST /api/admin/opencode/launch`
  - Backend: `openCodeRouter()` в `src/routes/opencode.ts`
  - Execution: `launchOpenCodeInTerminal()` в `src/services/opencode-launch.ts`
- `Save Webhook Secrets` → `POST /api/admin/webhooks/secrets`
  - Backend: `adminApiRouter()`
  - Storage: `upsertWebhookConfig()` (`src/db/secrets.ts`) + дублирование в app config через `setConfig()`
- `Setup Asana Webhook` → `POST /api/admin/asana/webhooks/setup`
  - Backend: `adminApiRouter()`
  - Asana: `AsanaClient.createWebhook()`
- `List Tasks` → `GET /api/admin/tasks`
  - Backend: `listTasks()` (`src/db/tasks-v2.ts`)

## 5) Роли и доступы (важно для UI)

- Основной UI:
  - Все `/app`, `/p/...` требуют cookie-сессию: `requireSession` (`src/security/sessions.ts`)
  - `viewer` — только чтение (например, видит dashboard/task, но без кнопок действий)
  - `editor` — может запускать часть действий (create task/import/retry/resync/notes)
  - `admin` — может менять settings/webhooks/api tokens/knowledge/secrets
- Legacy admin UI:
  - `/admin/*` и `/api/admin/*` защищены Basic Auth: `requireAdminBasicAuth` (`src/security/admin-basic-auth.ts`)

## 6) Что “рисовать” в редизайне (в терминах экранов)

Если ты идешь в UI-генератор, удобнее просить макеты по экранам:

1) Login
2) Init Admin
3) Projects list (/app) + modals/sections: Create Project, Create Invite
4) Project Dashboard (/p/:slug): фильтр, импорт, создание задачи, таблица
5) Task Details (/p/:slug/t/:id): header + action panel + spec/timeline
6) Project Settings (/p/:slug/settings): большой “настройки” экран с секциями
7) Project Webhooks (/p/:slug/webhooks): инструкции + действия + статусы
8) Project API (/p/:slug/api): список токенов + create/revoke + “показать токен один раз”
9) Project Knowledge (/p/:slug/knowledge): markdown editor
10) Legacy Admin (/admin): “инстанс-конфиг” (если оставляем)
