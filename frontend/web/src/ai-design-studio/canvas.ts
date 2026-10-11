import { fitAfterRender } from './viewing';
import {
  defaultShapeUtils,
  defaultBindingUtils,
  createTLStore,
  createShapeId,
  createBindingId,
  getSnapshot,
  loadSnapshot,
  type Editor,
  type TLEditorSnapshot,
  type TLStore,
  type TLShapeId,
} from 'tldraw';
import {
  Graph,
  layoutDiagram,
  routeConnections,
  measureComponent,
  type DiagramGraph,
  type DiagramTabType,
  type LayoutResult,
  type DiagramComponent,
  type DiagramConnection,
} from '@multi-agent/ai-design-studio';
import {
  studioShapeUtils,
  studioBindingUtils,
  type ComponentShape,
  type ConnectorShape,
} from './shapes';
export const shapeId = (id: string) => createShapeId(id);
export const semanticId = (id: string) => id.replace(/^shape:/, '');
export const createStudioStore = () =>
  createTLStore({
    shapeUtils: [...defaultShapeUtils, ...studioShapeUtils],
    bindingUtils: [...defaultBindingUtils, ...studioBindingUtils],
  });
export interface TabSession {
  store: TLStore;
  graph: DiagramGraph;
  canvas: Record<string, unknown> | null;
  past: { graph: DiagramGraph; canvas: Record<string, unknown> }[];
  future: { graph: DiagramGraph; canvas: Record<string, unknown> }[];
  initialized: boolean;
}
export function tabSession(tab: DiagramTabType): TabSession {
  return {
    store: createStudioStore(),
    graph: tab.graph,
    canvas: tab.canvas,
    past: [],
    future: [],
    initialized: false,
  };
}
export function canvasSnapshot(editor: Editor): Record<string, unknown> {
  return getSnapshot(editor.store) as unknown as Record<string, unknown>;
}
export function restore(editor: Editor, canvas: Record<string, unknown>) {
  loadSnapshot(editor.store, canvas as unknown as TLEditorSnapshot);
}
export async function prepare(editor: Editor, session: TabSession) {
  if (session.initialized) return;
  if (session.canvas?.document) {
    const upgraded = structuredClone(session.canvas) as {
      document: {
        store: Record<
          string,
          {
            typeName: string;
            type: string;
            props: Record<string, unknown>;
            fromId?: string;
            toId?: string;
          }
        >;
      };
    };
    for (const record of Object.values(upgraded.document.store)) {
      if (record.type === 'studio-component') {
        record.props.diagramType = session.graph.diagramType;
        record.props.dividers = record.props.dividers ?? '[]';
      }
      if (record.type === 'studio-connector') {
        record.props.w = record.props.w ?? 1;
        record.props.h = record.props.h ?? 1;
        delete record.props.color;
        delete record.props.manual;
      }
      if (record.type === 'studio-wire') {
        const end = record.props.terminal === 'end' || record.props.terminal === 'target';
        record.props.terminal = end ? 'target' : 'source';
        if (record.props.anchorX === undefined) {
          const target = upgraded.document.store[record.toId!],
            from = upgraded.document.store[record.fromId!],
            route = from?.props.route ? JSON.parse(String(from.props.route)) : null,
            point = route?.points[end ? route.points.length - 1 : 0];
          const position = target as unknown as {
            x: number;
            y: number;
            props: { w: number; h: number };
          };
          record.props.anchorX =
            point && position ? (point.x - position.x) / position.props.w : 0.5;
          record.props.anchorY =
            point && position ? (point.y - position.y) / position.props.h : 0.5;
        }
      }
    }
    restore(editor, upgraded as unknown as Record<string, unknown>);
    session.initialized = true;
    return;
  }
  const cached =
    session.canvas?.engine === 'tldraw-layout'
      ? (session.canvas.layout as unknown as LayoutResult)
      : await layoutDiagram(session.graph);
  applyGraph(editor, session.graph, cached, true);
  session.initialized = true;
  await fitAfterRender(editor);
  session.canvas = canvasSnapshot(editor);
}
export function readGraph(editor: Editor, previous: DiagramGraph): DiagramGraph {
  const shapes = editor.getCurrentPageShapes();
  const components = shapes
    .filter((s) => s.type === 'studio-component')
    .map((s) => {
      const c = JSON.parse((s as ComponentShape).props.data) as DiagramComponent;
      const id = semanticId(s.id);
      return {
        ...c,
        id,
        attributes: c.attributes.map((a, i) => ({
          ...a,
          id: c.id === id ? a.id : id + '_attribute_' + i,
        })),
        methods: c.methods.map((m, i) => ({ ...m, id: c.id === id ? m.id : id + '_method_' + i })),
      };
    });
  const ids = new Set(components.map((c) => c.id));
  const connections = shapes
    .filter((s) => s.type === 'studio-connector' || (s.type === 'arrow' && s.meta.studioConnection))
    .map((s) => {
      const c =
        s.type === 'arrow'
          ? (structuredClone(s.meta.studioConnection) as DiagramConnection)
          : (JSON.parse((s as ConnectorShape).props.data) as DiagramConnection);
      const bindings =
        s.type === 'arrow'
          ? editor.getBindingsFromShape(s, 'arrow')
          : editor.getBindingsFromShape(s, 'studio-wire');
      for (const b of bindings) {
        const raw = (b.props as { terminal: string }).terminal,
          terminal = raw === 'start' ? 'source' : raw === 'end' ? 'target' : raw;
        if (terminal === 'source' || terminal === 'target') c[terminal] = semanticId(b.toId);
      }
      return { ...c, id: semanticId(s.id) };
    })
    .filter((c) => ids.has(c.source) && ids.has(c.target));
  return Graph.parse({ ...previous, components, connections });
}
export function applyGraph(
  editor: Editor,
  graph: DiagramGraph,
  layout?: LayoutResult,
  replace = false
) {
  Graph.parse(graph);
  const existing = editor.getCurrentPageShapes(),
    ids = new Set([...graph.components, ...graph.connections].map((c) => shapeId(c.id)));
  editor.run(() => {
    editor.deleteShapes(
      existing
        .filter((s) => ['studio-component', 'studio-connector'].includes(s.type) && !ids.has(s.id))
        .map((s) => s.id)
    );
    let right = Math.max(0, ...existing.map((s) => editor.getShapePageBounds(s)?.maxX ?? 0)) + 120;
    for (const c of graph.components) {
      const id = shapeId(c.id),
        old = editor.getShape<ComponentShape>(id),
        box = layout?.nodes.find((n) => n.id === c.id),
        size = measureComponent(c);
      const props = {
        w: box?.w ?? Math.max(old?.props.w ?? 0, size.w),
        h: box?.h ?? Math.max(old?.props.h ?? 0, size.h),
        data: JSON.stringify(c),
        diagramType: graph.diagramType,
        color: old?.props.color ?? '#6366f1',
        dividers: JSON.stringify(box?.dividers ?? []),
      };
      if (old)
        editor.updateShape({ id, type: old.type, ...(box ? { x: box.x, y: box.y } : {}), props });
      else {
        editor.createShape({
          id,
          type: 'studio-component',
          x: box?.x ?? right,
          y: box?.y ?? 80,
          props,
        });
        right += props.w + 100;
      }
    }
    const boxes = graph.components.map((c) => {
      const s = editor.getShape<ComponentShape>(shapeId(c.id))!,
        b = editor.getShapePageBounds(s)!;
      return { id: c.id, x: b.x, y: b.y, w: b.w, h: b.h };
    });
    const routes = layout?.edges ?? routeConnections(graph, boxes).edges;
    for (const e of graph.connections) {
      const id = shapeId(e.id),
        old = editor.getShape<ConnectorShape>(id),
        computed = routes.find((r) => r.id === e.id)!,
        route =
          old && !layout && old.props.data === JSON.stringify(e)
            ? (JSON.parse(old.props.route) as typeof computed)
            : computed;
      if (!route) throw new Error('Missing connector route');
      if (old)
        editor.updateShape({
          id,
          type: old.type,
          x: 0,
          y: 0,
          rotation: 0,
          props: { data: JSON.stringify(e), route: JSON.stringify(route) },
        });
      else
        editor.createShape({
          id,
          type: 'studio-connector',
          x: 0,
          y: 0,
          props: { data: JSON.stringify(e), route: JSON.stringify(route), w: 1, h: 1 },
        });
      editor.deleteBindings(editor.getBindingsFromShape(id, 'studio-wire').map((b) => b.id));
      for (const terminal of ['source', 'target'] as const) {
        const box = boxes.find((n) => n.id === e[terminal])!,
          p = terminal === 'source' ? route.points[0] : route.points[route.points.length - 1];
        editor.createBinding({
          id: createBindingId(),
          type: 'studio-wire',
          fromId: id,
          toId: shapeId(e[terminal]),
          props: { terminal, anchorX: (p.x - box.x) / box.w, anchorY: (p.y - box.y) / box.h },
        });
      }
    }
    if (replace)
      editor.sendToBack(
        graph.components
          .filter((c) => graph.components.some((n) => n.parentId === c.id) || c.kind === 'fragment')
          .map((c) => shapeId(c.id))
      );
  });
}
export async function autoLayout(editor: Editor, graph: DiagramGraph) {
  const dimensions = Object.fromEntries(
    graph.components.map((c) => {
      const s = editor.getShape<ComponentShape>(shapeId(c.id));
      return [c.id, s ? { w: s.props.w, h: s.props.h } : measureComponent(c)];
    })
  );
  applyGraph(editor, graph, await layoutDiagram(graph, dimensions), true);
  await fitAfterRender(editor);
}
export const selectedSemantic = (editor: Editor) => editor.getSelectedShapeIds().map(semanticId);
export const allShapeIds = (editor: Editor): TLShapeId[] =>
  editor.getCurrentPageShapes().map((s) => s.id);
