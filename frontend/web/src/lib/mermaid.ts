export type ComponentType =
  | 'frontend'
  | 'backend'
  | 'database'
  | 'cache'
  | 'queue'
  | 'storage'
  | 'gateway'
  | 'auth'
  | 'external'
  | 'cdn'
  | 'loadbalancer'
  | 'monitoring';

export interface MermaidArchitecture {
  components: Array<{ id: string; name: string; type: ComponentType; technology?: string }>;
  connections: Array<{ source: string; target: string; protocol?: string; purpose?: string }>;
}

const typeClasses: Record<ComponentType, string> = {
  frontend: 'frontend',
  backend: 'backend',
  database: 'database',
  cache: 'cache',
  queue: 'queue',
  storage: 'storage',
  gateway: 'gateway',
  auth: 'auth',
  external: 'external',
  cdn: 'cdn',
  loadbalancer: 'loadbalancer',
  monitoring: 'monitoring',
};

function nodeId(id: string): string {
  const safe = id.replace(/[^a-zA-Z0-9_]/g, '_');
  return /^[a-zA-Z_]/.test(safe) ? safe : `component_${safe}`;
}

function label(value: string): string {
  return value.replace(/"/g, '#quot;').replace(/[\r\n]+/g, ' ');
}

export function architectureToMermaid(architecture: MermaidArchitecture): string {
  const lines = ['flowchart TD'];

  for (const component of architecture.components) {
    const technology = component.technology ? `\\n${label(component.technology)}` : '';
    lines.push(`  ${nodeId(component.id)}["${label(component.name)}${technology}"]:::${typeClasses[component.type]}`);
  }

  for (const connection of architecture.connections) {
    const edgeLabel = connection.protocol || connection.purpose;
    lines.push(`  ${nodeId(connection.source)} -->|${label(edgeLabel)}| ${nodeId(connection.target)}`);
  }

  lines.push(
    '  classDef frontend fill:#312e81,stroke:#818cf8,color:#fff',
    '  classDef backend fill:#164e63,stroke:#22d3ee,color:#fff',
    '  classDef database fill:#064e3b,stroke:#34d399,color:#fff',
    '  classDef cache fill:#78350f,stroke:#fbbf24,color:#fff',
    '  classDef queue fill:#4c1d95,stroke:#a78bfa,color:#fff',
    '  classDef storage fill:#334155,stroke:#94a3b8,color:#fff',
    '  classDef gateway fill:#78350f,stroke:#f59e0b,color:#fff',
    '  classDef auth fill:#7f1d1d,stroke:#f87171,color:#fff',
    '  classDef external fill:#374151,stroke:#9ca3af,color:#fff',
    '  classDef cdn fill:#0c4a6e,stroke:#38bdf8,color:#fff',
    '  classDef loadbalancer fill:#831843,stroke:#f472b6,color:#fff',
    '  classDef monitoring fill:#134e4a,stroke:#2dd4bf,color:#fff'
  );

  return lines.join('\n');
}

export function downloadMermaid(source: string, filename = 'architecture.mmd'): void {
  const blob = new Blob([source], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
