import { Tldraw, type Editor } from 'tldraw';
import { createRoot } from 'react-dom/client';
import { jsPDF } from 'jspdf';
import { generationTypes, type StudioWorkspace } from '@multi-agent/ai-design-studio';
import { createStudioStore, prepare, allShapeIds, type TabSession } from './canvas';
import { studioShapeUtils, studioBindingUtils } from './shapes';
import { download } from './api';
const safe = (name: string) => name.replace(/[^a-z0-9_-]/gi, '_');
export async function exportDiagram(editor: Editor, title: string, format: 'svg' | 'png' | 'pdf') {
  const ids = allShapeIds(editor);
  if (!ids.length) throw new Error('Cannot export an empty diagram');
  if (format === 'svg') {
    const result = await editor.getSvgString(ids, { padding: 40, background: true });
    if (!result) throw new Error('SVG export failed');
    download(`${safe(title)}.svg`, new Blob([result.svg], { type: 'image/svg+xml' }));
  } else if (format === 'png') {
    const { blob } = await editor.toImage(ids, {
      format: 'png',
      padding: 40,
      background: true,
      scale: 1,
      pixelRatio: 1,
    });
    download(`${safe(title)}.png`, blob);
  } else await exportPdf([{ editor, title }], title);
}
async function exportPdf(pages: { editor: Editor; title: string }[], title: string) {
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a3', compress: true });
  for (let i = 0; i < pages.length; i++) {
    if (i) pdf.addPage('a3', 'landscape');
    const { editor, title: heading } = pages[i];
    pdf.text(heading, 12, 15);
    const { blob, width, height } = await editor.toImage(allShapeIds(editor), {
      format: 'png',
      padding: 40,
      background: true,
      scale: 1,
      pixelRatio: 1,
    });
    const factor = Math.min(
      (pdf.internal.pageSize.getWidth() - 24) / width,
      (pdf.internal.pageSize.getHeight() - 34) / height
    );
    pdf.addImage(
      new Uint8Array(await blob.arrayBuffer()),
      'PNG',
      12,
      24,
      width * factor,
      height * factor
    );
  }
  download(`${safe(title)}.pdf`, pdf.output('blob'));
}
export async function exportAllPdf(workspace: StudioWorkspace, title: string, _source: Editor) {
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a3', compress: true });
  for (let i = 0; i < generationTypes.length; i++) {
    const tab = workspace.diagrams.find((d) => d.graph.diagramType === generationTypes[i]);
    if (!tab) throw new Error('All seven diagrams must be ready for project PDF export');
    const container = document.createElement('div');
    container.style.cssText = 'position:fixed;left:-20000px;top:0;width:1200px;height:800px';
    document.body.appendChild(container);
    const root = createRoot(container),
      store = createStudioStore();
    try {
      const editor = await new Promise<Editor>((resolve, reject) => {
        root.render(
          <Tldraw
            store={store}
            shapeUtils={studioShapeUtils}
            bindingUtils={studioBindingUtils}
            licenseKey={import.meta.env.VITE_TLDRAW_LICENSE_KEY}
            onMount={(e) => {
              prepare(e, {
                store,
                graph: tab.graph,
                canvas: tab.canvas,
                past: [],
                future: [],
                initialized: false,
              } as TabSession)
                .then(() => resolve(e))
                .catch(reject);
            }}
          />
        );
      });
      if (i) pdf.addPage('a3', 'landscape');
      pdf.text(tab.title, 12, 15);
      const { blob, width, height } = await editor.toImage(allShapeIds(editor), {
        format: 'png',
        padding: 40,
        background: true,
        scale: 1,
        pixelRatio: 1,
      });
      const factor = Math.min(
        (pdf.internal.pageSize.getWidth() - 24) / width,
        (pdf.internal.pageSize.getHeight() - 34) / height
      );
      pdf.addImage(
        new Uint8Array(await blob.arrayBuffer()),
        'PNG',
        12,
        24,
        width * factor,
        height * factor
      );
    } finally {
      root.unmount();
      store.dispose();
      container.remove();
    }
  }
  download(`${safe(title)}.pdf`, pdf.output('blob'));
}
