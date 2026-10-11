// apps/web/src/pages/DiagramList.tsx
// Architecture Designer — diagram dashboard with create/rename/delete.

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  Pencil,
  Trash2,
  FileText,
  Loader2,
  AlertCircle,
  PenTool,
} from 'lucide-react';
import { diagramsApi } from '../services/api';
import clsx from 'clsx';

interface DiagramSummary {
  diagramId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export function DiagramList() {
  const navigate = useNavigate();
  const [diagrams, setDiagrams] = useState<DiagramSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadDiagrams = async () => {
    try {
      setLoading(true);
      const { data } = await diagramsApi.list();
      setDiagrams(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load diagrams');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDiagrams();
  }, []);

  const handleCreate = async () => {
    if (creating) return;
    setCreating(true);
    try {
      const { data } = await diagramsApi.create(newName.trim() || undefined);
      setShowCreate(false);
      setNewName('');
      navigate(`/designer/${data.diagramId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create diagram');
    } finally {
      setCreating(false);
    }
  };

  const handleRename = async (id: string) => {
    if (!renameValue.trim()) return;
    try {
      await diagramsApi.update(id, { name: renameValue.trim() });
      setDiagrams((prev) =>
        prev.map((d) => (d.diagramId === id ? { ...d, name: renameValue.trim() } : d))
      );
      setRenamingId(null);
      setRenameValue('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rename diagram');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      setDeletingId(id);
      await diagramsApi.delete(id);
      setDiagrams((prev) => prev.filter((d) => d.diagramId !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete diagram');
    } finally {
      setDeletingId(null);
    }
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-xl flex items-center justify-center">
            <PenTool className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Architecture Designer</h1>
            <p className="text-sm text-gray-400 mt-0.5">
              Create and edit architecture diagrams with draw.io
            </p>
          </div>
        </div>
        <button
          className="btn-primary flex items-center gap-2"
          onClick={() => setShowCreate(true)}
        >
          <Plus className="w-4 h-4" />
          New Diagram
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

      {/* Create modal overlay */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="card w-full max-w-md mx-4">
            <h2 className="text-lg font-semibold text-white mb-4">Create New Diagram</h2>
            <input
              className="input mb-4"
              placeholder="Diagram name (optional)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              autoFocus
            />
            <div className="flex justify-end gap-3">
              <button
                className="btn-secondary"
                onClick={() => {
                  setShowCreate(false);
                  setNewName('');
                }}
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

      {/* Diagram list */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
          <span className="ml-3 text-gray-400">Loading diagrams...</span>
        </div>
      ) : diagrams.length === 0 ? (
        <div className="text-center py-20">
          <div className="w-16 h-16 mx-auto mb-4 bg-gray-800 rounded-2xl flex items-center justify-center">
            <PenTool className="w-8 h-8 text-gray-600" />
          </div>
          <h3 className="text-lg font-medium text-gray-300 mb-2">No diagrams yet</h3>
          <p className="text-sm text-gray-500 mb-6">
            Create your first architecture diagram to get started.
          </p>
          <button
            className="btn-primary inline-flex items-center gap-2"
            onClick={() => setShowCreate(true)}
          >
            <Plus className="w-4 h-4" />
            Create Diagram
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">
            My Diagrams ({diagrams.length})
          </p>
          {diagrams.map((d) => (
            <div
              key={d.diagramId}
              className={clsx(
                'card-sm flex items-center gap-4 cursor-pointer transition-all duration-150',
                'hover:border-indigo-700/50 hover:bg-gray-800/50 group',
                deletingId === d.diagramId && 'opacity-50 pointer-events-none'
              )}
              onClick={() => {
                if (renamingId !== d.diagramId) navigate(`/designer/${d.diagramId}`);
              }}
            >
              <div className="w-10 h-10 bg-gradient-to-br from-cyan-900/50 to-blue-900/50 rounded-lg flex items-center justify-center border border-cyan-800/30 flex-shrink-0">
                <FileText className="w-5 h-5 text-cyan-400" />
              </div>

              <div className="flex-1 min-w-0">
                {renamingId === d.diagramId ? (
                  <input
                    className="input text-sm py-1"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleRename(d.diagramId);
                      if (e.key === 'Escape') setRenamingId(null);
                    }}
                    onBlur={() => handleRename(d.diagramId)}
                    onClick={(e) => e.stopPropagation()}
                    autoFocus
                  />
                ) : (
                  <>
                    <p className="text-sm font-medium text-white truncate">{d.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Updated {formatDate(d.updatedAt)}
                    </p>
                  </>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  className="p-2 rounded-lg hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
                  title="Rename"
                  onClick={(e) => {
                    e.stopPropagation();
                    setRenamingId(d.diagramId);
                    setRenameValue(d.name);
                  }}
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  className="p-2 rounded-lg hover:bg-red-900/30 text-gray-400 hover:text-red-400 transition-colors"
                  title="Delete"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm('Delete this diagram? This cannot be undone.')) {
                      handleDelete(d.diagramId);
                    }
                  }}
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
