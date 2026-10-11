// apps/web/src/pages/DiagramEditor.tsx
// Architecture Designer — embedded draw.io editor using iframe + postMessage.

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Save,
  Download,
  Image as ImageIcon,
  FileCode,
  FileText,
  Loader2,
  AlertCircle,
  Check,
  CloudOff,
  Sparkles,
  X,
  Pencil,
} from 'lucide-react';
import { diagramsApi } from '../services/api';
import clsx from 'clsx';

// ── Draw.io postMessage protocol types ────────────────────────────────────────
interface DrawioInitEvent {
  event: 'init';
}
interface DrawioSaveEvent {
  event: 'save';
  xml: string;
}
interface DrawioExportEvent {
  event: 'export';
  data: string;
  format: string;
}
interface DrawioExitEvent {
  event: 'exit';
}
type DrawioEvent = DrawioInitEvent | DrawioSaveEvent | DrawioExportEvent | DrawioExitEvent;

const DRAWIO_ORIGIN = 'https://embed.diagrams.net';
const DRAWIO_URL =
  'https://embed.diagrams.net/?embed=1&proto=json&spin=1&libraries=1&saveAndExit=0&noSaveBtn=0&noExitBtn=1';

type SaveStatus = 'saved' | 'saving' | 'unsaved' | 'error';

export function DiagramEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  // Diagram state
  const [name, setName] = useState('');
  const [xml, setXml] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [iframeReady, setIframeReady] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');

  // AI generation
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  // Export
  const [showExportMenu, setShowExportMenu] = useState(false);

  // Refs
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const xmlRef = useRef(xml);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  // Keep xmlRef in sync
  useEffect(() => {
    xmlRef.current = xml;
  }, [xml]);

  // ── Load diagram from backend ────────────────────────────────────────────────
  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        setLoading(true);
        const { data } = await diagramsApi.get(id);
        setName(data.name);
        setXml(data.diagramXml);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load diagram');
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  // ── Send XML to draw.io iframe ───────────────────────────────────────────────
  const sendToDrawio = useCallback(
    (action: Record<string, unknown>) => {
      if (iframeRef.current?.contentWindow) {
        iframeRef.current.contentWindow.postMessage(JSON.stringify(action), DRAWIO_ORIGIN);
      }
    },
    []
  );

  const loadXmlIntoEditor = useCallback(
    (xmlContent: string) => {
      sendToDrawio({
        action: 'load',
        xml: xmlContent,
        autosave: 1,
      });
    },
    [sendToDrawio]
  );

  // ── Save to backend (debounced) ──────────────────────────────────────────────
  const saveToBackend = useCallback(
    async (xmlToSave: string) => {
      if (!id) return;
      try {
        setSaveStatus('saving');
        await diagramsApi.update(id, { diagramXml: xmlToSave });
        setSaveStatus('saved');
      } catch {
        setSaveStatus('error');
      }
    },
    [id]
  );

  const debouncedSave = useCallback(
    (xmlToSave: string) => {
      setSaveStatus('unsaved');
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
        saveToBackend(xmlToSave);
      }, 1500);
    },
    [saveToBackend]
  );

  // ── Listen for draw.io postMessage events ────────────────────────────────────
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      // SECURITY: only accept messages from draw.io origin
      if (event.origin !== DRAWIO_ORIGIN) return;

      let msg: DrawioEvent;
      try {
        msg = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
      } catch {
        return;
      }

      switch (msg.event) {
        case 'init':
          setIframeReady(true);
          // Send the loaded XML to draw.io
          if (xmlRef.current) {
            loadXmlIntoEditor(xmlRef.current);
          }
          break;

        case 'save':
          if (msg.xml) {
            setXml(msg.xml);
            saveToBackend(msg.xml);
          }
          break;

        case 'export':
          // Handle export — download the data
          if (msg.data && msg.format) {
            downloadExport(msg.data, msg.format);
          }
          break;

        case 'exit':
          navigate('/designer');
          break;
      }
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [loadXmlIntoEditor, saveToBackend, navigate]);

  // ── When xml is loaded and iframe is ready, push to editor ───────────────────
  useEffect(() => {
    if (iframeReady && xml && !loading) {
      // Only load on initial; subsequent updates come from draw.io events
    }
  }, [iframeReady, loading]);

  // ── Handle autosave messages (draw.io sends save on change when autosave=1) ──
  useEffect(() => {
    const autoSaveHandler = (event: MessageEvent) => {
      if (event.origin !== DRAWIO_ORIGIN) return;
      try {
        const msg = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (msg.event === 'autosave' && msg.xml) {
          setXml(msg.xml);
          debouncedSave(msg.xml);
        }
      } catch {
        // ignore
      }
    };

    window.addEventListener('message', autoSaveHandler);
    return () => window.removeEventListener('message', autoSaveHandler);
  }, [debouncedSave]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, []);

  // ── Export helpers ───────────────────────────────────────────────────────────
  const requestExport = (format: string) => {
    setShowExportMenu(false);
    if (format === 'xml') {
      // Direct download of the XML
      const blob = new Blob([xmlRef.current], { type: 'application/xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${name || 'diagram'}.drawio.xml`;
      a.click();
      URL.revokeObjectURL(url);
      return;
    }

    // Ask draw.io to export in the requested format
    sendToDrawio({
      action: 'export',
      format,
      spinKey: 'export',
    });
  };

  const downloadExport = (data: string, format: string) => {
    const ext = format === 'png' ? 'png' : format === 'svg' ? 'svg' : format === 'pdf' ? 'pdf' : format;
    const mimeMap: Record<string, string> = {
      png: 'image/png',
      svg: 'image/svg+xml',
      pdf: 'application/pdf',
    };
    const mime = mimeMap[format] ?? 'application/octet-stream';

    // draw.io returns base64 data for images
    if (data.startsWith('data:')) {
      const a = document.createElement('a');
      a.href = data;
      a.download = `${name || 'diagram'}.${ext}`;
      a.click();
    } else {
      // SVG may come as raw text
      const blob = new Blob([data], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${name || 'diagram'}.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  // ── Manual save ──────────────────────────────────────────────────────────────
  const handleManualSave = () => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveToBackend(xmlRef.current);
  };

  // ── Rename ───────────────────────────────────────────────────────────────────
  const handleRename = async () => {
    if (!nameInput.trim() || !id) return;
    try {
      await diagramsApi.update(id, { name: nameInput.trim() });
      setName(nameInput.trim());
    } catch {
      // silent
    }
    setEditingName(false);
  };

  // ── AI architecture generation ───────────────────────────────────────────────
  const handleAiGenerate = async () => {
    if (!id || !aiPrompt.trim()) return;
    setAiGenerating(true);
    setAiError(null);
    try {
      const { data } = await diagramsApi.generateArchitecture(id, aiPrompt.trim());
      // Load the generated XML into draw.io
      if (data.diagramXml) {
        setXml(data.diagramXml);
        loadXmlIntoEditor(data.diagramXml);
        setSaveStatus('saved');
        setShowAiPanel(false);
        setAiPrompt('');
      }
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'AI generation failed');
    } finally {
      setAiGenerating(false);
    }
  };

  // ── Save status indicator ───────────────────────────────────────────────────
  const SaveIndicator = () => {
    const configs: Record<SaveStatus, { icon: typeof Check; text: string; cls: string }> = {
      saved: { icon: Check, text: 'Saved', cls: 'text-emerald-400' },
      saving: { icon: Loader2, text: 'Saving...', cls: 'text-blue-400' },
      unsaved: { icon: CloudOff, text: 'Unsaved changes', cls: 'text-amber-400' },
      error: { icon: AlertCircle, text: 'Save failed', cls: 'text-red-400' },
    };
    const c = configs[saveStatus];
    const Icon = c.icon;
    return (
      <div className={clsx('flex items-center gap-1.5 text-xs', c.cls)}>
        <Icon className={clsx('w-3.5 h-3.5', saveStatus === 'saving' && 'animate-spin')} />
        <span>{c.text}</span>
      </div>
    );
  };

  // ── Error state ──────────────────────────────────────────────────────────────
  if (error && !xml) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-white mb-2">Failed to load diagram</h2>
          <p className="text-sm text-gray-400 mb-4">{error}</p>
          <button className="btn-secondary" onClick={() => navigate('/designer')}>
            Back to Diagrams
          </button>
        </div>
      </div>
    );
  }

  // ── Loading state ────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
        <span className="ml-3 text-gray-400">Loading diagram...</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* ── Toolbar ───────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-4 py-2.5 bg-gray-900 border-b border-gray-800 flex-shrink-0">
        {/* Back */}
        <button
          className="p-2 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white transition-colors"
          onClick={() => navigate('/designer')}
          title="Back to diagrams"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>

        {/* Diagram name */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {editingName ? (
            <input
              className="input text-sm py-1 max-w-xs"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRename();
                if (e.key === 'Escape') setEditingName(false);
              }}
              onBlur={handleRename}
              autoFocus
            />
          ) : (
            <button
              className="flex items-center gap-2 text-sm font-medium text-white hover:text-indigo-300 transition-colors truncate"
              onClick={() => {
                setEditingName(true);
                setNameInput(name);
              }}
            >
              <span className="truncate">{name}</span>
              <Pencil className="w-3 h-3 opacity-50" />
            </button>
          )}
          <SaveIndicator />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {/* AI Generate */}
          <button
            className={clsx(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200',
              showAiPanel
                ? 'bg-purple-600/20 text-purple-300 border border-purple-600/30'
                : 'bg-gray-800 text-gray-300 hover:bg-purple-600/20 hover:text-purple-300 border border-gray-700 hover:border-purple-600/30'
            )}
            onClick={() => setShowAiPanel(!showAiPanel)}
          >
            <Sparkles className="w-3.5 h-3.5" />
            AI Generate
          </button>

          {/* Save */}
          <button
            className="btn-secondary text-xs py-1.5 flex items-center gap-1.5"
            onClick={handleManualSave}
          >
            <Save className="w-3.5 h-3.5" />
            Save
          </button>

          {/* Export dropdown */}
          <div className="relative">
            <button
              className="btn-secondary text-xs py-1.5 flex items-center gap-1.5"
              onClick={() => setShowExportMenu(!showExportMenu)}
            >
              <Download className="w-3.5 h-3.5" />
              Export
            </button>
            {showExportMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowExportMenu(false)} />
                <div className="absolute right-0 top-full mt-1 z-50 bg-gray-800 border border-gray-700 rounded-lg py-1 shadow-xl min-w-[140px]">
                  <button
                    className="w-full px-3 py-2 text-left text-xs text-gray-300 hover:bg-gray-700 flex items-center gap-2"
                    onClick={() => requestExport('xml')}
                  >
                    <FileCode className="w-3.5 h-3.5" /> Draw.io XML
                  </button>
                  <button
                    className="w-full px-3 py-2 text-left text-xs text-gray-300 hover:bg-gray-700 flex items-center gap-2"
                    onClick={() => requestExport('png')}
                  >
                    <ImageIcon className="w-3.5 h-3.5" /> PNG Image
                  </button>
                  <button
                    className="w-full px-3 py-2 text-left text-xs text-gray-300 hover:bg-gray-700 flex items-center gap-2"
                    onClick={() => requestExport('svg')}
                  >
                    <FileText className="w-3.5 h-3.5" /> SVG
                  </button>
                  <button
                    className="w-full px-3 py-2 text-left text-xs text-gray-300 hover:bg-gray-700 flex items-center gap-2"
                    onClick={() => requestExport('pdf')}
                  >
                    <FileText className="w-3.5 h-3.5" /> PDF
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── AI Panel ──────────────────────────────────────────────────────────── */}
      {showAiPanel && (
        <div className="px-4 py-3 bg-gray-900/80 border-b border-purple-800/30 flex-shrink-0">
          <div className="flex items-start gap-3 max-w-3xl">
            <Sparkles className="w-5 h-5 text-purple-400 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-purple-300 mb-2">
                Generate Architecture Diagram
              </p>
              <textarea
                className="input text-sm resize-none"
                rows={2}
                placeholder='e.g. "Create a MERN architecture with React frontend, Node.js API, PostgreSQL database, Redis cache, and an AI recommendation service"'
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
              />
              {aiError && (
                <p className="text-xs text-red-400 mt-1">{aiError}</p>
              )}
              <div className="flex items-center gap-2 mt-2">
                <button
                  className="btn-primary text-xs py-1.5 flex items-center gap-1.5"
                  onClick={handleAiGenerate}
                  disabled={aiGenerating || !aiPrompt.trim()}
                >
                  {aiGenerating ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" />
                      Generate
                    </>
                  )}
                </button>
                <button
                  className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
                  onClick={() => {
                    setShowAiPanel(false);
                    setAiError(null);
                  }}
                >
                  Cancel
                </button>
                <p className="text-xs text-gray-600 ml-2">
                  ⚠ This will replace the current diagram
                </p>
              </div>
            </div>
            <button
              className="p-1 text-gray-500 hover:text-gray-300"
              onClick={() => setShowAiPanel(false)}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ── draw.io iframe ────────────────────────────────────────────────────── */}
      <div className="flex-1 relative bg-gray-950 min-h-0">
        {!iframeReady && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-gray-950">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
            <span className="ml-3 text-gray-400">Loading draw.io editor...</span>
          </div>
        )}
        <iframe
          ref={iframeRef}
          src={DRAWIO_URL}
          className="absolute inset-0 w-full h-full border-0"
          title="Draw.io Editor"
          allow="clipboard-read; clipboard-write"
          sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-modals"
        />
      </div>
    </div>
  );
}
