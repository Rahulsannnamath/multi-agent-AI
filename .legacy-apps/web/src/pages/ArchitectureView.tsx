// apps/web/src/pages/ArchitectureView.tsx
import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  Panel,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { ArrowLeft, Copy, Download, Info } from 'lucide-react';
import { projectsApi } from '../services/api';
import { architectureToMermaid, downloadMermaid, type ComponentType, type MermaidArchitecture } from '../lib/mermaid';

interface ArchComponent {
  id: string;
  type: ComponentType;
  name: string;
  technology: string;
  description: string;
  responsibilities: string[];
  requirements: string[];
  isSinglePointOfFailure: boolean;
  position?: { x: number; y: number };
}

interface ArchConnection {
  id: string;
  source: string;
  target: string;
  protocol: string;
  purpose: string;
  isCritical: boolean;
}

const componentColors: Record<string, string> = {
  frontend: '#4f46e5',
  backend: '#0891b2',
  database: '#059669',
  cache: '#d97706',
  queue: '#7c3aed',
  storage: '#64748b',
  gateway: '#b45309',
  auth: '#dc2626',
  external: '#6b7280',
  cdn: '#0369a1',
  loadbalancer: '#be185d',
  monitoring: '#0f766e',
};

function ComponentNode({ data }: { data: ArchComponent & { selected: boolean } }) {
  const color = componentColors[data.type] ?? '#6366f1';
  const isSPOF = data.isSinglePointOfFailure;

  return (
    <div
      style={{ borderColor: isSPOF ? '#ef4444' : color }}
      className={`bg-gray-900 border-2 rounded-xl p-4 min-w-[160px] max-w-[220px] shadow-xl transition-all ${
        data.selected ? 'ring-2 ring-white/20' : ''
      }`}
    >
      <div className="flex items-center gap-2 mb-2">
        <div
          className="w-3 h-3 rounded-full flex-shrink-0"
          style={{ backgroundColor: color }}
        />
        <span className="text-xs font-semibold text-gray-300 uppercase tracking-wide">
          {data.type}
        </span>
        {isSPOF && (
          <span className="ml-auto text-xs text-red-400 font-bold" title="Single Point of Failure">
            ⚠ SPOF
          </span>
        )}
      </div>
      <h3 className="font-bold text-white text-sm leading-tight">{data.name}</h3>
      <p className="text-xs text-gray-400 mt-1">{data.technology}</p>
    </div>
  );
}

const nodeTypes = { component: ComponentNode };

export function ArchitectureView() {
  const { id } = useParams<{ id: string }>();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedComponent, setSelectedComponent] = useState<ArchComponent | null>(null);
  const [loading, setLoading] = useState(true);
  const [architecture, setArchitecture] = useState<MermaidArchitecture | null>(null);

  useEffect(() => {
    projectsApi.getArchitecture(id!)
      .then((res) => {
        const arch = res.data as { components: ArchComponent[]; connections: ArchConnection[] };
        if (!arch) return;
        setArchitecture(arch);

        // Auto-layout if positions not provided
        const GAP_X = 280;
        const GAP_Y = 200;
        const typeOrder = ['frontend', 'cdn', 'gateway', 'loadbalancer', 'backend', 'auth', 'cache', 'queue', 'database', 'storage', 'external', 'monitoring'];
        const groupedByType: Record<string, ArchComponent[]> = {};
        for (const comp of arch.components) {
          if (!groupedByType[comp.type]) groupedByType[comp.type] = [];
          groupedByType[comp.type].push(comp);
        }

        const flowNodes: Node[] = [];
        let yOffset = 0;
        for (const type of typeOrder) {
          const group = groupedByType[type] ?? [];
          group.forEach((comp, xi) => {
            const pos = comp.position ?? { x: xi * GAP_X, y: yOffset };
            flowNodes.push({
              id: comp.id,
              type: 'component',
              position: pos,
              data: { ...comp, selected: false },
            });
          });
          if (group.length > 0) yOffset += GAP_Y;
        }

        // Any remaining types
        for (const [type, group] of Object.entries(groupedByType)) {
          if (!typeOrder.includes(type)) {
            group.forEach((comp, xi) => {
              flowNodes.push({
                id: comp.id,
                type: 'component',
                position: { x: xi * GAP_X, y: yOffset },
                data: { ...comp, selected: false },
              });
            });
            yOffset += GAP_Y;
          }
        }

        const flowEdges: Edge[] = arch.connections.map((conn) => ({
          id: conn.id,
          source: conn.source,
          target: conn.target,
          label: conn.protocol,
          animated: conn.isCritical,
          style: {
            stroke: conn.isCritical ? '#6366f1' : '#374151',
            strokeWidth: conn.isCritical ? 2 : 1,
          },
          labelStyle: { fill: '#9ca3af', fontSize: 10 },
          labelBgStyle: { fill: '#111827', fillOpacity: 0.8 },
        }));

        setNodes(flowNodes);
        setEdges(flowEdges);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedComponent(node.data as unknown as ArchComponent);
  }, []);

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-gray-500">Loading architecture...</div>;
  }

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div className="flex items-center gap-4 p-4 bg-gray-900 border-b border-gray-800 flex-shrink-0">
        <Link to={`/projects/${id}`} className="btn-secondary py-1.5 text-sm flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" />
          Back
        </Link>
        <h1 className="font-semibold text-white">System Architecture Diagram</h1>
        <p className="text-sm text-gray-500">Click a component to inspect</p>
        {architecture && (
          <div className="ml-auto flex items-center gap-2">
            <button
              className="btn-secondary text-sm flex items-center gap-2"
              title="Copy Mermaid source"
              onClick={() => void navigator.clipboard.writeText(architectureToMermaid(architecture))}
            >
              <Copy className="w-4 h-4" />
              Mermaid
            </button>
            <button
              className="btn-secondary text-sm flex items-center gap-2"
              title="Download Mermaid source"
              onClick={() => downloadMermaid(architectureToMermaid(architecture))}
            >
              <Download className="w-4 h-4" />
              Export
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Flow */}
        <div className="flex-1">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClick}
            nodeTypes={nodeTypes}
            fitView
            minZoom={0.3}
          >
            <Background color="#1f2937" gap={20} />
            <Controls />
            <MiniMap
              nodeColor={(node) => componentColors[(node.data as unknown as ArchComponent).type] ?? '#6366f1'}
              maskColor="rgba(0,0,0,0.7)"
            />
            <Panel position="top-right">
              <div className="bg-gray-900 border border-gray-700 rounded-lg p-3 text-xs space-y-1">
                {Object.entries(componentColors).slice(0, 8).map(([type, color]) => (
                  <div key={type} className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                    <span className="text-gray-400 capitalize">{type}</span>
                  </div>
                ))}
              </div>
            </Panel>
          </ReactFlow>
        </div>

        {/* Component detail panel */}
        {selectedComponent && (
          <div className="w-72 bg-gray-900 border-l border-gray-800 p-4 overflow-y-auto flex-shrink-0">
            <div className="flex items-center gap-2 mb-4">
              <Info className="w-4 h-4 text-indigo-400" />
              <h2 className="font-semibold text-white">Component Details</h2>
              <button
                className="ml-auto text-gray-600 hover:text-gray-400"
                onClick={() => setSelectedComponent(null)}
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-sm">
              <div>
                <p className="text-gray-500 text-xs uppercase tracking-wide mb-1">Name</p>
                <p className="text-white font-medium">{selectedComponent.name}</p>
              </div>
              <div>
                <p className="text-gray-500 text-xs uppercase tracking-wide mb-1">Type</p>
                <span
                  className="px-2 py-0.5 rounded text-xs font-medium text-white"
                  style={{ backgroundColor: componentColors[selectedComponent.type] + '60' }}
                >
                  {selectedComponent.type}
                </span>
              </div>
              <div>
                <p className="text-gray-500 text-xs uppercase tracking-wide mb-1">Technology</p>
                <p className="text-gray-300">{selectedComponent.technology}</p>
              </div>
              <div>
                <p className="text-gray-500 text-xs uppercase tracking-wide mb-1">Description</p>
                <p className="text-gray-400">{selectedComponent.description}</p>
              </div>
              {selectedComponent.responsibilities.length > 0 && (
                <div>
                  <p className="text-gray-500 text-xs uppercase tracking-wide mb-2">Responsibilities</p>
                  <ul className="space-y-1">
                    {selectedComponent.responsibilities.map((r, i) => (
                      <li key={i} className="text-gray-400 flex items-start gap-1.5">
                        <span className="text-indigo-400 flex-shrink-0">·</span>
                        {r}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {selectedComponent.requirements.length > 0 && (
                <div>
                  <p className="text-gray-500 text-xs uppercase tracking-wide mb-2">Requirements</p>
                  <div className="flex flex-wrap gap-1">
                    {selectedComponent.requirements.map((r) => (
                      <span key={r} className="badge badge-purple text-xs">{r}</span>
                    ))}
                  </div>
                </div>
              )}
              {selectedComponent.isSinglePointOfFailure && (
                <div className="p-3 bg-red-900/20 border border-red-700/50 rounded-lg text-red-300 text-xs">
                  ⚠ This component is a Single Point of Failure. Consider adding redundancy.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
