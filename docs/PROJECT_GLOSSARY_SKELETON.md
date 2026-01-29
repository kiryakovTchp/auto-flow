Project Glossary (Skeleton)

- Pipeline (flow, top-level workflow)
  - id: string
  - name: string
  - description: string
  - steps: Step[]
  - links: Link[]
  - createdAt: string (date-time)
  - updatedAt: string (date-time)
  - status: string (e.g., draft, active, paused, completed)

- Step (node in a pipeline)
  - id: string
  - type: string (e.g., Trigger, Action, Condition, End)
  - config: object
  - position: { x: number; y: number }
  - ports: { name: string; type?: string }[]

- Link (edge between steps)
  - from: { stepId: string; port?: string }
  - to: { stepId: string; port?: string }
  - label?: string

- Execution (run of a pipeline)
  - id: string
  - pipelineId: string
  - startedAt: string (date-time)
  - endedAt: string (date-time) | null
  - status: string (e.g., queued, running, success, failed, cancelled)
  - logs?: string
  - result?: object
