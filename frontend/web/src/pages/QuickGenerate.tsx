// apps/web/src/pages/QuickGenerate.tsx
// Quick generate page: prompt → generate → file tree → Live Preview → iframe/new tab
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Zap,
  Play,
  Square,
  Trash2,
  Loader2,
  ExternalLink,
  ChevronRight,
  ChevronDown,
  File,
  Folder,
  RefreshCw,
  AlertCircle,
  Monitor,
  X,
  Cloud,
  Cpu,
} from 'lucide-react';
import { generatedAppsApi, subscribeToAppEvents } from '../services/api';
import clsx from 'clsx';

interface GeneratedApp {
  appId: string;
  prompt: string;
  provider?: 'openai' | 'bedrock';
  status: string;
  filePaths: string[];
  previewUrl: string | null;
  previewPort: number | null;
  fixAttempts: number;
  lastError: string | null;
  createdAt: string;
}

interface FileEntry {
  path: string;
  content: string;
}

// Build a tree structure from flat file paths
interface TreeNode {
  name: string;
  path: string;
  isDir: boolean;
  children: TreeNode[];
}

function buildTree(paths: string[]): TreeNode[] {
  const root: TreeNode[] = [];

  for (const filePath of paths) {
    const parts = filePath.replace(/\\/g, '/').split('/');
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      const existing = current.find((n) => n.name === part);

      if (existing) {
        current = existing.children;
      } else {
        const node: TreeNode = {
          name: part,
          path: parts.slice(0, i + 1).join('/'),
          isDir: !isLast,
          children: [],
        };
        current.push(node);
        current = node.children;
      }
    }
  }

  // Sort: directories first, then alphabetically
  function sortTree(nodes: TreeNode[]) {
    nodes.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    nodes.forEach((n) => sortTree(n.children));
  }
  sortTree(root);
  return root;
}

function FileTreeNode({
  node,
  depth,
  selectedFile,
  onSelect,
}: {
  node: TreeNode;
  depth: number;
  selectedFile: string | null;
  onSelect: (path: string) => void;
}) {
  const [expanded, setExpanded] = useState(depth < 2);

  if (node.isDir) {
    return (
      <div>
        <button
          className="flex items-center gap-1.5 w-full text-left py-1 px-2 hover:bg-gray-800 rounded text-sm transition-colors"
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? (
            <ChevronDown className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
          )}
          <Folder className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
          <span className="text-gray-300 truncate">{node.name}</span>
        </button>
        {expanded && node.children.map((child) => (
          <FileTreeNode
            key={child.path}
            node={child}
            depth={depth + 1}
            selectedFile={selectedFile}
            onSelect={onSelect}
          />
        ))}
      </div>
    );
  }

  const isSelected = selectedFile === node.path;
  return (
    <button
      className={clsx(
        'flex items-center gap-1.5 w-full text-left py-1 px-2 rounded text-sm transition-colors',
        isSelected ? 'bg-indigo-600/20 text-indigo-300' : 'hover:bg-gray-800 text-gray-400'
      )}
      style={{ paddingLeft: `${depth * 16 + 8}px` }}
      onClick={() => onSelect(node.path)}
    >
      <div className="w-3.5" />
      <File className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
      <span className="truncate">{node.name}</span>
    </button>
  );
}

export function QuickGenerate() {
  const [prompt, setPrompt] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentApp, setCurrentApp] = useState<GeneratedApp | null>(null);
  const [progressMsg, setProgressMsg] = useState('');
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [showIframe, setShowIframe] = useState(false);
  const [apps, setApps] = useState<GeneratedApp[]>([]);
  const [genProvider, setGenProvider] = useState<'openai' | 'bedrock'>('openai');
  const unsubRef = useRef<(() => void) | null>(null);

  // Load existing apps on mount
  useEffect(() => {
    generatedAppsApi.list().then((res) => setApps(res.data)).catch(console.error);
  }, []);

  const subscribeToApp = useCallback((appId: string) => {
    // Cleanup previous subscription
    if (unsubRef.current) unsubRef.current();

    const unsub = subscribeToAppEvents(appId, (type, data) => {
      if (type === 'app-progress') {
        setProgressMsg(data['message'] as string || '');
      }

      if (type === 'app-generated') {
        setProgressMsg('Files generated successfully!');
        // Refresh app state
        generatedAppsApi.get(appId).then((res) => setCurrentApp(res.data)).catch(console.error);
        generatedAppsApi.getFiles(appId).then((res) => setFiles(res.data.files)).catch(console.error);
      }

      if (type === 'app-running') {
        setProgressMsg('');
        generatedAppsApi.get(appId).then((res) => setCurrentApp(res.data)).catch(console.error);
      }

      if (type === 'app-error') {
        setProgressMsg('');
        setError(data['error'] as string || 'An error occurred');
        generatedAppsApi.get(appId).then((res) => setCurrentApp(res.data)).catch(console.error);
      }

      if (type === 'app-stopped' || type === 'app-deleted') {
        generatedAppsApi.get(appId).then((res) => setCurrentApp(res.data)).catch(() => {
          setCurrentApp(null);
        });
      }
    });

    unsubRef.current = unsub;
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (unsubRef.current) unsubRef.current();
    };
  }, []);

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      setError('Please enter a description of the app you want to generate');
      return;
    }

    setSubmitting(true);
    setError(null);
    setProgressMsg('Starting generation...');
    setFiles([]);
    setSelectedFile(null);
    setShowIframe(false);

    try {
      const { data } = await generatedAppsApi.create(prompt.trim(), genProvider);
      const appId = data.appId;

      // Load the app immediately
      const appRes = await generatedAppsApi.get(appId);
      setCurrentApp(appRes.data);
      subscribeToApp(appId);

      // Refresh the apps list
      generatedAppsApi.list().then((res) => setApps(res.data)).catch(console.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start generation');
      setProgressMsg('');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePreview = async () => {
    if (!currentApp) return;
    setError(null);
    setProgressMsg('Starting Docker build...');

    try {
      await generatedAppsApi.preview(currentApp.appId);
      // SSE will handle status updates
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start preview');
      setProgressMsg('');
    }
  };

  const handleStop = async () => {
    if (!currentApp) return;
    try {
      await generatedAppsApi.stop(currentApp.appId);
      setShowIframe(false);
      generatedAppsApi.get(currentApp.appId).then((res) => setCurrentApp(res.data)).catch(console.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to stop app');
    }
  };

  const handleDelete = async () => {
    if (!currentApp) return;
    try {
      await generatedAppsApi.delete(currentApp.appId);
      setCurrentApp(null);
      setFiles([]);
      setSelectedFile(null);
      setShowIframe(false);
      setProgressMsg('');
      setError(null);
      generatedAppsApi.list().then((res) => setApps(res.data)).catch(console.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete app');
    }
  };

  const loadApp = async (app: GeneratedApp) => {
    setCurrentApp(app);
    setError(app.lastError || null);
    setProgressMsg('');
    setShowIframe(false);
    subscribeToApp(app.appId);

    if (app.status !== 'generating') {
      try {
        const res = await generatedAppsApi.getFiles(app.appId);
        setFiles(res.data.files);
      } catch {
        setFiles([]);
      }
    }
  };

  const selectedFileContent = files.find((f) => f.path === selectedFile)?.content ?? null;
  const fileTree = currentApp ? buildTree(
    currentApp.filePaths.filter((p) => {
      const pp = p.replace(/\\/g, '/');
      return pp.startsWith('client/') || pp.startsWith('server/');
    })
  ) : [];

  const demoPrompts = [
    { label: 'Todo App', prompt: 'Todo app with tags and priorities, seed 10 todos with realistic data' },
    { label: 'Blog Platform', prompt: 'Blog platform with posts, categories, and comments. Seed with 5 posts and comments.' },
    { label: 'Expense Tracker', prompt: 'Personal expense tracker with categories, monthly charts. Seed with 20 expenses.' },
  ];

  const isGenerating = currentApp?.status === 'generating';
  const isGenerated = currentApp?.status === 'generated' || currentApp?.status === 'stopped';
  const isBuilding = currentApp?.status === 'building';
  const isRunning = currentApp?.status === 'running';
  const isFailed = currentApp?.status === 'failed' || currentApp?.status === 'error';

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-xl flex items-center justify-center">
              <Zap className="w-5 h-5 text-white" />
            </div>
            Quick Generate
          </h1>
          <p className="text-gray-400 mt-2">
            Describe an app → AI generates it → Run in Docker → Live Preview
          </p>
        </div>
      </div>

      {/* Error display */}
      {error && (
        <div className="mb-6 p-4 bg-red-900/20 border border-red-700/50 rounded-xl flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-red-300 text-sm whitespace-pre-wrap break-words">{error}</p>
          </div>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-300">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-12 gap-6">
        {/* Left column: Prompt + History */}
        <div className="col-span-4 space-y-6">
          {/* Prompt input */}
          <div className="card">
            <h2 className="section-title mb-4">Generate App</h2>
            <textarea
              className="input min-h-[120px] resize-y mb-3"
              placeholder={"Describe the app you want to build...\n\nExample: Todo app with tags, seed 10 todos"}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              disabled={submitting || isGenerating}
            />
            <div className="flex gap-2 flex-wrap mb-3">
              {demoPrompts.map((d) => (
                <button
                  key={d.label}
                  type="button"
                  className="text-xs px-2.5 py-1 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-gray-200 rounded-md transition-colors border border-gray-700"
                  onClick={() => setPrompt(d.prompt)}
                >
                  {d.label}
                </button>
              ))}
            </div>

            {/* Provider selector */}
            <div className="mb-3">
              <label className="text-xs font-medium text-gray-400 mb-2 block">Generate with</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  className={clsx(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border',
                    genProvider === 'openai'
                      ? 'border-emerald-600 bg-emerald-600/15 text-emerald-300'
                      : 'border-gray-700 bg-gray-800/50 text-gray-500 hover:text-gray-300 hover:border-gray-600'
                  )}
                  onClick={() => setGenProvider('openai')}
                >
                  <Cpu className="w-3.5 h-3.5" />
                  OpenAI
                </button>
                <button
                  type="button"
                  className={clsx(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border',
                    genProvider === 'bedrock'
                      ? 'border-orange-600 bg-orange-600/15 text-orange-300'
                      : 'border-gray-700 bg-gray-800/50 text-gray-500 hover:text-gray-300 hover:border-gray-600'
                  )}
                  onClick={() => setGenProvider('bedrock')}
                >
                  <Cloud className="w-3.5 h-3.5" />
                  AWS Bedrock
                </button>
              </div>
            </div>

            <button
              className="btn-primary w-full py-2.5 flex items-center justify-center gap-2"
              onClick={handleGenerate}
              disabled={submitting || isGenerating || !prompt.trim()}
            >
              {submitting || isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4" />
                  Generate App
                </>
              )}
            </button>
          </div>

          {/* Progress / Status bar */}
          {(progressMsg || isBuilding) && (
            <div className="card flex items-center gap-3">
              <Loader2 className="w-5 h-5 text-blue-400 animate-spin flex-shrink-0" />
              <p className="text-sm text-blue-300">{progressMsg || 'Building...'}</p>
            </div>
          )}

          {/* Action buttons when app is ready */}
          {currentApp && !isGenerating && (
            <div className="card space-y-3">
              <h3 className="text-sm font-medium text-gray-300">Actions</h3>
              <div className="flex flex-wrap gap-2">
                {(isGenerated || isFailed) && (
                  <button className="btn-primary text-sm py-2 flex items-center gap-2" onClick={handlePreview}>
                    <Play className="w-3.5 h-3.5" />
                    Live Preview
                  </button>
                )}
                {isRunning && currentApp.previewUrl && (
                  <>
                    <a
                      href={currentApp.previewUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-primary text-sm py-2 flex items-center gap-2"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      Open in Tab
                    </a>
                    <button
                      className="btn-secondary text-sm py-2 flex items-center gap-2"
                      onClick={() => setShowIframe(!showIframe)}
                    >
                      <Monitor className="w-3.5 h-3.5" />
                      {showIframe ? 'Hide Preview' : 'Iframe View'}
                    </button>
                  </>
                )}
                {isRunning && (
                  <button className="btn-secondary text-sm py-2 flex items-center gap-2" onClick={handleStop}>
                    <Square className="w-3.5 h-3.5" />
                    Stop
                  </button>
                )}
                <button className="btn-danger text-sm py-2 flex items-center gap-2" onClick={handleDelete}>
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete
                </button>
              </div>

              {/* Status badge */}
              <div className="flex items-center gap-2 pt-2 border-t border-gray-800">
                <span className={clsx(
                  'status-dot',
                  isRunning && 'bg-emerald-400',
                  isBuilding && 'bg-blue-400 animate-pulse',
                  isGenerated && 'bg-amber-400',
                  isFailed && 'bg-red-400',
                  currentApp.status === 'stopped' && 'bg-gray-500',
                )} />
                <span className="text-sm text-gray-400 capitalize">{currentApp.status}</span>
                {isRunning && currentApp.previewUrl && (
                  <span className="text-xs text-emerald-400 ml-auto font-mono">{currentApp.previewUrl}</span>
                )}
                {currentApp.fixAttempts > 0 && (
                  <span className="text-xs text-amber-400 ml-auto flex items-center gap-1">
                    <RefreshCw className="w-3 h-3" />
                    {currentApp.fixAttempts} fix attempts
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Past apps */}
          {apps.length > 0 && (
            <div className="card">
              <h3 className="text-sm font-medium text-gray-300 mb-3">Recent Apps</h3>
              <div className="space-y-1 max-h-64 overflow-y-auto">
                {apps.map((app) => (
                  <button
                    key={app.appId}
                    className={clsx(
                      'w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center gap-2',
                      currentApp?.appId === app.appId ? 'bg-indigo-600/20 text-indigo-300' : 'hover:bg-gray-800 text-gray-400'
                    )}
                    onClick={() => loadApp(app)}
                  >
                    <span className={clsx(
                      'status-dot flex-shrink-0',
                      app.status === 'running' && 'bg-emerald-400',
                      app.status === 'generated' && 'bg-amber-400',
                      app.status === 'generating' && 'bg-blue-400 animate-pulse',
                      app.status === 'failed' && 'bg-red-400',
                      app.status === 'error' && 'bg-red-400',
                      app.status === 'stopped' && 'bg-gray-500',
                    )} />
                    <span className="truncate flex-1">{app.prompt.slice(0, 50)}{app.prompt.length > 50 ? '...' : ''}</span>
                    <ChevronRight className="w-3.5 h-3.5 flex-shrink-0 text-gray-600" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right column: File tree + Content viewer + iframe */}
        <div className="col-span-8 space-y-6">
          {/* Iframe preview */}
          {showIframe && isRunning && currentApp?.previewUrl && (
            <div className="card p-0 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
                <div className="flex items-center gap-2">
                  <div className="flex gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-red-500" />
                    <div className="w-3 h-3 rounded-full bg-amber-500" />
                    <div className="w-3 h-3 rounded-full bg-emerald-500" />
                  </div>
                  <span className="text-xs text-gray-400 font-mono ml-2">{currentApp.previewUrl}</span>
                </div>
                <div className="flex items-center gap-2">
                  <a
                    href={currentApp.previewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-gray-400 hover:text-gray-200 transition-colors"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                  <button
                    onClick={() => setShowIframe(false)}
                    className="text-gray-400 hover:text-gray-200 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <iframe
                src={currentApp.previewUrl}
                className="w-full bg-white"
                style={{ height: '500px' }}
                title="App Preview"
              />
            </div>
          )}

          {/* File tree + viewer */}
          {currentApp && fileTree.length > 0 && (
            <div className="card p-0 overflow-hidden">
              <div className="flex items-center px-4 py-3 border-b border-gray-800">
                <h3 className="text-sm font-medium text-gray-300 flex items-center gap-2">
                  <Folder className="w-4 h-4 text-amber-400" />
                  Generated Files
                  <span className="text-xs text-gray-500">({currentApp.filePaths.filter(
                    (p) => p.startsWith('client/') || p.startsWith('server/')
                  ).length} files)</span>
                </h3>
              </div>
              <div className="grid grid-cols-12" style={{ minHeight: '400px' }}>
                {/* Tree sidebar */}
                <div className="col-span-4 border-r border-gray-800 overflow-y-auto p-2" style={{ maxHeight: '600px' }}>
                  {fileTree.map((node) => (
                    <FileTreeNode
                      key={node.path}
                      node={node}
                      depth={0}
                      selectedFile={selectedFile}
                      onSelect={(p) => setSelectedFile(p)}
                    />
                  ))}
                </div>
                {/* File content */}
                <div className="col-span-8 overflow-auto p-0" style={{ maxHeight: '600px' }}>
                  {selectedFile && selectedFileContent !== null ? (
                    <div>
                      <div className="sticky top-0 bg-gray-900 border-b border-gray-800 px-4 py-2 flex items-center gap-2">
                        <File className="w-3.5 h-3.5 text-gray-500" />
                        <span className="text-xs text-gray-400 font-mono">{selectedFile}</span>
                      </div>
                      <pre className="p-4 text-xs text-gray-300 font-mono whitespace-pre-wrap break-words leading-relaxed">
                        {selectedFileContent}
                      </pre>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-full text-gray-600 text-sm">
                      Select a file to view its contents
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Empty state */}
          {!currentApp && (
            <div className="card text-center py-20">
              <div className="w-16 h-16 bg-gradient-to-br from-cyan-600/20 to-blue-600/20 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-cyan-600/20">
                <Zap className="w-8 h-8 text-cyan-400" />
              </div>
              <h3 className="text-lg font-medium text-gray-300 mb-2">No app selected</h3>
              <p className="text-gray-500 max-w-md mx-auto">
                Enter a description in the prompt box and click Generate to create a full-stack MERN app.
                Once generated, you can preview it live in Docker.
              </p>
            </div>
          )}

          {/* Generating placeholder */}
          {currentApp && isGenerating && fileTree.length === 0 && (
            <div className="card text-center py-20">
              <Loader2 className="w-12 h-12 text-blue-400 animate-spin mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-300 mb-2">Generating your app...</h3>
              <p className="text-gray-500 text-sm">{progressMsg || 'This usually takes 30-60 seconds'}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
