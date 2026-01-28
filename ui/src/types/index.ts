// Core types for Auto-Flow

export type UserRole = 'viewer' | 'editor' | 'admin';

export type TaskStatus = 
  | 'RECEIVED'
  | 'TASKSPEC_CREATED'
  | 'NEEDS_REPO'
  | 'AUTO_DISABLED'
  | 'CANCELLED'
  | 'BLOCKED'
  | 'ISSUE_CREATED'
  | 'PR_CREATED'
  | 'WAITING_CI'
  | 'DEPLOYED'
  | 'FAILED';

export interface User {
  id: string;
  username: string;
  email?: string;
  name?: string;
  avatarUrl?: string;
}

export interface Project {
  id: string;
  slug: string;
  name: string;
  description?: string;
  createdAt: string;
  role: UserRole;
  integrations: {
    asana: boolean;
    github: boolean;
    opencode: boolean;
  };
  memberCount: number;
}

export interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  asanaTaskId?: string;
  githubIssueUrl?: string;
  githubPrUrl?: string;
  githubIssueNumber?: number | null;
  githubPrNumber?: number | null;
  ciUrl?: string | null;
  repo?: string | null;
  lastError?: string | null;
  createdAt: string;
  updatedAt: string;
  assignee?: User;
}

export interface TaskSpec {
  id: string;
  taskId: string;
  content: string;
  version: number;
  createdAt: string;
}

export interface TaskEvent {
  id: string;
  taskId: string;
  type: string;
  message: string;
  createdAt: string;
  source?: string | null;
  taskTitle?: string | null;
}

export interface Integration {
  id: string;
  type: 'asana' | 'github' | 'opencode';
  status: 'connected' | 'disconnected' | 'error';
  lastSync?: string;
  config?: Record<string, unknown>;
}

export interface Webhook {
  id: string;
  name: string;
  url: string;
  events: string[];
  status: 'active' | 'inactive' | 'error';
  lastTriggered?: string;
}

export interface Run {
  id: string;
  taskId?: string | null;
  status: 'queued' | 'running' | 'success' | 'failed' | 'cancelled';
  createdAt: string;
  startedAt?: string | null;
  finishedAt?: string | null;
  outputSummary?: string | null;
  inputSpec?: any;
  logs?: string[];
}

export interface Membership {
  userId: string;
  projectId: string;
  role: UserRole;
  user: User;
}

export interface Secret {
  id: string;
  key: string;
  createdAt: string;
  updatedAt: string;
}

export interface Repo {
  id: string;
  name: string;
  fullName: string;
  url: string;
  defaultBranch: string;
}

export interface ApiToken {
  id: string;
  name: string;
  lastUsed?: string;
  createdAt: string;
  expiresAt?: string;
}
