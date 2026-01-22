Делаю полный подробный бриф с переводом на русский/английский:

UI Redesign Brief — Auto-Flow (OpenCode-style) — EN/RU
GENERAL STYLE
Visual Theme: Light theme, white/light-gray background (#FAFAFA or #FFFFFF), dark text (#1A1A1A)
Accent Color: Blue (#3B82F6) for primary buttons, links, active tabs
Typography: Inter for UI, JetBrains Mono for code blocks and technical data
Border Radius: 8px for cards and modals, 6px for buttons and inputs
Shadows: Soft box-shadow instead of borders (0 1px 3px rgba(0,0,0,0.1))
Spacing: 16px base, 24px between sections
Language Selector: Top-right corner, flag icon (🇬🇧 EN / 🇷🇺 RU), toggle button

LAYOUTS
Auth Layout (Login, Init Admin, Invite)
Centered card on gray background (#F3F4F6)

Logo top, form inside, minimal elements

Language selector: top-right corner

Project Workspace Layout (/p/:slug/*)
Top-bar: project name left, tabs right (Home | Settings | Webhooks | API | Knowledge)

Tabs: active = blue underline, like code-editor

Content: max-width 1200px, padding 24px

Language selector: top-right corner, inside top-bar

Instance Admin Layout (/admin)
Same light style, orange accent (#F59E0B) as "danger zone"

Language selector: top-right

BUTTONS
Primary: Blue background (#3B82F6), white text, hover darker
Secondary: White background, blue border, blue text
Danger: Red (#EF4444) for delete/revoke
Ghost: No background, text + icon only
Sizes: Small (8px vert pad), Medium (10px vert pad, default), Large (12px vert pad)
All buttons: 6px border-radius, 14px font-size

FORMS
Label: Above input, gray (#6B7280), 12px, uppercase, bold

Input: White background, light gray border (#E5E7EB), focus = blue border + blue shadow

Placeholder: Light gray (#9CA3AF), 14px

Helper text: Below input, gray (#6B7280), 12px, italic

Error: Red border + red text below input (#EF4444)

Success: Green border + green checkmark (#10B981)

Full-width: All inputs stretch to 100%

CODE BLOCKS
Background: #F3F4F6

Font: JetBrains Mono, 12px

Padding: 12px

Border: 1px solid #E5E7EB

Border-radius: 6px

Copy icon: top-right corner, hover = show tooltip "Copied!"

TABLES
Header: Gray background (#F9FAFB), bold, dark text

Rows: White background, hover = #F3F4F6

Status pills:

ACTIVE = green (#10B981) background, white text

BLOCKED = yellow (#F59E0B) background, dark text

CANCELLED = gray (#6B7280) background, white text

Icons: GitHub (octocat icon), PR (merge icon), CI (gear icon)

MODALS
White card, 8px border-radius, soft shadow

Dark backdrop (rgba(0,0,0,0.5)), click outside to close

Close button (X) top-right

Title (bold, 18px), content, footer with buttons

ALERTS / TOASTS
Success: Green background (#D1FAE5), green text (#047857), green left border

Error: Red background (#FEE2E2), red text (#DC2626), red left border

Warning: Yellow background (#FEF3C7), yellow text (#92400E), yellow left border

Info: Blue background (#DBEAFE), blue text (#0369A1), blue left border

SCREENS (DETAILED)
SCREEN 1: LOGIN (/login)
Purpose: User (any role) authenticates with username/password

Layout: Centered card on gray background

Logo: Auto-Flow (or icon), 40px, centered, top of card

Form:

text
[ Username ]
  Label: "Username"
  Placeholder: "user@example.com or username"
  Helper: "Your account username"
  Type: text

[ Password ]
  Label: "Password"
  Placeholder: "••••••••"
  Type: password
  Helper: "At least 8 characters"

[ Login Button ]
  Text (EN): "Login"
  Text (RU): "Войти"
  Type: Primary
  Width: Full
  Action: POST /login → createSession() + set SESSION_COOKIE + redirect to /app
Error Handling:

text
If login fails:
  Alert (top of form):
    Text (EN): "Invalid username or password"
    Text (RU): "Неверное имя пользователя или пароль"
    Type: Error
Language Selector: Top-right corner, toggle button

SCREEN 2: INIT ADMIN (/init?token=...)
Purpose: First-time setup, create admin user

Layout: Centered card

Form:

text
[ Init Token ]
  Label: "Init Token"
  Placeholder: "paste token here"
  Type: password (hidden)
  Helper (EN): "One-time token from INIT_ADMIN_TOKEN env variable"
  Helper (RU): "Одноразовый токен из переменной INIT_ADMIN_TOKEN"

[ Username ]
  Label: "Username"
  Placeholder: "admin"
  Type: text
  Helper (EN): "Default: admin"
  Helper (RU): "По умолчанию: admin"

[ Password ]
  Label: "Password"
  Placeholder: "••••••••"
  Type: password
  Helper (EN): "Minimum 8 characters"
  Helper (RU): "Минимум 8 символов"

[ Create Admin Button ]
  Text (EN): "Create Admin"
  Text (RU): "Создать администратора"
  Type: Primary
  Width: Full
  Action: POST /init → createUser() + createProject("default") + createMembership(admin) + createSession() + redirect to /app
Validations:

Token must match INIT_ADMIN_TOKEN

Password >= 8 chars

If user "admin" already exists: show error "Admin user already created"

Error Handling: Same as Login

SCREEN 3: INVITE (/invite/:token)
Purpose: New user accepts invite and creates account

Layout: Centered card

Form:

text
[ Username ]
  Label: "Username"
  Placeholder: "john_doe"
  Type: text
  Helper (EN): "Choose your username"
  Helper (RU): "Выберите имя пользователя"

[ Password ]
  Label: "Password"
  Placeholder: "••••••••"
  Type: password
  Helper (EN): "Minimum 8 characters"
  Helper (RU): "Минимум 8 символов"

[ Create Account Button ]
  Text (EN): "Create Account"
  Text (RU): "Создать аккаунт"
  Type: Primary
  Width: Full
  Action: POST /invite/:token → getInviteByTokenHash() + createUser() + consumeInvite() + createMembership(viewer) + createSession() + redirect to /app
Error States:

Invalid/expired token: "Invite link expired or invalid"

Username taken: "Username already exists"

SCREEN 4: PROJECTS LIST (/app)
Purpose: User sees all their projects, creates new ones

Layout: Full-width, top-bar with "Projects" title and Logout button (right)

Top-bar:

text
[ Projects ] ←title, 24px, bold
                          [ Logout Button ] [ Language Selector ]
Projects Grid:

text
Card (white background, 8px radius, hover shadow):
  Project Name (16px bold blue link)
  Slug: auto-flow (12px gray)
  Created: 2024-01-15 (12px muted)
  Your role: Admin (12px green pill)
  Click → /p/:slug
Action Buttons (sticky bottom-right or inline):

text
[ Create Project ]
  Type: Primary
  Text (EN): "Create Project"
  Text (RU): "Создать проект"
  Action: Click → Modal "Create Project"

[ Create Invite ]
  Type: Secondary
  Text (EN): "Create Invite Link"
  Text (RU): "Создать ссылку приглашения"
  Action: Click → Modal "Create Invite"
Modal: Create Project:

text
Title (EN): "Create New Project"
Title (RU): "Создать новый проект"

[ Project Slug ]
  Label: "Project Slug"
  Placeholder: "my-awesome-project"
  Type: text
  Helper (EN): "Lowercase, hyphens only, max 50 chars"
  Helper (RU): "Только прописные буквы, дефисы, максимум 50 символов"
  Validation: Regex /^[a-z0-9-]+$/, length <= 50

[ Project Name ]
  Label: "Project Name"
  Placeholder: "My Awesome Project"
  Type: text
  Helper (EN): "Display name, any format"
  Helper (RU): "Отображаемое имя, любой формат"

Buttons:
  [ Create ] (Primary)
  [ Cancel ] (Ghost)

Action: POST /app/projects → createProject() + createMembership(admin) + redirect to /p/:slug
Modal: Create Invite:

text
Title (EN): "Create Invite Link"
Title (RU): "Создать ссылку приглашения"

After creation, show:
  Code block with URL:
  https://your-domain/invite/abc123def...
  
  Helper (EN): "Share this link, valid for 7 days"
  Helper (RU): "Поделитесь этой ссылкой, действует 7 дней"
  
  Button: [ Copy Link ] (Primary)
  Button: [ Close ] (Ghost)

Action: POST /app/invites → createInvite(7 days) → return invite URL
Language Selector: Top-right, next to Logout

SCREEN 5: PROJECT DASHBOARD (/p/:slug)
Purpose: User sees all tasks for this project, filters, imports, creates new tasks

Layout:

text
[Top-bar with tabs]
[Action bar with filters & buttons]
[Task table]
Top-bar:

text
[ Project Name (slug) ] ←left, bold, 18px
[ Home | Settings | Webhooks | API | Knowledge ] ←tabs, active blue underline
                                            [ Language Selector ] [ User menu ]
Status Badge (next to project name):

text
ACTIVE / BLOCKED / CANCELLED — as pill badge, small
Shows overall project status (optional, if available in DB)
Action Bar (below tabs, compact):

text
[ Status: (dropdown ALL, ACTIVE, BLOCKED, CANCELLED) ] [ Apply Button (Secondary) ]
                                                    [ Sync from Asana ] (Secondary)
                                                    [ Create Task ] (Primary)
Dropdown Helper (EN): "Filter tasks by status"
Dropdown Helper (RU): "Фильтр задач по статусу"

Button: Sync from Asana:

text
Text (EN): "Sync from Asana"
Text (RU): "Синхронизация из Asana"
Type: Secondary
Action: Click → Modal "Import Settings"
Modal: Import Settings:

text
Title (EN): "Import from Asana"
Title (RU): "Импорт из Asana"

[ Last N days ]
  Label: "Import tasks updated in last N days"
  Label (RU): "Импортировать задачи, обновлённые за последние N дней"
  Placeholder: "90"
  Type: number
  Helper: "Default 90, max 365"

Buttons:
  [ Sync ] (Primary)
  [ Cancel ] (Ghost)

Action: POST /p/:slug/import/asana → importAsanaTasksForProject(days) → show result page with JSON logs
Button: Create Task (only if role = admin or editor):

text
Text (EN): "Create Task"
Text (RU): "Создать задачу"
Type: Primary
Action: Click → Modal "Create Task"
Modal: Create Task (only admin/editor):

text
Title (EN): "Create Task in Asana"
Title (RU): "Создать задачу в Asana"

[ Task Title ]
  Label: "Title"
  Label (RU): "Название"
  Placeholder: "Fix login button alignment"
  Type: text
  Helper (EN): "Task title as it appears in Asana"
  Helper (RU): "Название задачи, как оно будет показано в Asana"

[ Asana Project ]
  Label: "Asana Project"
  Label (RU): "Проект Asana"
  Type: select
  Options: (list from DB, loaded from Asana)
  Helper (EN): "Which Asana project to create task in"
  Helper (RU): "В какой проект Asana создать задачу"

[ Notes ]
  Label: "Notes (optional)"
  Label (RU): "Заметки (опционально)"
  Placeholder: "Additional task details..."
  Type: textarea
  Rows: 4

[ Repository ]
  Label: "Repository (optional)"
  Label (RU): "Репозиторий (опционально)"
  Type: select
  Options: (list from project settings)
  Helper (EN): "Link to GitHub repo (optional, can be set later)"
  Helper (RU): "Связать с GitHub репозиторием (опционально, можно установить позже)"

[ Auto-enabled ]
  Label: "Auto-enabled"
  Label (RU): "Автоматически включить"
  Type: checkbox
  Helper (EN): "Automatically run pipeline when task is created"
  Helper (RU): "Автоматически запустить конвейер при создании задачи"

Buttons:
  [ Create Task ] (Primary)
  [ Cancel ] (Ghost)

Action: POST /p/:slug/tasks/create → AsanaClient.createTask() + setTaskCustomFields() + processAsanaTaskStage5() + insertTaskEvent(manual.create_task)
Task Table:

text
Columns:
  ID (link to /p/:slug/t/:id)
  Status (pill: ACTIVE green, BLOCKED yellow, CANCELLED gray, NEEDS_REPO orange)
  Title (truncate if long)
  Issue (GitHub issue icon, if linked click → GitHub)
  PR (GitHub PR icon, if linked click → GitHub)
  CI (CI status icon, if available)
  Updated (date, e.g., "2 days ago")

Row behavior:
  Click row → navigate to /p/:slug/t/:id
  Hover → show subtle background color change

Empty state (no tasks):
  Text (EN): "No tasks yet. Click 'Sync from Asana' or 'Create Task' to get started."
  Text (RU): "Нет задач. Нажмите 'Синхронизация из Asana' или 'Создать задачу', чтобы начать."
  Icon: (empty inbox illustration)
SCREEN 6: TASK DETAILS (/p/:slug/t/:id)
Purpose: User (any role) sees task details; admin/editor can perform actions

Layout:

text
[Top-bar with tabs]
[Task header]
[Two-column: left actions, right timeline]
Task Header:

text
Title (EN): "Task #ID"
Title (RU): "Задача #ID"
Subtitle: Status pill + Asana GID (link) + Created date

Status pill: ACTIVE (green) | BLOCKED (yellow) | CANCELLED (gray) | NEEDS_REPO (orange)

Links:
  If has github_issue_number: [ GitHub Issue #123 ] (link, blue, with icon)
  If has github_pr_number: [ GitHub PR #456 ] (link, blue, with icon)
  If has ci_status: [ CI Status: PASS/FAIL ] (link or text)
Left Column (Actions):

text
[ Task Title ]
  Label: "Title"
  Value: plain text (read-only) or editable (if admin)
  
[ Latest Spec ]
  Label: "Latest Spec"
  Label (RU): "Последняя спецификация"
  Code block: JSON (read-only)
  
[ Spec Versions ]
  Label: "Spec Versions"
  Label (RU): "Версии спецификации"
  Pills: v1 (timestamp), v2 (timestamp), ...
  Click → show spec for that version

[ Action Panel ] ←only if role = admin or editor
  Grouped by category:
  
  **Pipeline**:
    [ Retry Pipeline ] (Secondary)
    Text (EN): "Retry"
    Text (RU): "Повторить"
    Action: POST /p/:slug/t/:id/retry → processAsanaTaskStage5() + insertTaskEvent(manual.retry)
    
    [ Re-sync from Asana ] (Secondary)
    Text (EN): "Re-sync"
    Text (RU): "Пересинхронизировать"
    Action: POST /p/:slug/t/:id/resync → processAsanaTaskStage5() + insertTaskEvent(manual.resync)
  
  **GitHub**:
    (If status = NEEDS_REPO and no issue):
      [ Create Issue ]
      Text (EN): "Create Issue"
      Text (RU): "Создать Issue"
      Type: Primary
      
      Modal:
        [ Repository ]
          Label: "Repository"
          Label (RU): "Репозиторий"
          Type: select
          Options: (from project settings)
        [ Create ] (Primary)
        Action: POST /p/:slug/t/:id/issue/create → setTaskCustomFields(repo) + processAsanaTaskStage5()
    
    (If issue exists):
      [ Change Repo ] (Secondary)
      Text (EN): "Change Repo"
      Text (RU): "Изменить репозиторий"
      Visible only if no issue_number yet
      
      [ Force Link PR ] (Primary)
      Text (EN): "Link PR"
      Text (RU): "Связать PR"
      
      Modal:
        [ PR Number or URL ]
          Label: "PR Number or URL"
          Label (RU): "Номер PR или ссылка"
          Placeholder: "123 or https://github.com/..."
          Type: text
        
        [ Repository (optional) ]
          Label: "Repository (optional)"
          Type: select
          Helper: "Auto-detect from URL if possible"
        
        [ Force Link ] (Primary)
        Action: POST /p/:slug/t/:id/pr/force → GithubClient.getPullRequest() + attachPrToTaskById() + updateTaskStatusById()
  
  **Asana**:
    [ Post Note ]
    Text (EN): "Add Note"
    Text (RU): "Добавить заметку"
    
    Textarea:
      Placeholder: "Your comment..."
      Helper: "Will be posted as comment in Asana"
    
    Button: [ Post ] (Primary)
    Action: POST /p/:slug/t/:id/note → AsanaClient.addComment() + insertTaskEvent(manual.note)
  
  **More Actions** (if many, collapse to dropdown):
    [ More ▼ ]
    Dropdown:
      - Archive Task
      - Delete Local Task (remove from auto-flow DB)
Right Column (Timeline):

text
[ Timeline ]
  Label: "Timeline"
  Label (RU): "Хронология"
  
  Table format:
    Columns: Timestamp | Event | Details
    
    Event types:
      - manual.create_task: "Task created"
      - manual.retry: "Pipeline retried"
      - manual.resync: "Re-synced from Asana"
      - manual.change_repo: "Repository changed to X"
      - manual.issue_create: "GitHub issue #X created"
      - manual.note: "Note added"
      - webhook.asana: "Updated from Asana webhook"
      - webhook.github: "Updated from GitHub webhook"
      - stage.5_start: "Pipeline stage 5 started"
      - stage.5_complete: "Pipeline stage 5 completed"
      - error.*: "Error: ..." (red text)
    
    Rows: gray background alternating, hover effect
    
    If no events: "No activity yet"
SCREEN 7: PROJECT SETTINGS (/p/:slug/settings)
Purpose: Admin configures project integrations, repos, contacts, links

Layout:

text
[Top-bar with tabs]
[Sections with cards, each section contains forms]
Top-bar: Same as Dashboard

Sections (each in white card, 8px radius, padding 24px):

SECTION 1: SECRETS
Title (EN): "Secrets"
Title (RU): "Секреты"
Description (EN): "Project-level tokens for Asana, GitHub and local runner. Encrypted in database."
Description (RU): "Токены на уровне проекта для Asana, GitHub и локального обработчика. Зашифрованы в базе данных."

Form:

text
[ Asana PAT ]
  Label: "Asana Personal Access Token"
  Label (RU): "Личный маркер доступа Asana"
  Placeholder: "1/1234567890abcdef..."
  Type: password (masked)
  Helper (EN): "Token must have access to all configured Asana projects."
  Helper (RU): "Токен должен иметь доступ ко всем настроенным проектам Asana."
  Link (EN): "How to create PAT in Asana →"
  Link (RU): "Как создать PAT в Asana →"
  URL: https://developers.asana.com/docs/personal-access-token
  
  Button: "Reveal" (small, ghost) to toggle masked/visible
  Note (EN): "Last updated: 2024-01-15"
  Note (RU): "Последнее обновление: 2024-01-15"

[ GitHub Token ]
  Label: "GitHub Personal Access Token"
  Label (RU): "Личный маркер доступа GitHub"
  Placeholder: "ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
  Type: password
  Helper (EN): "Needs 'repo' and 'admin:repo_hook' scopes for selected repositories."
  Helper (RU): "Требуется 'repo' и 'admin:repo_hook' области для выбранных репозиториев."
  Link (EN): "Create GitHub token →"
  Link (RU): "Создать токен GitHub →"
  URL: https://github.com/settings/tokens?scopes=repo,admin:repo_hook
  
  Button: "Reveal"
  Note: "Last updated: 2024-01-15"

[ GitHub Webhook Secret ]
  Label: "GitHub Webhook Secret"
  Label (RU): "Секрет GitHub вебхука"
  Placeholder: "••••••••"
  Type: password
  Helper (EN): "Used to validate incoming GitHub webhook signatures. Keep it secret!"
  Helper (RU): "Используется для валидации подписей входящих вебхуков GitHub. Держите в секрете!"
  
  Button: "Reveal"
  Button: "Generate New" (Danger, opens confirm dialog)
  
  Confirm dialog:
    Title (EN): "Generate New Secret?"
    Title (RU): "Сгенерировать новый секрет?"
    Text (EN): "This will invalidate the current secret. Update your GitHub webhook settings."
    Text (RU): "Это аннулирует текущий секрет. Обновите настройки вебхука GitHub."
    [ Yes, Generate ] (Danger)
    [ Cancel ] (Ghost)

[ OpenCode workdir ]
  Label: "OpenCode workdir path"
  Label (RU): "Путь к рабочей директории OpenCode"
  Placeholder: "/home/opencode/workspaces/project-x"
  Type: text
  Helper (EN): "Local path where OpenCode will clone and run the repository."
  Helper (RU): "Локальный путь, где OpenCode будет клонировать и запускать репозиторий."
  Link: "What is OpenCode? →"
  URL: https://github.com/openreplay/opencode (or internal docs)

[ Save Secrets ]
  Type: Primary
  Text (EN): "Save Secrets"
  Text (RU): "Сохранить секреты"
  Action: POST /p/:slug/settings/secrets → setProjectSecret(asana_pat, github_token, ...) → show green success toast
  
  Success Toast (EN): "Secrets saved successfully"
  Success Toast (RU): "Секреты успешно сохранены"
  
  Error: Red alert with validation message
SECTION 2: ASANA CONFIGURATION
Title (EN): "Asana Custom Fields"
Title (RU): "Пользовательские поля Asana"
Description (EN): "Workspace GID and custom field GIDs for auto-flow integration."
Description (RU): "Workspace GID и GID пользовательских полей для интеграции с auto-flow."

Form:

text
[ Workspace GID ]
  Label: "Workspace GID"
  Placeholder: "1234567890"
  Type: text
  Helper (EN): "Asana workspace GID. Find in Asana URL: app.asana.com/0/WORKSPACE_GID/..."
  Helper (RU): "Workspace GID в Asana. Найдите в URL: app.asana.com/0/WORKSPACE_GID/..."
  Link: "What's my Workspace GID? →"
  URL: https://developers.asana.com/docs/workspaces

[ Auto Field GID ]
  Label: "Auto Field GID"
  Placeholder: "1234567890"
  Type: text
  Helper (EN): "Custom field GID for 'Auto' (checkbox, e.g., auto-enabled toggle)"
  Helper (RU): "GID пользовательского поля для 'Auto' (флажок, например, переключатель автозапуска)"

[ Repo Field GID ]
  Label: "Repo Field GID"
  Placeholder: "1234567890"
  Type: text
  Helper (EN): "Custom field GID for repository mapping (enum/dropdown)"
  Helper (RU): "GID пользовательского поля для отображения репозитория (enum/dropdown)"

[ Status Field GID ]
  Label: "Status Field GID"
  Placeholder: "1234567890"
  Type: text
  Helper (EN): "Custom field GID for task status (enum/dropdown)"
  Helper (RU): "GID пользовательского поля для статуса задачи (enum/dropdown)"

[ Save ]
  Type: Primary
  Text: "Save"
  Action: POST /p/:slug/settings/asana-fields → upsertAsanaFieldConfig() → success toast
SECTION 3: ASANA STATUS MAPPING
Title (EN): "Status Mapping"
Title (RU): "Отображение статусов"
Description (EN): "Map Asana custom field options to auto-flow statuses."
**Description (RU): "Отобразите параметры пользовательского поля Asana на статусы auto-flow."

Table:

text
Columns:
  Asana Option | Mapped Status | Actions

Rows (editable):
  "To Do" | ACTIVE | [ Delete ]
  "In Progress" | ACTIVE | [ Delete ]
  "Done" | ACTIVE | [ Delete ]
  "Blocked" | BLOCKED | [ Delete ]
  "Cancelled" | CANCELLED | [ Delete ]

Add Row Button:
  [ + Add Status Mapping ]
  
  Modal:
    [ Asana Option Name ]
      Label: "Asana Option"
      Label (RU): "Опция Asana"
      Placeholder: "To Do"
      Type: text
    
    [ Mapped Status ]
      Label: "Map to Status"
      Label (RU): "Отобразить на статус"
      Type: select
      Options: ACTIVE, BLOCKED, CANCELLED
    
    [ Add ] (Primary)
    Action: POST /p/:slug/settings/asana-status-map → upsertAsanaStatusMap()

Delete Button per row:
  Action: POST /p/:slug/settings/asana-status-map/delete?option_name=... → deleteAsanaStatusMap() → remove row
SECTION 4: REPOSITORY MAPPING
Title (EN): "Repository Mapping (Optional)"
Title (RU): "Отображение репозитория (опционально)"
Description (EN): "Override default repo per Asana enum option (e.g., 'Frontend' → owner/frontend-repo)."
Description (RU): "Переопределить репозиторий по умолчанию для каждой опции Asana enum (например, 'Frontend' → owner/frontend-repo)."

Table:

text
Columns:
  Asana Option | Owner | Repo | Actions

Rows:
  "Frontend" | owner | frontend-repo | [ Delete ]
  "Backend" | owner | backend-repo | [ Delete ]

Add Row Button:
  [ + Add Repo Mapping ]
  
  Modal:
    [ Asana Option Name ]
      Label: "Asana Option"
      Placeholder: "Frontend"
      Type: text
    
    [ Owner ]
      Label: "GitHub Owner"
      Placeholder: "my-org"
      Type: text
    
    [ Repo Name ]
      Label: "Repository Name"
      Placeholder: "frontend-repo"
      Type: text
    
    [ Add ] (Primary)
    Action: POST /p/:slug/settings/repo-map → upsertRepoMap()

Delete Button:
  Action: POST /p/:slug/settings/repo-map/delete → deleteRepoMap()
SECTION 5: ASANA PROJECTS
Title (EN): "Asana Projects"
Title (RU): "Проекты Asana"
Description (EN): "Select which Asana projects to sync tasks from."
Description (RU): "Выберите, из каких проектов Asana синхронизировать задачи."

List:

text
Cards per project:
  [ Asana Project Name (link to Asana) ] [ Delete Button ]
  GID: 1234567890

Add Button:
  [ + Add Asana Project ]
  
  Modal:
    [ Asana Project GID ]
      Label: "Project GID"
      Placeholder: "1234567890"
      Type: text
      Helper: "Find GID in Asana project URL: app.asana.com/0/PROJECT_GID/..."
    
    [ Add ] (Primary)
    Action: POST /p/:slug/settings/asana/add → addProjectAsanaProject() → reload list

Delete per project:
  Confirm: "Remove this Asana project from sync?"
  Action: POST /p/:slug/settings/asana/remove → removeProjectAsanaProject()
SECTION 6: GITHUB REPOSITORIES
Title (EN): "GitHub Repositories"
Title (RU): "Репозитории GitHub"
Description (EN): "Repositories where auto-flow will create issues and sync PRs."
Description (RU): "Репозитории, где auto-flow будет создавать проблемы и синхронизировать PR'ы."

List:

text
Cards per repo:
  [ owner/repo-name ]
  Default: ✓ (badge if is_default)
  Created: 2024-01-15
  [ Set Default ] [ Delete ]

Add Button:
  [ + Add Repository ]
  
  Modal:
    [ GitHub Owner ]
      Label: "Owner"
      Placeholder: "my-org"
      Type: text
    
    [ Repository Name ]
      Label: "Repository"
      Placeholder: "my-repo"
      Type: text
    
    [ Set as Default ]
      Type: checkbox
      Helper: "Default repo for new issues"
    
    [ Add ] (Primary)
    Action: POST /p/:slug/settings/repos/add → addProjectGithubRepo()

Set Default Button:
  Action: POST /p/:slug/settings/repos/default → setDefaultRepo() → update badge
  
Delete Button:
  Confirm: "Remove this repository? Existing issues will not be affected."
  Action: POST /p/:slug/settings/repos/remove → removeProjectGithubRepo()
SECTION 7: CONTACTS
Title (EN): "Contacts"
Title (RU): "Контакты"
Description (EN): "Team members and stakeholders (for reference, notifications, etc.)."
Description (RU): "Члены команды и заинтересованные стороны (для справки, уведомлений и т.д.)."

Table:

text
Columns:
  Role | Name | Handle | Actions

Rows:
  "Developer" | "John Doe" | "john_doe" | [ Delete ]
  "DevOps" | "Jane Smith" | "jane_smith" | [ Delete ]

Add Row Button:
  [ + Add Contact ]
  
  Modal:
    [ Role ]
      Label: "Role"
      Type: select
      Options: (custom list or enum: Developer, DevOps, QA, PM, etc.)
    
    [ Name ]
      Label: "Full Name"
      Placeholder: "John Doe"
      Type: text
    
    [ Handle ]
      Label: "Username/Handle"
      Placeholder: "john_doe"
      Type: text
    
    [ Add ] (Primary)
    Action: POST /p/:slug/settings/contacts/add → addProjectContact()

Delete Button:
  Action: POST /p/:slug/settings/contacts/delete → deleteProjectContact()
SECTION 8: LINKS
Title (EN): "Links & Resources"
Title (RU): "Ссылки и ресурсы"
Description (EN): "Documentation, runbooks, dashboards, etc."
Description (RU): "Документация, рунбуки, дашборды и т.д."

Table:

text
Columns:
  Kind | Title | URL | Tags | Actions

Rows:
  "Wiki" | "Setup Guide" | https://... | #setup #docs | [ Delete ]
  "Dashboard" | "Analytics" | https://... | #monitoring | [ Delete ]

Add Row Button:
  [ + Add Link ]
  
  Modal:
    [ Kind ]
      Label: "Type"
      Type: select
      Options: Wiki, Dashboard, Runbook, Issue Tracker, Other
    
    [ Title ]
      Label: "Title"
      Placeholder: "Setup Guide"
      Type: text
    
    [ URL ]
      Label: "URL"
      Placeholder: "https://..."
      Type: url
      Validation: valid HTTP(S) URL
    
    [ Tags ]
      Label: "Tags (optional)"
      Placeholder: "setup, docs, onboarding"
      Type: text
      Helper: "Comma-separated"
    
    [ Add ] (Primary)
    Action: POST /p/:slug/settings/links/add → addProjectLink()

Delete Button:
  Action: POST /p/:slug/settings/links/delete → deleteProjectLink()
SCREEN 8: PROJECT WEBHOOKS (/p/:slug/webhooks)
Purpose: Admin sets up and monitors GitHub and Asana webhooks

Layout:

text
[Top-bar with tabs]
[Sections for GitHub and Asana]
SECTION 1: GITHUB WEBHOOK
Title (EN): "GitHub Webhook"
Title (RU): "GitHub вебхук"

GitHub Webhook URL:

text
Label: "Webhook URL"
Label (RU): "URL вебхука"
Code block:
  https://your-domain/webhooks/github
  Button: [ Copy ]
  
Helper (EN): "Add this URL to your GitHub repository settings."
Helper (RU): "Добавьте этот URL в настройки репозитория GitHub."

Link: "How to setup GitHub webhook →"
URL: https://docs.github.com/en/developers/webhooks-and-events/webhooks/creating-webhooks

Instructions card:
  Title (EN): "Setup Instructions"
  Title (RU): "Инструкции по установке"
  
  Steps:
    1. Go to GitHub Repository → Settings → Webhooks
    2. Click "Add webhook"
    3. Payload URL: [paste URL above]
    4. Content type: application/json
    5. Events: Let me select individual events
       - Push
       - Pull request
    6. Secret: [show GitHub webhook secret from Settings]
    7. Save webhook
SECTION 2: ASANA WEBHOOKS
Title (EN): "Asana Webhooks"
Title (RU): "Asana вебхуки"

Setup Form:

text
[ Public Base URL ]
  Label: "Public Base URL"
  Label (RU): "Публичный базовый URL"
  Placeholder: "https://your-domain"
  Type: url
  Helper (EN): "Base URL for webhook callbacks (without trailing slash)"
  Helper (RU): "Базовый URL для обратных вызовов вебхука (без конечного слэша)"

[ Setup Asana Webhooks ]
  Type: Primary
  Text (EN): "Setup Asana Webhooks"
  Text (RU): "Настроить вебхуки Asana"
  Action: POST /p/:slug/webhooks/asana/setup → AsanaClient.createWebhook() + upsertProjectWebhook() → success toast
  
  Success message (EN): "Asana webhooks created successfully"
  Success message (RU): "Асана вебхуки успешно созданы"
  Error: Show error message with details
Webhook Health Cards:

text
For each configured Asana project:
  Card:
    Title: "Asana Webhooks — Project X"
    
    Info rows:
      Provider: Asana
      Project GID: 1234567890
      Webhook GID: 9876543210
      Last Delivery: 2024-01-15 14:30:00 ✓ (green check if recent)
      Or: "No recent deliveries" (gray if not)
    
    Status badge: ACTIVE (green) | PENDING (yellow) | ERROR (red)
SECTION 3: VALIDATION & ACTIONS
Title (EN): "Webhook Validation"
Title (RU): "Валидация вебхуков"

Sync Repos to Asana:

text
Button: [ Sync Repos to Asana Repo Field ]
Type: Secondary
Text (EN): "Sync Repositories"
Text (RU): "Синхронизировать репозитории"
Helper: "Push configured GitHub repos as options to Asana Repo custom field"
Action: POST /p/:slug/webhooks/asana/sync-repos → syncReposToAsanaRepoField() → show result
Result: "Synced 5 repositories to Asana field"
Validate GitHub Webhooks:

text
Button: [ Validate GitHub Webhooks ]
Type: Secondary
Text (EN): "Validate GitHub"
Text (RU): "Валидировать GitHub"
Helper: "Check GitHub webhooks are configured correctly"
Action: POST /p/:slug/webhooks/github/validate → GithubClient.listWebhooks() → validate URL match
Result: Code block with validation result (JSON or text)
SCREEN 9: PROJECT API (/p/:slug/api)
Purpose: Admin generates and manages API tokens for this project

Layout:

text
[Top-bar with tabs]
[Tokens list]
[Create token button]
Tokens List:

text
Title (EN): "API Tokens"
Title (RU): "API токены"

Cards per token:
  Token Name: "Production Bot"
  Created: 2024-01-10 by admin
  Last Used: 2024-01-15 14:00:00
  Scopes: (if available) read, write, delete
  
  Buttons:
    [ Copy Token ID ] (Ghost) ← if tokenId is visible
    [ Revoke ] (Danger) → confirm dialog
    
  Confirm revoke:
    Text (EN): "Revoke this token? It will stop working immediately."
    Text (RU): "Отозвать этот токен? Он перестанет работать немедленно."
    [ Yes, Revoke ] (Danger)
    [ Cancel ] (Ghost)
    
    Action: DELETE /p/:slug/api/tokens/:tokenId → revokeToken() → remove card + success toast

Empty state:
  "No tokens yet. Create your first token to get started."
Create Token Button:

text
[ + Create Token ]
Type: Primary
Text (EN): "Generate Token"
Text (RU): "Сгенерировать токен"

Modal:
  Title (EN): "Create API Token"
  Title (RU): "Создать API токен"
  
  [ Token Name ]
    Label: "Name"
    Label (RU): "Имя"
    Placeholder: "My Bot Token"
    Type: text
    Helper: "Give this token a memorable name"
  
  [ Scopes ] (optional)
    Label: "Scopes"
    Type: checkboxes
    Options:
      ☑ read (read tasks, projects)
      ☑ write (create/update tasks)
      ☐ delete (revoke tokens, delete data)
    Helper: "What can this token do?"
  
  [ Create ] (Primary)
  
  Action: POST /p/:slug/api/tokens → generateToken() → show "Token Created" screen

Token Created Screen (one-time display):
  Title (EN): "Token Created Successfully"
  Title (RU): "Токен успешно создан"
  
  Warning (EN): "Copy your token now. You won't be able to see it again!"
  Warning (RU): "Скопируйте ваш токен сейчас. Вы не сможете увидеть его снова!"
  
  Code block:
    auto_flow_token_abc123def456ghi...
  
  Button: [ Copy Token ]
  Button: [ Done ] (Ghost) → close modal + refresh token list
  
  Success toast: "Token created successfully. Save it somewhere safe!"
SCREEN 10: PROJECT KNOWLEDGE (/p/:slug/knowledge)
Purpose: Admin/editor documents project setup and processes

Layout:

text
[Top-bar with tabs]
[Markdown editor full-width]
Markdown Editor:

text
Title (EN): "Project Knowledge"
Title (RU): "Знания проекта"
Helper (EN): "Document your project setup, runbooks, troubleshooting tips, etc."
Helper (RU): "Документируйте настройку проекта, рунбуки, советы по решению проблем и т.д."

Editor area:
  Left pane: Markdown textarea (full width or split)
    Placeholder:
      # Project Documentation
      
      ## Setup
      ...
    
    Toolbar (optional):
      [ B ] [ I ] [ H1 ] [ H2 ] [ List ] [ Code ] [ Link ] [ Image ]
  
  Right pane (optional): Live preview of rendered Markdown

Buttons:
  [ Save ] (Primary)
  [ Preview ] (Secondary, toggle)
  [ Reset ] (Ghost)

Action: POST /p/:slug/knowledge → saveProjectKnowledge() → success toast

Auto-save (optional):
  Text (EN): "Auto-saving..."
  Text (RU): "Автосохранение..."
  After 2 seconds of inactivity: Save without button click
SCREEN 11: LEGACY ADMIN (/admin)
Purpose: Instance-level configuration (not per-project)

Layout:

text
[Simple top bar with logout]
[Sections/cards for config, OpenCode, webhooks]
Title (EN): "Instance Admin"
Title (RU): "Администратор инстанса"
Warning badge (EN): "DANGER ZONE — Be careful here"
Warning badge (RU): "ОПАСНАЯ ЗОНА — Будьте осторожны"
Accent color: Orange (#F59E0B)

SECTION 1: CREDENTIALS & REPOSITORY
Title (EN): "Credentials & Repo"
Title (RU): "Креденшалы и репозиторий"

Form:

text
[ Asana PAT ]
  Label: "Asana Personal Access Token"
  Placeholder: "1/1234567890abcdef..."
  Type: password
  Helper: "Required for Asana API access"
  Link: "Create PAT →"
  URL: https://developers.asana.com/docs/personal-access-token

[ GitHub Token ]
  Label: "GitHub Personal Access Token"
  Placeholder: "ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
  Type: password
  Helper: "Needs 'repo' and 'admin:repo_hook' scopes"
  Link: "Create token →"
  URL: https://github.com/settings/tokens

[ GitHub Owner ]
  Label: "Repository Owner"
  Placeholder: "my-org"
  Type: text

[ GitHub Repo ]
  Label: "Repository Name"
  Placeholder: "my-repo"
  Type: text

[ Asana Project GID ]
  Label: "Asana Project GID"
  Placeholder: "1234567890"
  Type: text

[ Public Base URL ]
  Label: "Public Base URL"
  Placeholder: "https://your-domain"
  Type: url
  Helper: "Used for webhook callbacks"

Buttons:
  [ Save Config ] (Primary)
  [ Reload ] (Secondary) → reload page
  
  Action: POST /api/admin/config → setConfig(...) → success toast
SECTION 2: OPENCODE
Title (EN): "OpenCode"
Title (RU): "OpenCode"
Helper (EN): "Optional: launch OpenCode IDE for local development"
Helper (RU): "Опционально: запустить IDE OpenCode для локальной разработки"

Form:

text
[ Mode ]
  Label: "Mode"
  Type: select
  Options: LOCAL, REMOTE, OFF
  Helper: "LOCAL = run locally, REMOTE = connect to remote, OFF = disabled"

[ Endpoint (optional) ]
  Label: "Endpoint"
  Placeholder: "http://localhost:3000"
  Type: url
  Helper: "Only if Mode = REMOTE"

[ Local Repo Path (workdir) ]
  Label: "Workdir"
  Placeholder: "/home/opencode/workspaces"
  Type: text
  Helper: "Local directory for repositories"

Buttons:
  [ Save OpenCode ] (Primary)
  [ Launch OpenCode ] (Secondary, danger) → opens confirm dialog
  
  Confirm launch:
    Text (EN): "Launch OpenCode in terminal?"
    Text (RU): "Запустить OpenCode в терминале?"
    [ Yes ] (Danger)
    [ Cancel ] (Ghost)
    
    Action: POST /api/admin/opencode/launch → launchOpenCodeInTerminal() → toast "OpenCode launched"
SECTION 3: WEBHOOKS
Title (EN): "Webhooks"
Title (RU): "Вебхуки"

Form:

text
[ GitHub Webhook Secret ]
  Label: "GitHub Secret"
  Placeholder: "••••••••"
  Type: password
  Helper: "Validate GitHub webhook signatures"

[ Asana Webhook Secret ]
  Label: "Asana Secret"
  Placeholder: "••••••••"
  Type: password
  Helper: "Validate Asana webhook signatures (if applicable)"

[ Asana Resource GID ]
  Label: "Asana Resource GID (project)"
  Placeholder: "1234567890"
  Type: text

[ Asana Target URL (optional) ]
  Label: "Asana Target URL"
  Placeholder: "https://..."
  Type: url
  Helper: "Override default webhook target"

Buttons:
  [ Save Webhook Secrets ] (Primary)
  [ Setup Asana Webhook ] (Secondary)
  [ List Tasks ] (Ghost) → POST /api/admin/tasks → show JSON result

Action: POST /api/admin/webhooks/secrets → upsertWebhookConfig() → setConfig() → success toast

Result area (pre):
  Code block for JSON logs/results of "List Tasks" or setup actions
  ID: out (for JS logging)
LANGUAGE SYSTEM (GLOBAL)
Language Selector:

Location: Top-right corner on all screens

Toggle button: Flag icon (🇬🇧 EN | 🇷🇺 RU)

Storage: cookie or localStorage LANGUAGE=en|ru

Default: detect from browser or en

Translation Files Structure (pseudo-code):

text
src/locales/en.ts:
  export const EN = {
    common: {
      save: "Save",
      cancel: "Cancel",
      delete: "Delete",
      error: "Error",
      success: "Success",
      loading: "Loading...",
    },
    screens: {
      login: {
        title: "Login",
        username: "Username",
        password: "Password",
        submit: "Login",
        error: "Invalid username or password",
      },
      projectDashboard: {
        title: "Project Dashboard",
        syncAsana: "Sync from Asana",
        createTask: "Create Task",
        ...
      },
      ...
    }
  }

src/locales/ru.ts:
  export const RU = {
    common: {
      save: "Сохранить",
      cancel: "Отменить",
      delete: "Удалить",
      error: "Ошибка",
      success: "Успех",
      loading: "Загрузка...",
    },
    screens: {
      login: {
        title: "Вход",
        username: "Имя пользователя",
        password: "Пароль",
        submit: "Войти",
        error: "Неверное имя пользователя или пароль",
      },
      projectDashboard: {
        title: "Дашборд проекта",
        syncAsana: "Синхронизация из Asana",
        createTask: "Создать задачу",
        ...
      },
      ...
    }
  }

Usage in components:
  const i18n = getLanguage() // returns EN or RU object
  <button>{i18n.screens.projectDashboard.createTask}</button>
COMPONENT LIBRARY (Reusable Components)
Below is a list of reusable UI components to build:

Button (primary, secondary, danger, ghost)

Input (text, password, email, number, url, textarea)

Select / Dropdown

Modal / Dialog

Alert / Toast (success, error, warning, info)

Card (white background, shadow, padding)

Pills / Badges (status, role, tag)

Table (with header, rows, hover, actions)

Tabs (horizontal, active underline)

Code Block (gray background, mono font, copy button)

Checkbox

Radio

Form Group (label + input + helper)

Link (blue, hover effect)

Icon buttons (ghost, small)

Empty state (illustration + text + call-to-action)

Loading spinner

Breadcrumb

Top-bar (logo, title, tabs, user menu)

Sidebar (if needed; currently top-bar only)

COLOR PALETTE
Light Theme:

text
Primary Blue: #3B82F6
  Hover: #2563EB
  Active: #1D4ED8

Secondary Gray:
  Light: #F3F4F6
  Medium: #E5E7EB
  Dark: #9CA3AF

Success Green: #10B981
Danger Red: #EF4444
Warning Orange: #F59E0B
Info Blue: #0369A1

Text:
  Primary: #1A1A1A
  Secondary: #6B7280
  Muted: #9CA3AF

Background:
  Page: #FAFAFA or #FFFFFF
  Card: #FFFFFF
  Hover: #F3F4F6
Dark Mode (optional future):

text
Same structure, inverted
Background: #0F172A
Card: #1E293B
Text Primary: #F1F5F9
Text Secondary: #CBD5E1
Accent: #60A5FA (lighter blue for contrast)
RESPONSIVE DESIGN
Mobile (< 768px):

Stack everything vertically

Full-width inputs

Modals: fullscreen

Tables: horizontal scroll or collapse to list view

Top-bar: hamburger menu if many tabs

Tablet (768px - 1024px):

Flexible 2-column layouts for Settings

Sidebar navigation (optional)

Desktop (> 1024px):

Full layouts as described

Comfortable 1200px max-width for content

ACCESSIBILITY
All form inputs have associated labels

Buttons have clear text (no icon-only buttons without title attribute)

Color contrast: WCAG AA minimum (4.5:1 for normal text)

Focus indicators visible (blue outline)

ARIA labels for complex components (modals, alerts, tabs)

Keyboard navigation: Tab, Enter, Escape, Arrow keys

PERFORMANCE
Lazy-load heavy components (modals, large tables)

Debounce search/filter inputs

Cache language preference

Minify CSS, use critical CSS for above-the-fold

Compress images (logos, illustrations)