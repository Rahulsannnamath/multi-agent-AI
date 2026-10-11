import type { DiagramGraph, OperationPlan, StudioWorkspace } from '@multi-agent/ai-design-studio';
export interface StudioDocument { designId: string; title: string; revision: number; workspace: StudioWorkspace; graph: DiagramGraph; canvas: Record<string, unknown> | null; chat: { role: 'user' | 'assistant'; content: string }[] }
export class StudioApiError extends Error { status: number; constructor(message: string,status: number) { super(message); this.status = status; } }
export async function studioApi<T>(path: string, body?: unknown, method = body === undefined ? 'GET' : 'POST'): Promise<T> {
  const response = await fetch(`/api/ai-design-studio${path}`, { method,headers: { 'Content-Type': 'application/json',Authorization: `Bearer ${sessionStorage.getItem('ai-design-studio-session') ?? ''}` },body: body === undefined ? undefined : JSON.stringify(body),signal: AbortSignal.timeout(200000) });
  if (response.status === 204) return undefined as T;
  const data = await response.json();
  if (!response.ok) { if (response.status === 401) sessionStorage.removeItem('ai-design-studio-session'); throw new StudioApiError(data.error + (data.details ? `: ${data.details.join('; ')}` : ''),response.status); }
  return data as T;
}
export type Preview = { plan: OperationPlan; fingerprint: string };
export function download(name: string, blob: Blob) { const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url),1000); }
