import { z } from 'zod';

// Minimal schema for Asana webhook payload.
// Asana may send additional fields; we only validate what we use.
const asanaEventSchema = z.object({
  resource: z
    .object({
      gid: z.string(),
      resource_type: z.string().optional(),
      name: z.string().optional(),
    })
    .optional(),
  action: z.string().optional(),
  parent: z
    .object({
      gid: z.string().optional(),
      resource_type: z.string().optional(),
      name: z.string().optional(),
    })
    .optional(),
  change: z
    .object({
      field: z.string().optional(),
      new_value: z.any().optional(),
    })
    .optional()
    .nullable(),
});

const asanaWebhookPayloadSchema = z.object({
  events: z.array(asanaEventSchema).default([]),
});

export type AsanaEvent = z.infer<typeof asanaEventSchema>;
export type AsanaWebhookPayload = z.infer<typeof asanaWebhookPayloadSchema>;

export function parseAsanaWebhookPayload(payload: unknown): AsanaWebhookPayload {
  const parsed = asanaWebhookPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error(`Invalid Asana webhook payload: ${parsed.error.message}`);
  }
  return parsed.data;
}

export function isTaskAddedEvent(e: AsanaEvent): boolean {
  return e.resource?.resource_type === 'task' && e.action === 'added';
}

export function isTaskCompletedChangedEvent(e: AsanaEvent): boolean {
  return e.resource?.resource_type === 'task' && e.action === 'changed' && e.change?.field === 'completed';
}
