import { z } from 'zod';

export const workflowRunCompletedSchema = z.object({
  action: z.literal('completed'),
  workflow_run: z.object({
    id: z.number(),
    html_url: z.string().url().optional(),
    conclusion: z.string().nullable().optional(),
    head_sha: z.string().min(1),
  }),
});

export type WorkflowRunCompleted = z.infer<typeof workflowRunCompletedSchema>;
