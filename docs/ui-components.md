UI Components — Detailed Documentation

- FlowCanvas
- NodeCard
- FlowPalette
- FlowEditor (container)

FlowCanvas
- Purpose: Visual canvas to arrange nodes and connections for a Flow.
- Props:
  - flow: Flow
  - onChange(flow: Flow): void
  - onNodeSelect?(nodeId: string): void
  - onEdgeCreate?(edge: Edge): void
  - onNodeDelete?(nodeId: string): void
  - onCanvasClick?(): void
  - readOnly?: boolean
  - grid?: boolean
  - theme?: 'light' | 'dark'
- Events/Behavior:
  - Drag & drop nodes from palette onto canvas
  - Connect ports to create edges
  - Pan, zoom, snap to grid (configurable)
  - Keyboard shortcuts: Delete, Undo/Redo, Zoom
- Accessibility:
  - Keyboard navigation for nodes and edges
  - ARIA labels for controls
- Example usage (TypeScript/React):
```tsx
import { FlowCanvas } from '@auto-flow/ui';
import type { Flow } from './types';

const MyFlowEditor = () => {
  const [flow, setFlow] = React.useState<Flow>({
    id: 'flow_1',
    name: 'Sample Flow',
    nodes: [],
    edges: [],
  });

  return (
    <FlowCanvas
      flow={flow}
      onChange={setFlow}
      onNodeSelect={(id) => console.log('node selected', id)}
      onEdgeCreate={(edge) => console.log('edge created', edge)}
      readOnly={false}
    />
  );
};
```
- Typical Flow type (simplified):
```ts
type Flow = {
  id: string;
  name: string;
  nodes: Node[];
  edges: Edge[];
};
type Node = { id: string; type: 'Trigger'|'Action'|'Condition'|'End'; data?: any; position: { x:number; y:number }; ports?: { name: string; type?: string }[] };
type Edge = { id: string; from: { nodeId: string; port?: string }; to: { nodeId: string; port?: string } };
```

NodeCard
- Purpose: Show and edit a single node's details in a side panel.
- Props:
  - node: Node
  - onUpdate(node: Node): void
  - onDelete?(nodeId: string): void
- Example usage:
```tsx
import { NodeCard } from '@auto-flow/ui';

const NodeEditor = ({ node, onUpdate }) => (
  <NodeCard
    node={node}
    onUpdate={(updated) => onUpdate(updated)}
  />
);
```

FlowPalette
- Purpose: Palette/toolbar for creating new nodes via drag-and-drop.
- Props:
  - onCreateNode(type: string, params?: any): void
- Example usage:
```tsx
import { FlowPalette } from '@auto-flow/ui';

<FlowPalette onCreateNode={(type) => console.log('create', type)} />
```

FlowEditor (container)
- Purpose: Wrap FlowCanvas with toolbox, properties panel and panels.
- Props:
  - flow: Flow
  - onChange: (flow: Flow) => void
- Example structure:
```tsx
<div className="flow-editor">
  <FlowPalette onCreateNode={...} />
  <FlowCanvas flow={flow} onChange={setFlow} />
  <NodeInspector node={selectedNode} onUpdate={updateNode} />
</div>
```

Notes
- These docs describe a reference implementation. Replace import paths and types with your actual UI library names.
- Include real props/types from your design system when available.
