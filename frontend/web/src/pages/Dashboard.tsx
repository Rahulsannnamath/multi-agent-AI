// apps/web/src/pages/Dashboard.tsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Activity, CheckCircle, XCircle, Clock, ChevronRight, Cpu } from 'lucide-react';
import { projectsApi } from '../services/api';
import { useAppStore } from '../store/app.store';
import clsx from 'clsx';
import { formatDistanceToNow } from 'date-fns';

const stageLabels: Record<string, string> = {
  INTAKE: 'Intake',
  REQUIREMENTS: 'Requirements',
  ARCHITECTURE: 'Architecture',
  DATABASE_API_SECURITY: 'DB / API / Security',
  EVALUATION: 'Evaluation',
  REVIEW: 'Review',
  ARCHITECTURE_REVISION: 'Revision',
  APPROVAL: 'Awaiting Approval',
  CODE_GENERATION: 'Code Generation',
  SANDBOX_CREATION: 'Sandbox',
  INSTALL: 'Installing',
  BUILD: 'Building',
  TEST: 'Testing',
  HEALTH_CHECK: 'Health Check',
  RUNTIME_ANALYSIS: 'Runtime',
  DEBUG: 'Debugging',
  REPAIR: 'Repairing',
  REBUILD: 'Rebuilding',
  RETEST: 'Retesting',
  FINAL_VALIDATION: 'Validation',
  EXPORT: 'Exporting',
  COMPLETE: 'Complete',
  FAILED: 'Failed',
};

function StatusBadge({ status }: { status: string }) {
  if (status === 'complete') return <span className="badge-success">✓ Complete</span>;
  if (status === 'failed') return <span className="badge-error">✗ Failed</span>;
  if (status === 'running') return <span className="badge-info">⟳ Running</span>;
  if (status === 'partial') return <span className="badge-warning">⚠ Partial</span>;
  if (status === 'waiting_approval') return <span className="badge-purple">⏸ Awaiting Approval</span>;
  return <span className="badge bg-gray-800 text-gray-400">● Pending</span>;
}

export function Dashboard() {
  const navigate = useNavigate();
  const { projects, setProjects, providerStatus } = useAppStore();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    projectsApi.list()
      .then((res) => setProjects(res.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const stats = {
    total: projects.length,
    complete: projects.filter((p) => p.status === 'complete').length,
    failed: projects.filter((p) => p.status === 'failed').length,
    running: projects.filter((p) => p.status === 'running').length,
  };

  return (
    <div className="p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white">Dashboard</h1>
          <p className="text-gray-400 mt-1">Multi-Agent AI App Builder &amp; System Design Generator</p>
        </div>
        <button
          className="btn-primary flex items-center gap-2"
          onClick={() => navigate('/projects/new')}
        >
          <Plus className="w-4 h-4" />
          New Project
        </button>
      </div>

      {/* Provider alerts */}
      {providerStatus && !providerStatus.ollama.available && !providerStatus.openai.available && !providerStatus.bedrock?.available && (
        <div className="mb-6 p-4 bg-amber-900/20 border border-amber-700/50 rounded-xl text-amber-300 text-sm">
          ⚠ No LLM providers are available. Configure Ollama, OpenAI, or AWS Bedrock in your{' '}
          <span className="font-mono">.env</span> file before running a project.{' '}
          <button className="underline" onClick={() => navigate('/providers')}>
            View provider status →
          </button>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <div className="metric-card">
          <div className="flex items-center gap-2 text-gray-400 mb-2">
            <Activity className="w-4 h-4" />
            <span className="metric-label">Total Projects</span>
          </div>
          <div className="metric-value">{stats.total}</div>
        </div>
        <div className="metric-card">
          <div className="flex items-center gap-2 text-emerald-400 mb-2">
            <CheckCircle className="w-4 h-4" />
            <span className="metric-label text-emerald-400/80">Complete</span>
          </div>
          <div className="metric-value text-emerald-400">{stats.complete}</div>
        </div>
        <div className="metric-card">
          <div className="flex items-center gap-2 text-red-400 mb-2">
            <XCircle className="w-4 h-4" />
            <span className="metric-label text-red-400/80">Failed</span>
          </div>
          <div className="metric-value text-red-400">{stats.failed}</div>
        </div>
        <div className="metric-card">
          <div className="flex items-center gap-2 text-blue-400 mb-2">
            <Clock className="w-4 h-4" />
            <span className="metric-label text-blue-400/80">Running</span>
          </div>
          <div className="metric-value text-blue-400">{stats.running}</div>
        </div>
      </div>

      {/* Projects list */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="section-title">Recent Projects</h2>
        </div>

        {loading ? (
          <div className="text-center py-12 text-gray-500">Loading projects...</div>
        ) : projects.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 bg-gray-800 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Plus className="w-8 h-8 text-gray-600" />
            </div>
            <h3 className="text-lg font-medium text-gray-300 mb-2">No projects yet</h3>
            <p className="text-gray-500 mb-6 max-w-sm mx-auto">
              Create your first project to start generating a full-stack application with AI agents.
            </p>
            <button className="btn-primary" onClick={() => navigate('/projects/new')}>
              Create Project
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {projects.map((project) => (
              <div
                key={project.projectId}
                className="flex items-center gap-4 p-4 rounded-lg hover:bg-gray-800 cursor-pointer transition-colors border border-transparent hover:border-gray-700 group"
                onClick={() => navigate(`/projects/${project.projectId}`)}
              >
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-600/30 to-purple-600/30 flex items-center justify-center flex-shrink-0 border border-indigo-600/20">
                  <Cpu className="w-5 h-5 text-indigo-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium text-white truncate">{project.projectName}</h3>
                    <StatusBadge status={project.status} />
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
                    <span className="flex items-center gap-1">
                      <span
                        className={clsx(
                          'status-dot',
                          project.provider === 'openai' ? 'bg-emerald-500'
                            : project.provider === 'bedrock' ? 'bg-orange-500'
                            : 'bg-purple-500'
                        )}
                      />
                      {project.provider} / {project.model}
                    </span>
                    <span>·</span>
                    <span>{stageLabels[project.currentStage] ?? project.currentStage}</span>
                    <span>·</span>
                    <span>{formatDistanceToNow(new Date(project.createdAt))} ago</span>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-600 group-hover:text-gray-400 transition-colors" />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
