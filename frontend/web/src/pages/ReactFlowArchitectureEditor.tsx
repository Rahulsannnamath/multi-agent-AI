// apps/web/src/pages/ReactFlowArchitectureEditor.tsx
import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Handle,
  Position
} from '@xyflow/react';
import type { Connection, Edge, Node } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  ArrowLeft,
  Save,
  Loader2,
  AlertCircle,
  Sparkles,
  Server,
  Database,
  Globe,
  Settings,
  Cloud
} from 'lucide-react';
import { reactFlowArchitecturesApi } from '../services/api';
import clsx from 'clsx';

// ── Custom Nodes ─────────────────────────────────────────────────────────

const ServiceNode = ({ data, selected }: any) => (
  <div className={clsx(
    "px-4 py-2 shadow-md rounded-xl bg-gray-900 border-2",
    selected ? "border-indigo-500" : "border-gray-700"
  )}>
    <Handle type="target" position={Position.Top} className="w-16 !bg-indigo-500" />
    <div className="flex items-center gap-2">
      <div className="rounded-full w-8 h-8 flex items-center justify-center bg-indigo-900/50">
        <Server className="w-4 h-4 text-indigo-400" />
      </div>
      <div>
        <div className="text-sm font-bold text-white">{data.name}</div>
        <div className="text-xs text-gray-400">{data.technology || 'Service'}</div>
      </div>
    </div>
    <Handle type="source" position={Position.Bottom} className="w-16 !bg-indigo-500" />
  </div>
);

const DatabaseNode = ({ data, selected }: any) => (
  <div className={clsx(
    "px-4 py-2 shadow-md rounded-xl bg-gray-900 border-2",
    selected ? "border-emerald-500" : "border-gray-700"
  )}>
    <Handle type="target" position={Position.Top} className="w-16 !bg-emerald-500" />
    <div className="flex items-center gap-2">
      <div className="rounded-full w-8 h-8 flex items-center justify-center bg-emerald-900/50">
        <Database className="w-4 h-4 text-emerald-400" />
      </div>
      <div>
        <div className="text-sm font-bold text-white">{data.name}</div>
        <div className="text-xs text-gray-400">{data.technology || 'Database'}</div>
      </div>
    </div>
    <Handle type="source" position={Position.Bottom} className="w-16 !bg-emerald-500" />
  </div>
);

const FrontendNode = ({ data, selected }: any) => (
  <div className={clsx(
    "px-4 py-2 shadow-md rounded-xl bg-gray-900 border-2",
    selected ? "border-blue-500" : "border-gray-700"
  )}>
    <Handle type="target" position={Position.Top} className="w-16 !bg-blue-500" />
    <div className="flex items-center gap-2">
      <div className="rounded-full w-8 h-8 flex items-center justify-center bg-blue-900/50">
        <Globe className="w-4 h-4 text-blue-400" />
      </div>
      <div>
        <div className="text-sm font-bold text-white">{data.name}</div>
        <div className="text-xs text-gray-400">{data.technology || 'Frontend'}</div>
      </div>
    </div>
    <Handle type="source" position={Position.Bottom} className="w-16 !bg-blue-500" />
  </div>
);

const GenericNode = ({ data, selected }: any) => (
  <div className={clsx(
    "px-4 py-2 shadow-md rounded-xl bg-gray-900 border-2",
    selected ? "border-purple-500" : "border-gray-700"
  )}>
    <Handle type="target" position={Position.Top} className="w-16 !bg-purple-500" />
    <div className="flex items-center gap-2">
      <div className="rounded-full w-8 h-8 flex items-center justify-center bg-purple-900/50">
        <Cloud className="w-4 h-4 text-purple-400" />
      </div>
      <div>
        <div className="text-sm font-bold text-white">{data.name}</div>
        <div className="text-xs text-gray-400">{data.technology || data.type || 'Component'}</div>
      </div>
    </div>
    <Handle type="source" position={Position.Bottom} className="w-16 !bg-purple-500" />
  </div>
);

const nodeTypes = {
  service: ServiceNode,
  backend: ServiceNode,
  database: DatabaseNode,
  cache: DatabaseNode,
  frontend: FrontendNode,
  generic: GenericNode,
};

// ── Main Editor ──────────────────────────────────────────────────────────

export function ReactFlowArchitectureEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  // Architecture state
  const [arch, setArch] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // React Flow state
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // AI Prompt State
  const [prompt, setPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  
  // Selection state
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    loadArchitecture();
  }, [id]);

  const loadArchitecture = async () => {
    try {
      setLoading(true);
      const { data } = await reactFlowArchitecturesApi.get(id!);
      setArch(data);
      
      // Convert domain model to React Flow
      const rfNodes = data.nodes.map((n: any) => {
        let type = 'generic';
        if (['service', 'backend', 'api'].includes(n.type)) type = 'service';
        if (['database', 'cache', 'storage'].includes(n.type)) type = 'database';
        if (['frontend', 'web', 'mobile'].includes(n.type)) type = 'frontend';

        return {
          id: n.id,
          type,
          position: n.position || { x: 0, y: 0 },
          data: { ...n }
        };
      });

      const rfEdges = data.edges.map((e: any) => ({
        id: e.id || `${e.source}-${e.target}`,
        source: e.source,
        target: e.target,
        label: e.label,
        animated: true,
        style: { stroke: '#6366f1', strokeWidth: 2 }
      }));

      setNodes(rfNodes);
      setEdges(rfEdges);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  const onConnect = useCallback(
    (params: Connection | Edge) => setEdges((eds) => addEdge({ ...params, animated: true, style: { stroke: '#6366f1', strokeWidth: 2 } }, eds)),
    [setEdges],
  );

  const handleSave = async () => {
    try {
      setSaving(true);
      
      // Convert React Flow state back to domain model
      const updatedNodes = nodes.map(n => ({
        ...n.data,
        position: n.position,
        id: n.id
      }));

      const updatedEdges = edges.map(e => ({
        id: e.id,
        source: e.source,
        target: e.target,
        label: e.label,
        type: 'request'
      }));

      await reactFlowArchitecturesApi.update(id!, {
        nodes: updatedNodes,
        edges: updatedEdges
      });
      
      // reload to get new version number etc
      await loadArchitecture();
    } catch (err) {
      alert('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    try {
      setGenerating(true);
      await reactFlowArchitecturesApi.generateArchitecture(id!, prompt);
      await loadArchitecture();
      setPrompt('');
    } catch (err) {
      alert('Generation failed: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setGenerating(false);
    }
  };

  // Node selection handler
  const onSelectionChange = useCallback(({ nodes }: { nodes: Node[] }) => {
    if (nodes.length === 1) {
      setSelectedNodeId(nodes[0].id);
    } else {
      setSelectedNodeId(null);
    }
  }, []);

  const selectedNode = nodes.find(n => n.id === selectedNodeId);

  // Update selected node data
  const updateSelectedNode = (field: string, value: string) => {
    setNodes(nds => nds.map(node => {
      if (node.id === selectedNodeId) {
        return {
          ...node,
          data: { ...node.data, [field]: value }
        };
      }
      return node;
    }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-lg text-white mb-2">Error</h2>
          <p className="text-gray-400 mb-4">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* ── Toolbar ───────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-4 py-2.5 bg-gray-900 border-b border-gray-800 flex-shrink-0 z-10">
        <button
          className="p-2 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white"
          onClick={() => navigate('/rf-designer')}
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1">
          <h1 className="text-sm font-bold text-white">{arch?.name}</h1>
          <p className="text-xs text-gray-500">v{arch?.version}</p>
        </div>
        
        {/* AI Prompt */}
        <div className="flex items-center gap-2 max-w-lg w-full">
          <input 
            type="text" 
            className="input text-xs py-1.5 flex-1"
            placeholder="E.g., Build a microservices e-commerce system..."
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleGenerate()}
          />
          <button 
            className="btn-primary text-xs py-1.5 flex items-center gap-1.5 whitespace-nowrap"
            onClick={handleGenerate}
            disabled={generating}
          >
            {generating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
            AI Generate
          </button>
        </div>

        <button
          className="btn-secondary text-xs py-1.5 flex items-center gap-1.5 ml-4"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
          Save
        </button>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* ── Canvas ────────────────────────────────────────────────────────────── */}
        <div className="flex-1 relative bg-[#0a0a0f]">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onSelectionChange={onSelectionChange}
            nodeTypes={nodeTypes}
            fitView
            colorMode="dark"
            className="bg-[#0a0a0f]"
          >
            <Background color="#1f2937" gap={16} />
            <Controls />
            <MiniMap 
              nodeColor={(n) => {
                if (n.type === 'frontend') return '#3b82f6';
                if (n.type === 'database') return '#10b981';
                return '#6366f1';
              }} 
              maskColor="rgba(0, 0, 0, 0.7)"
              className="bg-gray-900 border-gray-700"
            />
          </ReactFlow>
        </div>

        {/* ── Properties Panel ──────────────────────────────────────────────────── */}
        <div className="w-80 bg-gray-900 border-l border-gray-800 flex flex-col z-10 overflow-y-auto">
          <div className="p-4 border-b border-gray-800 flex items-center gap-2">
            <Settings className="w-4 h-4 text-gray-400" />
            <h2 className="text-sm font-semibold text-white">Properties</h2>
          </div>
          
          <div className="p-4">
            {selectedNode ? (
              <div className="space-y-4">
                <div>
                  <label className="label">Component Name</label>
                  <input 
                    className="input text-sm"
                    value={selectedNode.data.name || ''}
                    onChange={(e) => updateSelectedNode('name', e.target.value)}
                  />
                </div>
                <div>
                  <label className="label">Type</label>
                  <select 
                    className="select text-sm"
                    value={selectedNode.data.type || ''}
                    onChange={(e) => updateSelectedNode('type', e.target.value)}
                  >
                    <option value="frontend">Frontend</option>
                    <option value="backend">Backend API</option>
                    <option value="service">Microservice</option>
                    <option value="database">Database</option>
                    <option value="cache">Cache</option>
                    <option value="queue">Message Queue</option>
                  </select>
                </div>
                <div>
                  <label className="label">Technology</label>
                  <input 
                    className="input text-sm"
                    value={selectedNode.data.technology || ''}
                    onChange={(e) => updateSelectedNode('technology', e.target.value)}
                    placeholder="e.g., React, Node.js, PostgreSQL"
                  />
                </div>
                <div>
                  <label className="label">Framework</label>
                  <input 
                    className="input text-sm"
                    value={selectedNode.data.framework || ''}
                    onChange={(e) => updateSelectedNode('framework', e.target.value)}
                    placeholder="e.g., Next.js, Express, Spring"
                  />
                </div>
                <div>
                  <label className="label">Description</label>
                  <textarea 
                    className="input text-sm resize-none"
                    rows={4}
                    value={selectedNode.data.description || ''}
                    onChange={(e) => updateSelectedNode('description', e.target.value)}
                  />
                </div>
              </div>
            ) : (
              <div className="text-center text-gray-500 mt-10">
                <p className="text-sm">Select a node to edit its properties.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
