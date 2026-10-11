import { useEffect, useRef, useState } from 'react';
import { atom, Box, useEditor, useValue, TldrawUiInFrontOfTheCanvas, type Editor } from 'tldraw';

export type DetailLevel = 'overview' | 'medium' | 'detail';
const arrangeHandlers = new WeakMap<Editor, () => Promise<void>>();
export const setArrangeHandler = (editor: Editor, handler: () => Promise<void>) => arrangeHandlers.set(editor, handler);
const states = new WeakMap<Editor, ReturnType<typeof createViewState>>();
const createViewState = () => atom('studio viewing', { overview: false, focus: [] as string[] });
export function viewState(editor: Editor) {
  let state = states.get(editor);
  if (!state) { state = createViewState(); states.set(editor, state); }
  return state;
}
export function useDiagramView(id: string) {
  const editor = useEditor();
  const key = useValue('diagram detail level', () => {
    const state = viewState(editor).get();
    const zoom = editor.getZoomLevel();
    const level = state.overview || zoom < .45 ? 'overview' : zoom < .8 ? 'medium' : 'detail';
    return level + (state.focus.length > 0 && !state.focus.includes(id) ? ':dim' : ':normal');
  }, [editor, id]);
  return { level: key.split(':')[0] as DetailLevel, dim: key.endsWith(':dim') };
}
export function diagramBounds(editor: Editor) {
  const bounds = editor.getCurrentPageShapes().filter(s => !editor.isShapeHidden(s))
    .map(s => editor.getShapePageBounds(s)).filter((b): b is Box => !!b);
  return bounds.length ? Box.Common(bounds) : null;
}
export function fitDiagram(editor: Editor, animate = true) {
  const bounds = diagramBounds(editor);
  if (!bounds) return;
  const screen = editor.getViewportScreenBounds();
  const container = editor.getContainer();
  const toolbar = container.querySelector('.ads-viewport-toolbar')?.getBoundingClientRect();
  const toolbarBottom = toolbar ? toolbar.bottom-container.getBoundingClientRect().top : 120;
  const top = Math.min(toolbarBottom + 16, screen.h * .4), bottom = Math.min(88, screen.h * .2), side = Math.min(28, screen.w * .1);
  const zoom = Math.min(1, (screen.w - 2*side)/Math.max(1,bounds.w), (screen.h-top-bottom)/Math.max(1,bounds.h));
  // The default 5% minimum can clip wide legacy diagrams. Extend the range only for an explicit fit.
  const options = editor.getCameraOptions();
  if (zoom < options.zoomSteps[0]) editor.setCameraOptions({ zoomSteps: [zoom/2, ...options.zoomSteps] });
  editor.zoomToBounds(new Box(bounds.x-side/zoom, bounds.y-top/zoom, bounds.w+2*side/zoom, bounds.h+(top+bottom)/zoom),
    { inset: 0, targetZoom: zoom, animation: { duration: animate ? 220 : 0 } });
}
export async function fitAfterRender(editor: Editor) {
  await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  if (!editor.isDisposed) fitDiagram(editor, false);
}
export function StudioViewport() {
  const editor = useEditor();
  const [minimap, setMinimap] = useState(true);
  const [arranging, setArranging] = useState(false);
  const previousCamera = useRef<ReturnType<Editor['getCamera']> | null>(null);
  const view = useValue('view controls', () => viewState(editor).get(), [editor]);
  const zoom = useValue('zoom percentage', () => Math.round(editor.getZoomLevel() * 100), [editor]);
  const selection = useValue('focus selection', () => editor.getSelectedShapes().filter(s => s.type === 'studio-component').map(s => s.id), [editor]);
  // This selector observes document changes, not camera changes. Panning only moves the view rectangle.
  const map = useValue('minimap document', () => ({ bounds: diagramBounds(editor),
    nodes: editor.getCurrentPageShapes().filter(s => s.type === 'studio-component').map(s => ({ id: s.id, box: editor.getShapePageBounds(s) })) }), [editor]);
  const viewport = useValue('minimap camera', () => editor.getViewportPageBounds(), [editor]);
  const large = map.nodes.length >= 12 || !!map.bounds && (map.bounds.w > viewport.w * 1.2 || map.bounds.h > viewport.h * 1.2);
  useEffect(() => {
    const container = editor.getContainer();
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => editor.updateViewportScreenBounds(container, true));
    });
    observer.observe(container);
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, [editor]);
  const clearFocus = (restore = true) => {
    viewState(editor).set({ ...viewState(editor).get(), focus: [] });
    if (restore && previousCamera.current) editor.setCamera(previousCamera.current, { animation: { duration: 220 } });
    previousCamera.current = null;
  };
  const focus = () => {
    if (!selection.length) return;
    if (!previousCamera.current) previousCamera.current = { ...editor.getCamera() };
    const selected = new Set<string>(selection);
    const related = new Set<string>(selection);
    for (const shape of editor.getCurrentPageShapes()) {
      if (shape.type !== 'studio-connector') continue;
      const edge = JSON.parse((shape.props as { data: string }).data);
      if (selected.has('shape:' + edge.source) || selected.has('shape:' + edge.target)) {
        related.add(shape.id); related.add('shape:' + edge.source); related.add('shape:' + edge.target);
      }
    }
    viewState(editor).set({ ...viewState(editor).get(), overview: false, focus: [...related] });
    const boxes = selection.map(id => editor.getShapePageBounds(id)).filter((b): b is Box => !!b);
    if (boxes.length) editor.zoomToBounds(Box.Common(boxes), { inset: 96, targetZoom: 1.2, animation: { duration: 280 } });
  };
  return <>
    <TldrawUiInFrontOfTheCanvas />
    <div className="ads-viewport-toolbar" role="toolbar" aria-label="Diagram viewport">
      <button aria-label="Zoom out" onClick={() => editor.zoomOut(undefined, { animation: { duration: 160 } })}>-</button>
      <output aria-label="Zoom level">{zoom}%</output>
      <button aria-label="Zoom in" onClick={() => editor.zoomIn(undefined, { animation: { duration: 160 } })}>+</button>
      <button onClick={() => fitDiagram(editor)}>Fit to Screen</button>
      <button onClick={() => editor.resetZoom(undefined, { animation: { duration: 200 } })}>100%</button>
      <button onClick={() => { const bounds = diagramBounds(editor); if (bounds) editor.centerOnPoint(bounds.center, { animation: { duration: 200 } }); }}>Center Diagram</button>
      <button aria-pressed={view.overview} onClick={() => viewState(editor).set({ ...view, overview: !view.overview })}>{view.overview ? 'Detail' : 'Overview'}</button>
      <button disabled={!selection.length} onClick={focus}>Focus Selection</button>
      {view.focus.length > 0 && <button onClick={() => clearFocus()}>Return to Diagram</button>}
      <button onClick={() => { clearFocus(false); fitDiagram(editor); }}>Reset View</button>
      <button disabled={arranging} onClick={async () => {
        setArranging(true);
        try { await arrangeHandlers.get(editor)?.(); }
        finally { setArranging(false); }
      }}>Auto Arrange</button>
      <button aria-pressed={minimap} onClick={() => setMinimap(!minimap)}>Minimap</button>
    </div>
    {minimap && large && map.bounds && <svg className="ads-minimap" role="img" aria-label="Diagram minimap" viewBox={`${map.bounds.x-24} ${map.bounds.y-24} ${map.bounds.w+48} ${map.bounds.h+48}`}
      onPointerDown={event => {
        const svg = event.currentTarget, point = svg.createSVGPoint(); point.x = event.clientX; point.y = event.clientY;
        const matrix = svg.getScreenCTM(); if (matrix) editor.centerOnPoint(point.matrixTransform(matrix.inverse()), { animation: { duration: 180 } });
      }}>
      {map.nodes.map(n => n.box && <rect key={n.id} x={n.box.x} y={n.box.y} width={n.box.w} height={n.box.h} fill="#c7d2fe" stroke="#6366f1" strokeWidth={3} />)}
      <rect x={viewport.x} y={viewport.y} width={viewport.w} height={viewport.h} fill="#6366f118" stroke="#0f172a" strokeWidth={4} />
    </svg>}
  </>;
}
