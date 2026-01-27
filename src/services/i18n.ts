export type UiLang = 'en' | 'ru';

export function normalizeLang(input: unknown): UiLang {
  const s = String(input ?? '').trim().toLowerCase();
  if (s === 'ru' || s.startsWith('ru-')) return 'ru';
  return 'en';
}

export function getLangFromAcceptLanguage(header: unknown): UiLang {
  const s = String(header ?? '').toLowerCase();
  return s.includes('ru') ? 'ru' : 'en';
}

export function getLangFromRequest(req: any): UiLang {
  const fromCookie = req?.cookies?.LANGUAGE;
  if (fromCookie) return normalizeLang(fromCookie);
  return getLangFromAcceptLanguage(req?.headers?.['accept-language']);
}

export function setLangCookie(res: any, lang: UiLang): void {
  // Not httpOnly so the browser can read/debug if needed.
  res.cookie('LANGUAGE', lang, {
    httpOnly: false,
    sameSite: 'lax',
    secure: false,
    path: '/',
    maxAge: 1000 * 60 * 60 * 24 * 365,
  });
}

interface Dict {
  [key: string]: string | Dict;
}

const EN: Dict = {
  common: {
    save: 'Save',
    cancel: 'Cancel',
    close: 'Close',
    delete: 'Delete',
    create: 'Create',
    back: 'Back',
    logout: 'Logout',
    copy: 'Copy',
  },
  screens: {
    login: {
      title: 'Login',
      subtitle: 'Use your credentials to continue.',
      username: 'Username',
      username_help: 'Your account username',
      password: 'Password',
      password_help: 'At least 8 characters',
      submit: 'Login',
      error_invalid: 'Invalid username or password',
    },
    init: {
      title: 'Init Admin',
      subtitle: 'Creates the first admin user (one-time).',
      token: 'Init Token',
      token_help: 'One-time token from INIT_ADMIN_TOKEN',
      username: 'Username',
      username_help: 'Default: admin',
      password: 'Password',
      password_help: 'Minimum 8 characters',
      submit: 'Create Admin',
    },
    invite: {
      title: 'Accept Invite',
      subtitle: 'Create your account.',
      username: 'Username',
      username_help: 'Choose your username',
      password: 'Password',
      password_help: 'Minimum 8 characters',
      submit: 'Create Account',
    },
    projects: {
      title: 'Projects',
      create_project: 'Create Project',
      create_invite: 'Create Invite Link',
      open_docs: 'Open Docs',
      create_project_modal_title: 'Create New Project',
      create_invite_modal_title: 'Create Invite Link',
      invite_helper: 'Share this link, valid for 7 days',
      project_slug: 'Project Slug',
      project_name: 'Project Name',
    },
    dashboard: {
      status: 'Status',
      apply: 'Apply',
      sync_asana: 'Sync from Asana',
      create_task: 'Create Task',
      run_now: 'Run now',
      import_title: 'Import from Asana',
      import_days: 'Import last N days',
      import_days_help: 'Default 90, max 365',
      create_task_title: 'Create Task in Asana',
      task_title: 'Title',
      task_notes: 'Notes (optional)',
      task_repo: 'Repository (optional)',
      task_auto: 'Auto-enabled',
      empty: "No tasks yet. Use 'Sync from Asana' or 'Create Task'.",
    },
    task: {
      title: 'Task',
      actions: 'Actions',
      retry: 'Retry Pipeline',
      resync: 'Re-sync from Asana',
      change_repo: 'Change Repo',
      create_issue: 'Create Issue',
      link_pr: 'Link PR',
      add_note: 'Add Note',
      post_note: 'Post',
      latest_spec: 'Latest Spec',
      spec_versions: 'Spec Versions',
      timeline: 'Timeline',
    },
    settings: {
      title: 'Settings',
      secrets: 'Secrets',
      asana_fields: 'Asana Custom Fields',
      status_mapping: 'Status Mapping',
      repo_mapping: 'Repository Mapping (Optional)',
      asana_projects: 'Asana Projects',
      github_repos: 'GitHub Repositories',
      contacts: 'Contacts',
      links: 'Links & Resources',
    },
    webhooks: {
      title: 'Webhooks',
      github_webhook_url: 'GitHub webhook URL',
      asana_webhook_urls: 'Asana webhook URL(s)',
      public_base_url: 'Public Base URL',
      setup_asana: 'Setup Asana Webhooks',
      sync_repos: 'Sync Repos to Asana Repo Field',
      validate_github: 'Validate GitHub Webhooks',
      health: 'Webhook health',
    },
    api: {
      title: 'API',
      tokens: 'API Tokens',
      create_token: 'Create Token',
      revoke: 'Revoke',
      endpoints: 'API endpoints (Bearer token)',
      token_created: 'Token created (shown once)',
      token_warning: "Copy your token now. You won't be able to see it again!",
    },
    knowledge: {
      title: 'Knowledge',
      subtitle: 'Notes are stored in DB (markdown).',
      markdown: 'Markdown',
      save: 'Save',
    },
    integrations: {
      title: 'Integrations',
    },
    admin: {
      title: 'Instance Admin',
      credentials: 'Credentials & Repo',
      opencode: 'OpenCode',
      webhooks: 'Webhooks',
      save_config: 'Save Config',
      reload: 'Reload',
      launch: 'Launch OpenCode',
      setup: 'Setup Asana Webhook',
      list_tasks: 'List Tasks',
    },
  },
};

const RU: Dict = {
  common: {
    save: 'Сохранить',
    cancel: 'Отменить',
    close: 'Закрыть',
    delete: 'Удалить',
    create: 'Создать',
    back: 'Назад',
    logout: 'Выйти',
    copy: 'Копировать',
  },
  screens: {
    login: {
      title: 'Вход',
      subtitle: 'Введите логин и пароль.',
      username: 'Имя пользователя',
      username_help: 'Имя пользователя аккаунта',
      password: 'Пароль',
      password_help: 'Минимум 8 символов',
      submit: 'Войти',
      error_invalid: 'Неверное имя пользователя или пароль',
    },
    init: {
      title: 'Создание администратора',
      subtitle: 'Создает первого админа (один раз).',
      token: 'Init Token',
      token_help: 'Одноразовый токен из INIT_ADMIN_TOKEN',
      username: 'Имя пользователя',
      username_help: 'По умолчанию: admin',
      password: 'Пароль',
      password_help: 'Минимум 8 символов',
      submit: 'Создать администратора',
    },
    invite: {
      title: 'Принять приглашение',
      subtitle: 'Создайте аккаунт.',
      username: 'Имя пользователя',
      username_help: 'Выберите имя пользователя',
      password: 'Пароль',
      password_help: 'Минимум 8 символов',
      submit: 'Создать аккаунт',
    },
    projects: {
      title: 'Проекты',
      create_project: 'Создать проект',
      create_invite: 'Создать ссылку приглашения',
      open_docs: 'Открыть документацию',
      create_project_modal_title: 'Создать новый проект',
      create_invite_modal_title: 'Создать ссылку приглашения',
      invite_helper: 'Поделитесь этой ссылкой, действует 7 дней',
      project_slug: 'Slug проекта',
      project_name: 'Название проекта',
    },
    dashboard: {
      status: 'Статус',
      apply: 'Применить',
      sync_asana: 'Синхронизация из Asana',
      create_task: 'Создать задачу',
      run_now: 'Запустить',
      import_title: 'Импорт из Asana',
      import_days: 'Импорт за N дней',
      import_days_help: 'По умолчанию 90, максимум 365',
      create_task_title: 'Создать задачу в Asana',
      task_title: 'Название',
      task_notes: 'Заметки (опционально)',
      task_repo: 'Репозиторий (опционально)',
      task_auto: 'Автовключение',
      empty: "Нет задач. Нажмите 'Синхронизация из Asana' или 'Создать задачу'.",
    },
    task: {
      title: 'Задача',
      actions: 'Действия',
      retry: 'Повторить пайплайн',
      resync: 'Пересинхронизировать',
      change_repo: 'Изменить репозиторий',
      create_issue: 'Создать Issue',
      link_pr: 'Связать PR',
      add_note: 'Добавить заметку',
      post_note: 'Отправить',
      latest_spec: 'Последняя спецификация',
      spec_versions: 'Версии спецификации',
      timeline: 'Хронология',
    },
    settings: {
      title: 'Настройки',
      secrets: 'Секреты',
      asana_fields: 'Поля Asana',
      status_mapping: 'Маппинг статусов',
      repo_mapping: 'Маппинг репозитория (опц.)',
      asana_projects: 'Проекты Asana',
      github_repos: 'Репозитории GitHub',
      contacts: 'Контакты',
      links: 'Ссылки и ресурсы',
    },
    webhooks: {
      title: 'Вебхуки',
      github_webhook_url: 'URL GitHub вебхука',
      asana_webhook_urls: 'URL(ы) Asana вебхуков',
      public_base_url: 'Публичный базовый URL',
      setup_asana: 'Настроить вебхуки Asana',
      sync_repos: 'Синхронизировать репозитории в Asana',
      validate_github: 'Валидировать GitHub вебхуки',
      health: 'Состояние вебхуков',
    },
    api: {
      title: 'API',
      tokens: 'API токены',
      create_token: 'Создать токен',
      revoke: 'Отозвать',
      endpoints: 'API endpoints (Bearer token)',
      token_created: 'Токен создан (показывается один раз)',
      token_warning: 'Скопируйте токен сейчас. Потом его нельзя будет посмотреть!',
    },
    knowledge: {
      title: 'Знания',
      subtitle: 'Заметки хранятся в БД (markdown).',
      markdown: 'Markdown',
      save: 'Сохранить',
    },
    integrations: {
      title: 'Интеграции',
    },
    admin: {
      title: 'Админ инстанса',
      credentials: 'Креды и репозиторий',
      opencode: 'OpenCode',
      webhooks: 'Вебхуки',
      save_config: 'Сохранить',
      reload: 'Обновить',
      launch: 'Запустить OpenCode',
      setup: 'Настроить Asana вебхук',
      list_tasks: 'Список задач',
    },
  },
};

function getByPath(root: Dict, path: string): string | null {
  const parts = path.split('.').filter(Boolean);
  let cur: any = root;
  for (const p of parts) {
    cur = cur?.[p];
    if (cur == null) return null;
  }
  return typeof cur === 'string' ? cur : null;
}

function format(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, key) => String(params[key] ?? ''));
}

export function t(lang: UiLang, key: string, params?: Record<string, string | number>): string {
  const dict = lang === 'ru' ? RU : EN;
  const s = getByPath(dict, key) ?? getByPath(EN, key) ?? key;
  return format(s, params);
}
