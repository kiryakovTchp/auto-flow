# Техническая спецификация для разработки оркестратора (Asana → GitHub → OpenCode)

Этот файл — основной референс по проекту; в следующих задачах буду опираться на него.

## 1. Назначение

Создать оркестратор, который координирует автоматическое выполнение задач с участием:

- Asana (таск-трекер)
- GitHub (контроль версий и CI/CD)
- OpenCode (AI-агент, может исполняться на сервере оркестратора или на клиенте)

Оркестратор **не вызывает AI напрямую**, а координирует события между Asana и GitHub и может запускать OpenCode CLI в режиме server-runner. OpenCode также может работать на клиентской машине.

---

## 2. Инфраструктура

- Язык реализации: **Node.js + TypeScript**
- СУБД: **PostgreSQL**
- API: REST, JSON
- Сервер: внешний, публичный (с SSL), способен принимать webhooks

---

## 3. Поведение системы

### 3.1. Поток данных (пайплайн)

1. Менеджер создаёт задачу в Asana и ставит тег `#AutoTask`
2. Оркестратор получает webhook-событие, вытягивает полные данные задачи
3. Оркестратор формирует TaskSpec в Markdown
4. Оркестратор создаёт **GitHub Issue**, вставляет туда TaskSpec и команду `/opencode implement`
5. Агент OpenCode (server-runner или клиент) читает Issue, выполняет задачу и создаёт PR
6. Оркестратор отслеживает появление PR, merge и CI-статус, и обновляет Asana

### 3.2. Состояния задачи

- `RECEIVED` — получена из Asana
- `TASKSPEC_CREATED` — сформирован TaskSpec
- `ISSUE_CREATED` — создан Issue в GitHub
- `PR_CREATED` — OpenCode создал PR
- `DEPLOYED` — PR замёржен, задача выполнена
- `FAILED` — ошибка, лог приложен

---

## 4. Компоненты системы

### 4.1. Оркестратор

Сервис, работающий постоянно и принимающий события от Asana и GitHub.

#### Webhook: Asana → Оркестратор

- URL: `POST /webhook/asana`
- Проверка подписи: через `X-Hook-Signature`
- Типы событий:
  - `task.created`
  - `task.updated` (если тег добавлен или колонка изменилась)

#### Webhook: GitHub → Оркестратор

- URL: `POST /webhook/github`
- События:
  - `pull_request.opened`
  - `pull_request.closed`
  - `pull_request.merged`
  - `issue_comment.created`

#### Хранилище (PostgreSQL)

Таблица `tasks`:

- `id`
- `asana_gid`
- `title`
- `status`
- `github_issue_url`
- `github_pr_url`
- `created_at`, `updated_at`

Таблица `taskspecs`:

- `id`, `task_id`
- `version`
- `markdown`
- `created_at`

#### API для отладки

- `GET /tasks` — список задач
- `GET /tasks/{id}` — детализация
- `POST /tasks/{id}/retry` — перезапуск формирования TaskSpec

---

## 5. Формат TaskSpec (Markdown)

```markdown
**Task ID:** ASANA-1234
**Title:** [order] Add cancel button to OrderForm
**Context:**
- В OrderForm.jsx нет кнопки отмены, что вызывает жалобы пользователей.
**Requirements:**
1. Добавить кнопку Cancel
2. Закрывать форму без сохранения
**Constraints:**
- Без новых зависимостей
**Acceptance Criteria:**
- [ ] Кнопка отображается
- [ ] При отмене заказ не создаётся
- [ ] Есть unit-тест
```

TaskSpec вставляется как тело GitHub issue. В конец добавляется строка:

```text
/opencode implement
```

---

## 6. Требования к окружению

### 6.1. Secrets (переменные окружения)

- `ASANA_TOKEN`: Personal Access Token Asana
- `GITHUB_TOKEN`: PAT GitHub с правами repo, issues
- `OPENCODE_OAUTH_*`: OAuth конфиг для подключения OpenCode (server-runner)
- `DATABASE_URL`: строка подключения PostgreSQL

### 6.2. Внешние зависимости

- Сервер Node.js (Fastify или Express)
- GitHub Repo с включённым CI
- Проект в Asana с webhook

---

## 7. Поведение при ошибках

- Если не хватает данных из Asana → комментарий в задаче, статус `FAILED`
- Если создание Issue/PR не удалось → лог ошибки, статус `FAILED`
- Все ошибки логируются в БД и в stdout

---

## 8. Как тестировать

- Подготовить тестовую задачу в Asana (тег `#AutoTask`)
- Убедиться, что появился GitHub issue
- OpenCode агент на клиенте должен среагировать и создать PR
- После merge PR, задача должна быть закрыта в Asana

---

## 9. Что не входит в MVP

- Генерация TaskSpec через LLM — опционально
- Деплой — выполняется через CI/CD GitHub, не из оркестратора
- Запуск OpenCode — на клиенте, вне зоны ответственности оркестратора
