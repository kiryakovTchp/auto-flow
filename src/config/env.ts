import { z } from 'zod';

const envSchema = z.object({
  PORT: z.string().optional(),

  PUBLIC_BASE_URL: z.string().url().optional(),

  // Asana
  ASANA_PAT: z.string().optional(),
  ASANA_PROJECT_GID: z.string().optional(),
  ASANA_WEBHOOK_SECRET: z.string().optional(),

  // GitHub
  GITHUB_TOKEN: z.string().optional(),
  GITHUB_OWNER: z.string().optional(),
  GITHUB_REPO: z.string().optional(),
  GITHUB_WEBHOOK_SECRET: z.string().optional(),

  // Admin
  ADMIN_API_TOKEN: z.string().optional(),
  INIT_ADMIN_TOKEN: z.string().optional(),

  // Ops
  METRICS_TOKEN: z.string().optional(),

  // OpenCode OAuth
  OPENCODE_OAUTH_AUTH_URL: z.string().url().optional(),
  OPENCODE_OAUTH_TOKEN_URL: z.string().url().optional(),
  OPENCODE_OAUTH_CLIENT_ID: z.string().optional(),
  OPENCODE_OAUTH_CLIENT_SECRET: z.string().optional(),
  OPENCODE_OAUTH_SCOPES: z.string().optional(),

  // OpenCode Web UI
  OPENCODE_WEB_URL: z.string().url().optional(),
});

export type Env = z.infer<typeof envSchema>;

export function getEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    // Avoid dumping process.env; just show validation errors.
    throw new Error(`Invalid environment: ${parsed.error.message}`);
  }
  return parsed.data;
}
