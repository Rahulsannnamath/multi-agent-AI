// apps/web/src/pages/ReactFlowArchitectureList.tsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  Trash2,
  FileCode,
  Loader2,
  AlertCircle,
  Component,
} from 'lucide-react';
import { reactFlowArchitecturesApi } from '../services/api';

export function ReactFlowArchitectureList() {
  const navigate = useNavigate();
  const [architectures, setArchitectures] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [creating, setCreating] = useState(false);

  const loadArchitectures = async () => {
    try {
      setLoading(true);
      const { data } = await reactFlowArchitecturesApi.list();
      setArchitectures(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load architectures');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadArchitectures();
  }, []);

  const handleCreate = async () => {
    if (creating) return;
    setCreating(true);
    try {
      const { data } = await reactFlowArchitecturesApi.create({
        name: newName.trim() || undefined,
        description: newDesc.trim() || undefined
      });
      setShowCreate(false);
      setNewName('');
      setNewDesc('');
      navigate(`/rf-designer/${data.architectureId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create architecture');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this architecture?')) return;
    try {
      await reactFlowArchitecturesApi.delete(id);
      setArchitectures((prev) => prev.filter((a) => a.architectureId !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete architecture');
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center">
            <Component className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">React Flow Designer</h1>
            <p className="text-sm text-gray-400 mt-0.5">
              Native interactive architecture visualizer
            </p>
          </div>
        </div>
        <button
          className="btn-primary flex items-center gap-2"
          onClick={() => setShowCreate(true)}
        >
          <Plus className="w-4 h-4" />
          New Architecture
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-6 p-4 bg-red-900/20 border border-red-800 rounded-lg flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
          <p className="text-sm text-red-300">{error}</p>
          <button
            className="ml-auto text-red-400 hover:text-red-300 text-xs"
            onClick={() => setError(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="card w-full max-w-md mx-4">
            <h2 className="text-lg font-semibold text-white mb-4">New Architecture</h2>
            <input
              className="input mb-3"
              placeholder="System Name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              autoFocus
            />
            <textarea
              className="input mb-4"
              placeholder="Description (optional)"
              rows={3}
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
            />
            <div className="flex justify-end gap-3">
              <button
                className="btn-secondary"
                onClick={() => setShowCreate(false)}
              >
                Cancel
              </button>
              <button className="btn-primary flex items-center gap-2" onClick={handleCreate} disabled={creating}>
                {creating && <Loader2 className="w-4 h-4 animate-spin" />}
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
        </div>
      ) : architectures.length === 0 ? (
        <div className="text-center py-20">
          <div className="w-16 h-16 mx-auto mb-4 bg-gray-800 rounded-2xl flex items-center justify-center">
            <Component className="w-8 h-8 text-gray-600" />
          </div>
          <h3 className="text-lg font-medium text-gray-300 mb-2">No architectures</h3>
          <p className="text-sm text-gray-500 mb-6">Create one to get started.</p>
          <button className="btn-primary" onClick={() => setShowCreate(true)}>Create</button>
        </div>
      ) : (
        <div className="space-y-3">
          {architectures.map((arch) => (
            <div
              key={arch.architectureId}
              className="card-sm flex items-center gap-4 cursor-pointer hover:border-indigo-700/50 hover:bg-gray-800/50 group transition-all"
              onClick={() => navigate(`/rf-designer/${arch.architectureId}`)}
            >
              <div className="w-10 h-10 bg-indigo-900/30 rounded-lg flex items-center justify-center border border-indigo-800/30">
                <FileCode className="w-5 h-5 text-indigo-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{arch.name}</p>
                <p className="text-xs text-gray-500 truncate mt-0.5">
                  {arch.description || 'No description'} — v{arch.version}
                </p>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  className="p-2 rounded-lg hover:bg-red-900/30 text-gray-400 hover:text-red-400 transition-colors"
                  onClick={(e) => handleDelete(arch.architectureId, e)}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
