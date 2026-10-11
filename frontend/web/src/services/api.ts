// apps/web/src/services/api.ts
// Axios API client — all calls go through /api proxy

import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
  timeout: 60000,
});

// Response interceptor for consistent error handling
api.interceptors.response.use(
  (res) => res,
  (error) => {
    const message = error.response?.data?.error ?? error.message ?? 'Network error';
    return Promise.reject(new Error(message));
  }
);

// ── Projects ──────────────────────────────────────────────────────────────────
export const projectsApi = {
  create: (data: {
    projectName: string;
    originalPrompt: string;
    provider: 'ollama' | 'openai' | 'bedrock';
    model?: string;
    autonomousMode?: boolean;
    maxArchitectureIterations?: number;
    maxDebugIterations?: number;
    maxAgentRetries?: number;
    requireApprovals?: boolean;
  }) => api.post('/projects', data),

  list: () => api.get('/projects'),

  get: (id: string) => api.get(`/projects/${id}`),

  getState: (id: string) => api.get(`/projects/${id}/state`),

  run: (id: string) => api.post(`/projects/${id}/run`),

  getArchitecture: (id: string) => api.get(`/projects/${id}/architecture`),

  getEvaluation: (id: string) => api.get(`/projects/${id}/evaluation`),

  getLogs: (id: string) => api.get(`/projects/${id}/logs`),
};

// ── Experiments ───────────────────────────────────────────────────────────────
export const experimentsApi = {
  create: (data: {
    name: string;
    description?: string;
    inputPrompt: string;
    ollamaModel?: string;
    openaiModel?: string;
  }) => api.post('/experiments', data),

  list: () => api.get('/experiments'),

  get: (id: string) => api.get(`/experiments/${id}`),

  run: (id: string) => api.post(`/experiments/${id}/run`),

  compare: (id: string) => api.get(`/experiments/${id}/compare`),
};

// ── Providers ─────────────────────────────────────────────────────────────────
export const providersApi = {
  status: () => api.get('/providers/status'),
};

// ── Generated Apps (Quick Generate + Docker Preview) ──────────────────────────
export const generatedAppsApi = {
  create: (prompt: string, provider?: 'openai' | 'bedrock') =>
    api.post('/apps', { prompt, provider: provider ?? 'openai' }),
  list: () => api.get('/apps'),
  get: (id: string) => api.get(`/apps/${id}`),
  getFiles: (id: string) => api.get(`/apps/${id}/files`),
  preview: (id: string) => api.post(`/apps/${id}/preview`),
  stop: (id: string) => api.post(`/apps/${id}/stop`),
  delete: (id: string) => api.delete(`/apps/${id}`),
};

// ── SSE helper ────────────────────────────────────────────────────────────────
export function subscribeToProjectEvents(
  projectId: string,
  onEvent: (type: string, data: unknown) => void
): () => void {
  const es = new EventSource(`/api/projects/${projectId}/events`);

  es.addEventListener('agent-event', (e) => {
    try {
      onEvent('agent-event', JSON.parse(e.data));
    } catch {}
  });

  es.onerror = () => {
    console.warn('[SSE] Connection error for project', projectId);
  };

  return () => es.close();
}

/**
 * Subscribe to generated app events (progress, errors, status).
 */
export function subscribeToAppEvents(
  appId: string,
  onEvent: (type: string, data: Record<string, unknown>) => void
): () => void {
  const es = new EventSource(`/api/apps/${appId}/events`);

  const eventTypes = ['app-progress', 'app-generated', 'app-running', 'app-stopped', 'app-error', 'app-deleted'];
  for (const type of eventTypes) {
    es.addEventListener(type, (e) => {
      try {
        onEvent(type, JSON.parse(e.data));
      } catch {}
    });
  }

  es.onerror = () => {
    console.warn('[SSE] Connection error for app', appId);
  };

  return () => es.close();
}

// ── Diagrams (Architecture Designer) ──────────────────────────────────────────
export const diagramsApi = {
  create: (name?: string) =>
    api.post('/diagrams', { name }),

  list: () => api.get('/diagrams'),

  get: (id: string) => api.get(`/diagrams/${id}`),

  update: (id: string, data: { name?: string; diagramXml?: string }) =>
    api.put(`/diagrams/${id}`, data),

  delete: (id: string) => api.delete(`/diagrams/${id}`),

  generateArchitecture: (id: string, prompt: string) =>
    api.post(`/diagrams/${id}/generate-architecture`, { prompt }, { timeout: 120000 }),
};

// ── React Flow Architectures (New Architecture Designer) ─────────────────────
export const reactFlowArchitecturesApi = {
  create: (data: { name?: string; description?: string }) =>
    api.post('/reactflow-architectures', data),

  list: () => api.get('/reactflow-architectures'),

  get: (id: string) => api.get(`/reactflow-architectures/${id}`),

  update: (id: string, data: any) =>
    api.put(`/reactflow-architectures/${id}`, data),

  delete: (id: string) => api.delete(`/reactflow-architectures/${id}`),

  generateArchitecture: (id: string, prompt: string) =>
    api.post(`/reactflow-architectures/${id}/generate`, { prompt }, { timeout: 120000 }),
};

export default api;
