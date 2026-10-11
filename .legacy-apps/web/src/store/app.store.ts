// apps/web/src/store/app.store.ts
import { create } from 'zustand';

export interface ProjectSummary {
  projectId: string;
  projectName: string;
  status: string;
  currentStage: string;
  provider: string;
  model: string;
  createdAt: string;
}

export interface ProviderStatus {
  ollama: {
    configured: boolean;
    available: boolean;
    baseUrl: string;
    defaultModel: string;
    availableModels: string[];
    message: string;
  };
  openai: {
    configured: boolean;
    available: boolean;
    defaultModel: string;
    keyConfigured: boolean;
    message: string;
  };
  daytona: {
    configured: boolean;
    message: string;
  };
}

interface AppStore {
  projects: ProjectSummary[];
  providerStatus: ProviderStatus | null;
  selectedProjectId: string | null;
  isLoading: boolean;
  error: string | null;
  
  setProjects: (projects: ProjectSummary[]) => void;
  setProviderStatus: (status: ProviderStatus) => void;
  setSelectedProject: (id: string | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  addProject: (project: ProjectSummary) => void;
  updateProject: (id: string, updates: Partial<ProjectSummary>) => void;
}

export const useAppStore = create<AppStore>((set) => ({
  projects: [],
  providerStatus: null,
  selectedProjectId: null,
  isLoading: false,
  error: null,

  setProjects: (projects) => set({ projects }),
  setProviderStatus: (status) => set({ providerStatus: status }),
  setSelectedProject: (id) => set({ selectedProjectId: id }),
  setLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error }),
  addProject: (project) =>
    set((state) => ({ projects: [project, ...state.projects] })),
  updateProject: (id, updates) =>
    set((state) => ({
      projects: state.projects.map((p) =>
        p.projectId === id ? { ...p, ...updates } : p
      ),
    })),
}));
