import { StudioViewport, setArrangeHandler } from './viewing';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Tldraw,
  getSnapshot,
  DefaultToolbar,
  DefaultStylePanel,
  SelectToolbarItem,
  HandToolbarItem,
  RectangleToolbarItem,
  EllipseToolbarItem,
  ArrowToolbarItem,
  LineToolbarItem,
  TextToolbarItem,
  DrawToolbarItem,
  EraserToolbarItem,
  NoteToolbarItem,
  AssetToolbarItem,
  TriangleToolbarItem,
  DiamondToolbarItem,
  type Editor,
} from 'tldraw';
import {
  Graph,
  Workspace,
  activeDiagram,
  generationTypes,
  diagramLabels,
  kindsByType,
  relationsByType,
  newComponent,
  newConnection,
  applyOperations,
  umlExport,
  type DiagramGraph,
  type StudioWorkspace,
  type GeneratedDiagramType,
} from '@multi-agent/ai-design-studio';
import { studioApi, StudioApiError, download, type StudioDocument, type Preview } from './api';
import { Properties } from './Properties';
import { studioShapeUtils, studioBindingUtils } from './shapes';
import {
  tabSession,
  prepare,
  canvasSnapshot,
  restore,
  readGraph,
  applyGraph,
  autoLayout,
  selectedSemantic,
  type TabSession,
} from './canvas';
import { exportDiagram, exportAllPdf } from './ExportAll';
import 'tldraw/tldraw.css';
import './studio.css';

type Progress = {
  jobId: string;
  status: string;
  error: string;
  states: Record<GeneratedDiagramType, { status: string; attempt: number; error?: string }>;
  workspace: StudioWorkspace | null;
  document: StudioDocument | null;
};
type ListItem = Pick<StudioDocument, 'designId' | 'title' | 'revision'>;
function StudioToolbar() {
  return (
    <DefaultToolbar minItems={8} minSizePx={455} maxItems={14} maxSizePx={800}>
      <SelectToolbarItem />
      <HandToolbarItem />
      <RectangleToolbarItem />
      <EllipseToolbarItem />
      <ArrowToolbarItem />
      <LineToolbarItem />
      <TextToolbarItem />
      <DrawToolbarItem />
      <EraserToolbarItem />
      <NoteToolbarItem />
      <AssetToolbarItem />
      <TriangleToolbarItem />
      <DiamondToolbarItem />
    </DefaultToolbar>
  );
}
const studioUi = { Toolbar: StudioToolbar, StylePanel: DefaultStylePanel, InFrontOfTheCanvas: StudioViewport };
export default function Studio() {
  return <WorkspaceEditor />;
}
function WorkspaceEditor() {
  const [authenticated, setAuthenticated] = useState(false),
    [credentials, setCredentials] = useState({ username: '', password: '' }),
    [model, setModel] = useState('');
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [doc, setDoc] = useState<StudioDocument | null>(null),
    [list, setList] = useState<ListItem[]>([]);
  const [prompt, setPrompt] = useState(''),
    [instruction, setInstruction] = useState(''),
    [selection, setSelection] = useState<string[]>([]),
    [panel, setPanel] = useState('assistant'),
    [sideOpen, setSideOpen] = useState(true),
    [focus, setFocus] = useState(false),
    [status, setStatus] = useState('Saved'),
    [format, setFormat] = useState<'svg' | 'png' | 'pdf' | 'json' | 'mermaid' | 'plantuml'>('svg'),
    [kind, setKind] = useState('');
  const [jobId, setJobId] = useState(sessionStorage.getItem('studio-generation-job') ?? ''),
    [progress, setProgress] = useState<Progress | null>(null),
    [preview, setPreview] = useState<Preview | null>(null),
    [versions, setVersions] = useState<{ revision: number; savedAt: string }[]>([]),
    [historyOpen, setHistoryOpen] = useState(false);
  const docRef = useRef(doc),
    sessions = useRef<Record<string, TabSession>>({}),
    editor = useRef<Editor | null>(null),
    mutating = useRef(false),
    lastHistory = useRef(0),
    unlisten = useRef<(() => void) | null>(null),
    dirty = useRef(0),
    saved = useRef(0),
    saving = useRef(false),
    conflict = useRef(false),
    userTab = useRef(false),
    progressRef = useRef(progress);
  docRef.current = doc;
  progressRef.current = progress;
  const generating = !!jobId && progress?.status !== 'ready' && progress?.status !== 'failed';
  const currentTab = doc ? activeDiagram(doc.workspace) : null;
  const session = currentTab ? sessions.current[currentTab.id] : null;
  const report = useCallback((message: string) => setError(message), []);
  const handleError = (e: unknown) => {
    report(e instanceof Error ? e.message : 'Studio request failed');
    if (e instanceof StudioApiError && e.status === 401) setAuthenticated(false);
  };
  const publish = (next: StudioDocument) => {
    docRef.current = next;
    setDoc(next);
  };
  const capture = useCallback(() => {
    const current = docRef.current;
    if (!current) return null;
    const workspace = Workspace.parse({
      ...current.workspace,
      diagrams: current.workspace.diagrams.map((tab) => {
        const s = sessions.current[tab.id];
        return s
          ? {
              ...tab,
              graph: s.graph,
              canvas: s.initialized
                ? (getSnapshot(s.store) as unknown as Record<string, unknown>)
                : s.canvas,
              manuallyEdited: tab.manuallyEdited || s.past.length > 0,
            }
          : tab;
      }),
    });
    const active = activeDiagram(workspace);
    return { ...current, workspace, graph: active.graph, canvas: active.canvas };
  }, []);
  const refresh = useCallback(async () => setList(await studioApi<ListItem[]>('/designs')), []);
  useEffect(() => {
    studioApi<{ model: string }>('/session')
      .then((data) => {
        setAuthenticated(true);
        setModel(data.model);
        return refresh();
      })
      .catch(() => {});
  }, [refresh]);
  const loadDocument = (next: StudioDocument) => {
    sessions.current = {};
    for (const tab of next.workspace.diagrams) sessions.current[tab.id] = tabSession(tab);
    conflict.current = false;
    dirty.current = saved.current = 0;
    publish(next);
    setPrompt(next.workspace.prompt || next.workspace.system.name);
    setSelection([]);
    setPreview(null);
    setStatus('Saved');
  };
  const save = useCallback(async () => {
    const current = capture();
    if (!current || saving.current || dirty.current === saved.current || conflict.current) return;
    if (progressRef.current && !['ready', 'failed'].includes(progressRef.current.status)) return;
    if (progressRef.current?.status === 'failed' && !progressRef.current.document) return;
    saving.current = true;
    const sequence = dirty.current;
    setStatus('Saving...');
    try {
      const result = await studioApi<{ revision: number }>(
        `/designs/${current.designId}`,
        {
          title: current.title,
          graph: current.graph,
          canvas: current.canvas,
          workspace: current.workspace,
          chat: current.chat,
          revision: current.revision,
        },
        'PUT'
      );
      if (docRef.current?.designId === current.designId) {
        const latest = capture()!;
        publish({ ...latest, revision: result.revision });
        saved.current = sequence;
        setStatus(dirty.current === sequence ? 'Saved' : 'Unsaved');
      }
    } catch (e) {
      if (e instanceof StudioApiError && e.status === 409) conflict.current = true;
      setStatus('Save failed');
      throw e;
    } finally {
      saving.current = false;
    }
  }, [capture]);
  useEffect(() => {
    const timer = setInterval(() => {
      if (!busy && !preview) save().catch(handleError);
    }, 1800);
    return () => clearInterval(timer);
  }, [save, busy, preview]);
  useEffect(() => {
    const protect = (e: BeforeUnloadEvent) => {
      if (dirty.current !== saved.current) e.preventDefault();
    };
    window.addEventListener('beforeunload', protect);
    return () => window.removeEventListener('beforeunload', protect);
  }, []);
  useEffect(() => {
    if (!authenticated || !jobId) return;
    let canceled = false,
      working = false;
    const poll = async () => {
      if (working) return;
      working = true;
      try {
        const result = await studioApi<Progress>(`/generation/${jobId}`);
        if (canceled) return;
        setProgress(result);
        progressRef.current = result;
        if (result.workspace) {
          const old = docRef.current;
          for (const tab of result.workspace.diagrams)
            if (!sessions.current[tab.id]) sessions.current[tab.id] = tabSession(tab);
          const workspace = {
            ...result.workspace,
            activeDiagramId:
              userTab.current &&
              old &&
              result.workspace.diagrams.some((t) => t.id === old.workspace.activeDiagramId)
                ? old.workspace.activeDiagramId
                : result.workspace.activeDiagramId,
          };
          const base = result.document ?? {
            designId: jobId,
            title: result.workspace.system.name.slice(0, 160),
            revision: 0,
            graph: activeDiagram(workspace).graph,
            canvas: activeDiagram(workspace).canvas,
            chat: [],
          };
          publish({ ...base, workspace });
        }
        if (result.status === 'ready') {
          sessionStorage.removeItem('studio-generation-job');
          setJobId('');
          setStatus(dirty.current ? 'Unsaved' : 'Saved');
          await refresh();
        } else if (result.status === 'failed')
          report(result.error || 'Generation failed; completed diagrams have been retained.');
      } catch (e) {
        if (!canceled) handleError(e);
      } finally {
        working = false;
      }
    };
    void poll();
    const timer = setInterval(() => {
      void poll();
    }, 1200);
    return () => {
      canceled = true;
      clearInterval(timer);
    };
  }, [authenticated, jobId, refresh]);
  const commit = () => {
    const e = editor.current,
      current = docRef.current;
    if (!e || !current) return;
    const id = current.workspace.activeDiagramId,
      s = sessions.current[id];
    if (!s) return;
    s.graph = readGraph(e, s.graph);
    s.canvas = canvasSnapshot(e);
    dirty.current++;
    publish(capture()!);
    setStatus('Unsaved');
  };
  const mark = () => {
    const current = docRef.current;
    if (current && editor.current) {
      const s = sessions.current[current.workspace.activeDiagramId];
      s.past.push({ graph: structuredClone(s.graph), canvas: canvasSnapshot(editor.current) });
      s.past = s.past.slice(-50);
      s.future = [];
      lastHistory.current = Date.now();
    }
  };
  const history = (direction: 'past' | 'future') => {
    const e = editor.current,
      current = docRef.current;
    if (!e || !current) return;
    const s = sessions.current[current.workspace.activeDiagramId],
      item = s[direction].pop();
    if (!item) return;
    s[direction === 'past' ? 'future' : 'past'].push({ graph: s.graph, canvas: canvasSnapshot(e) });
    mutating.current = true;
    try {
      restore(e, item.canvas);
      s.graph = item.graph;
      s.canvas = item.canvas;
      dirty.current++;
      publish(capture()!);
    } finally {
      mutating.current = false;
    }
    setStatus('Unsaved');
  };
  const safely = (fn: () => void) => {
    try {
      fn();
      setError('');
    } catch (e) {
      handleError(e);
    }
  };
  const editGraph = (graph: DiagramGraph) => {
    if (!editor.current || !session) return;
    safely(() => {
      Graph.parse(graph);
      mark();
      mutating.current = true;
      try {
        applyGraph(editor.current!, graph);
        session.graph = graph;
        commit();
        setPreview(null);
      } finally {
        mutating.current = false;
      }
    });
  };
  const arranging = useRef(false);
  const arrange = async () => {
    if (!editor.current || !session || arranging.current) return;
    arranging.current = true;
    mark();
    mutating.current = true;
    try { await autoLayout(editor.current, session.graph); commit(); }
    catch (e) { handleError(e); }
    finally { mutating.current = false; arranging.current = false; }
  };
  useEffect(() => { if (editor.current) setArrangeHandler(editor.current, arrange); });
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setFocus(false); };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, []);
  const mount = async (e: Editor, id: string) => {
    unlisten.current?.();
    editor.current = e;
    setArrangeHandler(e, arrange);
    const s = sessions.current[id];
    mutating.current = true;
    try {
      await prepare(e, s);
      if (import.meta.env.DEV && new URLSearchParams(location.search).has('studio-test'))
        (window as unknown as { studioTestEditor: Editor }).studioTestEditor = e;
    } catch (error) {
      handleError(error);
    } finally {
      mutating.current = false;
    }
    unlisten.current = e.store.listen(
      () => {
        if (mutating.current || docRef.current?.workspace.activeDiagramId !== id) return;
        try {
          const graph = readGraph(e, s.graph);
          if (Date.now() - lastHistory.current > 400) {
            s.past.push({ graph: structuredClone(s.graph), canvas: s.canvas ?? canvasSnapshot(e) });
            s.past = s.past.slice(-50);
            s.future = [];
          }
          lastHistory.current = Date.now();
          s.graph = graph;
          s.canvas = canvasSnapshot(e);
          dirty.current++;
          setStatus('Unsaved');
          publish(capture()!);
        } catch (error) {
          handleError(error);
        }
      },
      { source: 'user', scope: 'document' }
    );
    const stop = e.store.listen(() => setSelection(selectedSemantic(e)), { scope: 'session' });
    const first = unlisten.current;
    unlisten.current = () => {
      first?.();
      stop();
    };
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        (e.ctrlKey || e.metaKey) &&
        e.key.toLowerCase() === 'z' &&
        !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)
      ) {
        e.preventDefault();
        e.stopImmediatePropagation();
        history(e.shiftKey ? 'future' : 'past');
      }
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  });
  const navigate = (id: string) => {
    const current = capture();
    if (!current) return;
    unlisten.current?.();
    editor.current = null;
    userTab.current = true;
    publish({ ...current, workspace: { ...current.workspace, activeDiagramId: id } });
    setSelection([]);
    setPreview(null);
  };
  const generate = async () => {
    if (!prompt.trim() || generating) return;
    setBusy(true);
    setError('');
    try {
      await save();
      if (conflict.current)
        throw new Error('Resolve the save conflict before generating another project');
      const result = await studioApi<{ jobId: string }>('/generate-all', { prompt });
      sessions.current = {};
      docRef.current = null;
      setDoc(null);
      dirty.current = saved.current = 0;
      setProgress(null);
      progressRef.current = null;
      userTab.current = false;
      setJobId(result.jobId);
      sessionStorage.setItem('studio-generation-job', result.jobId);
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  };
  const connect = () => {
    if (!session || selection.length !== 2) {
      report('Select two structured elements to connect');
      return;
    }
    const kind = relationsByType[session.graph.diagramType][0],
      edge = newConnection(crypto.randomUUID(), selection[0], selection[1], kind);
    if (session.graph.diagramType === 'sequence')
      edge.order = Math.max(0, ...session.graph.connections.map((e) => e.order)) + 1;
    editGraph({ ...session.graph, connections: [...session.graph.connections, edge] });
  };
  const removeSelected = () => {
    if (!editor.current) return;
    mark();
    editor.current.deleteShapes(editor.current.getSelectedShapeIds());
  };
  const ask = async (mode: 'edit' | 'explain') => {
    if (!session || !doc || !instruction.trim()) return;
    setBusy(true);
    setError('');
    try {
      await save();
      const current = docRef.current!;
      if (mode === 'explain') {
        const response = await studioApi<{ explanation: string }>('/explain', {
          graph: session.graph,
          question: instruction,
        });
        publish({
          ...current,
          chat: [
            ...current.chat,
            { role: 'user' as const, content: instruction.slice(0, 4000) },
            { role: 'assistant' as const, content: response.explanation.slice(0, 4000) },
          ].slice(-100),
        });
        dirty.current++;
      } else {
        const plan = await studioApi<Preview['plan']>('/edit', {
          graph: session.graph,
          selectedIds: selection.filter(
            (id) =>
              session.graph.components.some((c) => c.id === id) ||
              session.graph.connections.some((e) => e.id === id)
          ),
          instruction,
          revision: current.revision,
        });
        setPreview({
          plan,
          fingerprint: JSON.stringify({ graph: session?.graph, canvas: session?.canvas }),
        });
      }
      setInstruction('');
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  };
  const applyPreview = () => {
    if (!session || !doc || !preview) return;
    if (
      JSON.stringify({ graph: session?.graph, canvas: session?.canvas }) !== preview.fingerprint ||
      doc.revision !== preview.plan.revision
    ) {
      report('The diagram changed since the proposed edit. Ask again to preserve your edits.');
      return;
    }
    editGraph(applyOperations(session.graph, preview.plan.operations));
  };
  const regenerate = async () => {
    if (!session || !doc) return;
    if (
      (currentTab?.manuallyEdited || session.past.length) &&
      !window.confirm(
        'Regenerate this diagram and replace its manual edits? The other six diagrams remain unchanged.'
      )
    )
      return;
    setBusy(true);
    setError('');
    try {
      const before = JSON.stringify({ graph: session?.graph, canvas: session?.canvas }),
        id = currentTab!.id;
      const result = await studioApi<{ graph: DiagramGraph }>('/generate', {
        prompt: doc.workspace.prompt || prompt || doc.workspace.system.name,
        diagramType: session.graph.diagramType,
        constraints: JSON.stringify(doc.workspace.system),
      });
      if (
        JSON.stringify({
          graph: sessions.current[id]?.graph,
          canvas: sessions.current[id]?.canvas,
        }) !== before
      )
        throw new Error('Diagram changed during regeneration; retry to preserve edits');
      mark();
      mutating.current = true;
      try {
        await autoLayout(editor.current!, result.graph);
        session.graph = result.graph;
        commit();
      } finally {
        mutating.current = false;
      }
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  };
  const exportCurrent = async (all = false) => {
    const current = capture();
    if (!current) return;
    setBusy(true);
    try {
      if (all) await exportAllPdf(current.workspace, current.title, editor.current!);
      else if (format === 'json')
        download(
          `${current.title.replace(/[^a-z0-9_-]/gi, '_')}.json`,
          new Blob([JSON.stringify({ schemaVersion: 2, ...current }, null, 2)], {
            type: 'application/json',
          })
        );
      else if (format === 'mermaid' || format === 'plantuml') {
        const result = umlExport(activeDiagram(current.workspace).graph, format);
        download(`diagram.${format === 'mermaid' ? 'mmd' : 'puml'}`, new Blob([result.text]));
        if (result.warnings.length) report(result.warnings.join(' '));
      } else await exportDiagram(editor.current!, activeDiagram(current.workspace).title, format);
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  };
  const selectedComponent = session?.graph.components.find((c) => selection.includes(c.id)),
    selectedConnection = session?.graph.connections.find((e) => selection.includes(e.id));
  if (!authenticated)
    return (
      <div className="ads-login">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              const result = await studioApi<{ token: string }>('/session', credentials);
              sessionStorage.setItem('ai-design-studio-session', result.token);
              const info = await studioApi<{ model: string }>('/session');
              setModel(info.model);
              setAuthenticated(true);
              setError('');
              await refresh();
            } catch (e) {
              handleError(e);
            } finally {
              setBusy(false);
            }
          }}
        >
          <span className="ads-eyebrow">AI DESIGN STUDIO</span>
          <h1>Seven views. One system.</h1>
          <label>
            Username
            <input
              autoComplete="username"
              value={credentials.username}
              onChange={(e) => setCredentials({ ...credentials, username: e.target.value })}
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              autoComplete="current-password"
              value={credentials.password}
              onChange={(e) => setCredentials({ ...credentials, password: e.target.value })}
              required
            />
          </label>
          <button className="ads-primary" disabled={busy}>
            Sign in
          </button>
          {error && <p role="alert">{error}</p>}
        </form>
      </div>
    );
  return (
    <div className={`ads-studio${focus ? ' ads-fullscreen' : ''}`}>
      <header className="ads-header">
        <Link to="/dashboard">Exit studio</Link>
        <div>
          <span className="ads-eyebrow">AI DESIGN STUDIO | {model}</span>
          {doc ? (
            <input
              aria-label="Design title"
              value={doc.title}
              onChange={(e) => {
                publish({ ...doc, title: e.target.value.slice(0, 160) });
                dirty.current++;
                setStatus('Unsaved');
              }}
            />
          ) : (
            <h2>Seven views. One system.</h2>
          )}
        </div>
        <span className="ads-save-status">
          {status}
          {doc && ` | r${doc.revision}`}
        </span>
        <select
          aria-label="Open design"
          value={doc?.designId ?? ''}
          disabled={generating}
          onChange={async (e) => {
            const designId = e.currentTarget.value;
            if (!designId) return;
            try {
              await save();
              if (conflict.current) throw new Error('Resolve your save conflict first');
              const next = await studioApi<StudioDocument>(`/designs/${designId}`);
              setProgress(null);
              progressRef.current = null;
              loadDocument(next);
            } catch (e) {
              handleError(e);
            }
          }}
        >
          <option value="">Open project...</option>
          {list.map((d) => (
            <option key={d.designId} value={d.designId}>
              {d.title}
            </option>
          ))}
        </select>
        <button
          disabled={!doc || generating}
          onClick={() => save().then(refresh).catch(handleError)}
        >
          Save
        </button>
        <button
          disabled={generating}
          onClick={async () => {
            try {
              await save();
              if (conflict.current) throw new Error('Resolve the save conflict first');
              loadDocument(
                await studioApi<StudioDocument>('/designs', {
                  title: 'Untitled whiteboard',
                  diagramType: 'hld',
                })
              );
              setProgress(null);
              progressRef.current = null;
              await refresh();
            } catch (e) {
              handleError(e);
            }
          }}
        >
          Blank whiteboard
        </button>
        <button
          disabled={!doc || generating}
          onClick={async () => {
            try {
              const current = capture()!;
              loadDocument(
                await studioApi<StudioDocument>('/designs', {
                  title: current.title.slice(0, 150) + ' copy',
                  payload: {
                    title: current.title.slice(0, 150) + ' copy',
                    graph: current.graph,
                    canvas: current.canvas,
                    workspace: current.workspace,
                    chat: current.chat,
                  },
                })
              );
              await refresh();
            } catch (e) {
              handleError(e);
            }
          }}
        >
          Duplicate
        </button>
        <button onClick={() => setFocus(!focus)}>{focus ? 'Exit fullscreen' : 'Fullscreen'}</button>
        <button onClick={() => setSideOpen(!sideOpen)}>AI panel</button>
        <button
          disabled={generating}
          onClick={() => {
            sessionStorage.removeItem('ai-design-studio-session');
            setAuthenticated(false);
            setDoc(null);
            sessions.current = {};
          }}
        >
          Sign out
        </button>
      </header>
      {error && (
        <div role="alert" className="ads-error">
          {error}
          <button aria-label="Dismiss error" onClick={() => setError('')}>
            x
          </button>
          {conflict.current && doc && (
            <>
              <button
                onClick={async () => {
                  try {
                    const current = capture()!;
                    const next = await studioApi<StudioDocument>('/designs', {
                      title: `${current.title} copy`,
                      payload: {
                        title: current.title,
                        graph: current.graph,
                        canvas: current.canvas,
                        workspace: current.workspace,
                        chat: current.chat,
                      },
                    });
                    loadDocument(next);
                    setError('');
                    await refresh();
                  } catch (e) {
                    handleError(e);
                  }
                }}
              >
                Duplicate local draft
              </button>
              <button
                onClick={async () => {
                  try {
                    loadDocument(await studioApi<StudioDocument>(`/designs/${doc.designId}`));
                    setError('');
                  } catch (e) {
                    handleError(e);
                  }
                }}
              >
                Reload server version
              </button>
            </>
          )}
        </div>
      )}
      <div className="ads-topbar">
        <strong>{currentTab?.title}</strong>
        <button disabled={!session} title="Undo (Ctrl+Z)" onClick={() => history('past')}>
          Undo
        </button>
        <button disabled={!session} title="Redo (Ctrl+Shift+Z)" onClick={() => history('future')}>
          Redo
        </button>
        <select
          aria-label="Export format"
          value={format}
          onChange={(e) => setFormat(e.target.value as typeof format)}
        >
          {['svg', 'png', 'pdf', 'json', 'mermaid', 'plantuml'].map((f) => (
            <option key={f}>{f}</option>
          ))}
        </select>
        <button disabled={!session || busy} onClick={() => exportCurrent()}>
          Export
        </button>
        <button disabled={!doc || generating || busy} onClick={() => exportCurrent(true)}>
          Export all PDF
        </button>
        <button disabled={!session || generating || busy} onClick={regenerate}>
          Regenerate selected
        </button>
        <button
          disabled={!doc || generating}
          onClick={async () => {
            try {
              await save();
              setVersions(await studioApi(`/designs/${doc!.designId}/versions`));
              setHistoryOpen(!historyOpen);
            } catch (e) {
              handleError(e);
            }
          }}
        >
          History
        </button>
      </div>
      {(doc || jobId) && (
        <nav className="ads-diagram-tabs" aria-label="Diagram tabs">
          {generationTypes.map((type) => {
            const tab = doc?.workspace.diagrams.find((t) => t.graph.diagramType === type),
              state = progress?.states?.[type];
            return (
              <button
                key={type}
                disabled={!tab}
                className={tab?.id === doc?.workspace.activeDiagramId ? 'active' : ''}
                onClick={() => tab && navigate(tab.id)}
              >
                {diagramLabels[type]}
                {generating && <small>{state?.status ?? 'waiting'}</small>}
              </button>
            );
          })}
          {doc?.workspace.diagrams
            .filter((t) => !generationTypes.some((type) => type === t.graph.diagramType))
            .map((t) => (
              <button key={t.id} onClick={() => navigate(t.id)}>
                {t.title} (legacy)
              </button>
            ))}
        </nav>
      )}
      {jobId && (
        <div className="ads-generation" role="status">
          <strong>
            {progress?.status === 'ready'
              ? 'Seven diagrams saved'
              : progress?.status === 'failed'
                ? 'Generation incomplete'
                : progress?.status === 'analyzing' || !progress
                  ? 'Analyzing your system'
                  : `Generating diagrams | ${Object.values(progress.states).filter((s) => s.status === 'ready').length}/7 ready`}
          </strong>
          {progress?.status === 'failed' && (
            <button
              onClick={async () => {
                try {
                  await studioApi(`/generation/${jobId}/retry`, {});
                  setError('');
                  setProgress({ ...progress, status: 'generating' });
                } catch (e) {
                  handleError(e);
                }
              }}
            >
              Retry incomplete diagrams
            </button>
          )}
          {generationTypes.map((type) => (
            <span key={type} title={progress?.states?.[type]?.error}>
              {diagramLabels[type]}: {progress?.states?.[type]?.status ?? 'waiting'}
            </span>
          ))}
        </div>
      )}
      <div className="ads-workspace">
        {session && !focus && (
          <aside className="ads-tools">
            <h3>ELEMENTS</h3>
            <select
              aria-label="Element kind"
              value={
                kindsByType[session.graph.diagramType].includes(kind as never)
                  ? kind
                  : kindsByType[session.graph.diagramType][0]
              }
              onChange={(e) => setKind(e.target.value)}
            >
              {kindsByType[session.graph.diagramType].map((k) => (
                <option key={k} value={k}>
                  {k.replaceAll('_', ' ')}
                </option>
              ))}
            </select>
            <button
              onClick={() => {
                const k = (
                  kindsByType[session.graph.diagramType].includes(kind as never)
                    ? kind
                    : kindsByType[session.graph.diagramType][0]
                ) as DiagramGraph['components'][number]['kind'];
                const c = newComponent(crypto.randomUUID(), k, k.replaceAll('_', ' '));
                if (k === 'activation') {
                  const p = session.graph.components.find(
                    (c) => selection.includes(c.id) && ['actor', 'participant'].includes(c.kind)
                  );
                  if (!p) {
                    report('Select a participant for the activation');
                    return;
                  }
                  c.parentId = p.id;
                }
                if (['activation', 'fragment'].includes(k)) {
                  c.startOrder = 1;
                  c.endOrder = Math.max(1, ...session.graph.connections.map((e) => e.order));
                }
                editGraph({ ...session.graph, components: [...session.graph.components, c] });
              }}
            >
              Add element
            </button>
            <button
              onClick={() => {
                if (selection.length !== 2) {
                  report('Shift-select two elements to connect');
                  return;
                }
                connect();
              }}
            >
              Connect selected
            </button>
            <button onClick={removeSelected}>Delete selected</button>
            <button
              onClick={() => {
                mark();
                editor.current?.createShape({ type: 'note', x: 100, y: 100 });
              }}
            >
              Add note
            </button>
            <small>
              Drag connection handles to create or reconnect edges. Double-click an element for
              properties. Ctrl+Z / Ctrl+Shift+Z restores this tab's history.
            </small>
          </aside>
        )}
        <div className="ads-canvas" data-testid="studio-canvas">
          {session ? (
            <Tldraw
              components={studioUi}
              key={`${doc!.designId}_${currentTab!.id}`}
              store={session.store}
              shapeUtils={studioShapeUtils}
              bindingUtils={studioBindingUtils}
              licenseKey={import.meta.env.VITE_TLDRAW_LICENSE_KEY}
              onMount={(e) => {
                void mount(e, currentTab!.id);
              }}
            />
          ) : (
            <div className="ads-empty">
              <h1>{generating ? 'Building seven diagrams?' : 'Design your complete system'}</h1>
              <p>
                Describe the system once. All seven editable views are generated and saved
                automatically.
              </p>
              {!sideOpen && <button onClick={() => setSideOpen(true)}>Open generator</button>}
            </div>
          )}
        </div>
        {sideOpen && !focus && (
          <aside className="ads-sidebar">
            <nav className="ads-tabs">
              {['assistant', 'properties', 'explanation'].map((t) => (
                <button key={t} className={panel === t ? 'active' : ''} onClick={() => setPanel(t)}>
                  {t}
                </button>
              ))}
            </nav>
            {panel === 'properties' && session ? (
              <>
                <Properties
                  component={selectedComponent}
                  connection={selectedConnection}
                  components={session.graph.components}
                  connections={session.graph.connections}
                  diagramType={session.graph.diagramType}
                  report={report}
                  updateComponent={(c) => {
                    const old = session.graph.components.find((v) => v.id === c.id);
                    if (old?.entityId && c.name !== old.name) c.entityId = null;
                    editGraph({
                      ...session.graph,
                      components: session.graph.components.map((v) => (v.id === c.id ? c : v)),
                    });
                  }}
                  updateConnection={(c) => {
                    const old = session.graph.connections.find((v) => v.id === c.id)!;
                    const edges = session.graph.connections.map((v) =>
                      v.id === c.id
                        ? c
                        : session.graph.diagramType === 'sequence' &&
                            v.order === c.order &&
                            old.order !== c.order
                          ? { ...v, order: old.order }
                          : v
                    );
                    editGraph({ ...session.graph, connections: edges });
                  }}
                />
              </>
            ) : panel === 'explanation' && doc ? (
              <div className="ads-explanation">
                <h3>Shared specification</h3>
                <p>{doc.workspace.system.name}</p>
                {doc.workspace.system.requirements.map((r, i) => (
                  <p key={i}>{r}</p>
                ))}
                {session &&
                  Object.entries(session.graph.explanation).map(
                    ([key, values]) =>
                      values.length > 0 && (
                        <section key={key}>
                          <h3>{key}</h3>
                          <ul>
                            {values.map((v, i) => (
                              <li key={i}>{v}</li>
                            ))}
                          </ul>
                        </section>
                      )
                  )}
              </div>
            ) : (
              <>
                <form
                  className="ads-composer"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void generate();
                  }}
                >
                  <h3>Generate all seven diagrams</h3>
                  <label>
                    System description
                    <textarea
                      aria-label="System description"
                      placeholder="E-commerce with authentication, products, orders, payments, inventory and notifications..."
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      required
                    />
                  </label>
                  <button className="ads-primary" disabled={busy || generating || !prompt.trim()}>
                    {generating ? 'Generating...' : 'Generate'}
                  </button>
                  <small>
                    One shared specification. Seven diagrams. Automatic validation, layout and save.
                  </small>
                </form>
                {doc && (
                  <div className="ads-chat">
                    {doc.chat.map((m, i) => (
                      <div className={`ads-message ${m.role}`} key={i}>
                        {m.content}
                      </div>
                    ))}
                    {preview && (
                      <div className="ads-preview">
                        <h3>Review incremental edits</h3>
                        <p>{preview.plan.summary}</p>
                        <pre>{JSON.stringify(preview.plan.operations, null, 2)}</pre>
                        <button onClick={applyPreview}>Apply changes</button>
                        <button onClick={() => setPreview(null)}>Discard</button>
                      </div>
                    )}
                  </div>
                )}
                {session && (
                  <div className="ads-composer">
                    <textarea
                      aria-label="AI instruction"
                      value={instruction}
                      onChange={(e) => setInstruction(e.target.value)}
                      placeholder="Describe an incremental edit or ask a question"
                    />
                    <button disabled={busy || !instruction.trim()} onClick={() => ask('edit')}>
                      Propose edit
                    </button>
                    <button disabled={busy || !instruction.trim()} onClick={() => ask('explain')}>
                      Explain
                    </button>
                  </div>
                )}
              </>
            )}
          </aside>
        )}
        {historyOpen && doc && !focus && (
          <aside className="ads-history">
            <h3>
              Version history<button onClick={() => setHistoryOpen(false)}>x</button>
            </h3>
            {versions
              .slice()
              .reverse()
              .map((v) => (
                <button
                  key={v.revision}
                  onClick={async () => {
                    try {
                      await save();
                      const next = await studioApi<StudioDocument>(
                        `/designs/${doc.designId}/restore`,
                        { revision: docRef.current!.revision, version: v.revision }
                      );
                      loadDocument(next);
                      setHistoryOpen(false);
                    } catch (e) {
                      handleError(e);
                    }
                  }}
                >
                  Restore r{v.revision}
                  <small>{new Date(v.savedAt).toLocaleString()}</small>
                </button>
              ))}
          </aside>
        )}
      </div>
    </div>
  );
}
