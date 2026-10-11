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
    provider: 'ollama' | 'openai';
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

export default api;
