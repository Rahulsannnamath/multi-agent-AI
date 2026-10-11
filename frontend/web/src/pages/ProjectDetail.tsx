// apps/web/src/pages/ProjectDetail.tsx
// Real-time agent workflow view
import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  GitBranch,
  Shield,
  Code2,
  Eye,
} from 'lucide-react';
import { projectsApi, subscribeToProjectEvents } from '../services/api';
import clsx from 'clsx';


interface ProjectState {
  projectId: string;
  projectName: string;
  status: string;
  currentStage: string;
  provider: string;
  model: string;
  requirements?: { functionalRequirements: unknown[]; applicationName: string };
  architecture?: { components: unknown[]; connections: unknown[] };
  database?: { entities: unknown[] };
  api?: { endpoints: unknown[] };
  security?: { securityScore: number; findings: unknown[] };
  evaluation?: { overallScore: number; passed: boolean };
  generation?: { files: unknown[] };
  finalValidation?: { passed: boolean; passedCount: number; totalCount: number };
  events?: {
    id: string;
    timestamp: string;
    agent?: string;
    stage: string;
    status: string;
    message?: string;
    error?: string;
    durationMs?: number;
  }[];
}

const agentStages = [
  { key: 'REQUIREMENTS', label: 'Requirements', icon: '📋', agent: 'requirements' },
  { key: 'ARCHITECTURE', label: 'Architecture', icon: '🏗️', agent: 'architecture' },
  { key: 'DATABASE_API_SECURITY', label: 'DB / API / Security', icon: '🗄️', agent: 'database' },
  { key: 'EVALUATION', label: 'Evaluation', icon: '⚡', agent: 'evaluator' },
  { key: 'REVIEW', label: 'Review', icon: '🔍', agent: 'review' },
  { key: 'CODE_GENERATION', label: 'Code Generation', icon: '💻', agent: 'codegen' },
  { key: 'FINAL_VALIDATION', label: 'Validation', icon: '✅', agent: 'validator' },
];

const STAGE_ORDER = agentStages.map((s) => s.key);

function getStageStatus(stage: string, currentStage: string, projectStatus: string) {
  const stageIdx = STAGE_ORDER.indexOf(stage);
  const currentIdx = STAGE_ORDER.indexOf(currentStage);
  
  if (currentStage === 'COMPLETE' || projectStatus === 'complete') return 'complete';
  if (currentStage === 'FAILED' && stageIdx <= currentIdx) {
    return stageIdx < currentIdx ? 'complete' : 'failed';
  }
  if (stageIdx < currentIdx) return 'complete';
  if (stageIdx === currentIdx) return 'running';
  return 'pending';
}

export function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [state, setState] = useState<ProjectState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadState = async () => {
    try {
      const res = await projectsApi.getState(id!);
      setState(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load project');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadState();
    const unsubscribe = subscribeToProjectEvents(id!, () => loadState());
    pollRef.current = setInterval(loadState, 5000);
    return () => {
      unsubscribe();
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
      </div>
    );
  }

  if (error || !state) {
    return (
      <div className="p-8">
        <div className="card text-center py-12">
          <XCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <p className="text-red-300">{error ?? 'Project not found'}</p>
        </div>
      </div>
    );
  }

  const isRunning = state.status === 'running';
  const isComplete = state.status === 'complete';
  const isFailed = state.status === 'failed';

  return (
    <div className="p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">{state.projectName}</h1>
          <div className="flex items-center gap-3 mt-2 text-sm text-gray-400">
            <span className="flex items-center gap-1.5">
              <span className={clsx('status-dot', isRunning ? 'bg-blue-400 animate-pulse' : isComplete ? 'bg-emerald-400' : isFailed ? 'bg-red-400' : 'bg-gray-500')} />
              {state.status}
            </span>
            <span>·</span>
            <span>{state.provider} / {state.model}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {state.architecture && (
            <Link to={`/projects/${id}/architecture`} className="btn-secondary text-sm flex items-center gap-2">
              <GitBranch className="w-4 h-4" />
              Architecture
            </Link>
          )}
          {state.evaluation && (
            <Link to={`/projects/${id}/evaluation`} className="btn-secondary text-sm flex items-center gap-2">
              <Eye className="w-4 h-4" />
              Evaluation
            </Link>
          )}
          {state.generation && (
            <Link to={`/projects/${id}/code`} className="btn-secondary text-sm flex items-center gap-2">
              <Code2 className="w-4 h-4" />
              Code
            </Link>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Left: Workflow timeline */}
        <div className="col-span-2 space-y-3">
          <h2 className="section-title mb-4">Agent Workflow</h2>
          {agentStages.map((stage) => {
            const stageStatus = getStageStatus(stage.key, state.currentStage, state.status);
            const relatedEvents = (state.events ?? []).filter(
              (e) => e.stage === stage.key || e.stage.startsWith(stage.key.split('_')[0])
            );
            const latestEvent = relatedEvents[relatedEvents.length - 1];

            return (
              <div
                key={stage.key}
                className={clsx(
                  'flex items-start gap-4 p-4 rounded-xl border transition-all',
                  stageStatus === 'complete' && 'border-emerald-800/50 bg-emerald-900/10',
                  stageStatus === 'running' && 'border-blue-700/50 bg-blue-900/10',
                  stageStatus === 'failed' && 'border-red-800/50 bg-red-900/10',
                  stageStatus === 'pending' && 'border-gray-800 bg-gray-900/50 opacity-50'
                )}
              >
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-lg">
                  {stageStatus === 'complete' && <CheckCircle2 className="w-6 h-6 text-emerald-400" />}
                  {stageStatus === 'running' && <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />}
                  {stageStatus === 'failed' && <XCircle className="w-6 h-6 text-red-400" />}
                  {stageStatus === 'pending' && <Clock className="w-6 h-6 text-gray-600" />}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{stage.icon}</span>
                    <h3 className="font-medium text-white">{stage.label}</h3>
                    {latestEvent?.durationMs && (
                      <span className="text-xs text-gray-600 ml-auto">
                        {(latestEvent.durationMs / 1000).toFixed(1)}s
                      </span>
                    )}
                  </div>
                  {latestEvent && (
                    <p className={clsx(
                      'text-sm mt-1',
                      latestEvent.status === 'failed' ? 'text-red-400' : 'text-gray-400'
                    )}>
                      {latestEvent.error ?? latestEvent.message ?? stage.agent}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Right: Outputs summary */}
        <div className="space-y-4">
          <h2 className="section-title">Outputs</h2>

          {state.requirements && (
            <div className="card-sm">
              <h3 className="text-sm font-medium text-gray-300 mb-2">Requirements</h3>
              <p className="text-2xl font-bold text-white">{state.requirements.functionalRequirements.length}</p>
              <p className="text-xs text-gray-500">functional requirements</p>
            </div>
          )}

          {state.architecture && (
            <div className="card-sm">
              <h3 className="text-sm font-medium text-gray-300 mb-2">Architecture</h3>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-xl font-bold text-white">{(state.architecture.components as unknown[]).length}</p>
                  <p className="text-xs text-gray-500">components</p>
                </div>
                <div>
                  <p className="text-xl font-bold text-white">{(state.architecture.connections as unknown[]).length}</p>
                  <p className="text-xs text-gray-500">connections</p>
                </div>
              </div>
            </div>
          )}

          {state.api && (
            <div className="card-sm">
              <h3 className="text-sm font-medium text-gray-300 mb-2">API Endpoints</h3>
              <p className="text-2xl font-bold text-white">{(state.api.endpoints as unknown[]).length}</p>
              <p className="text-xs text-gray-500">endpoints designed</p>
            </div>
          )}

          {state.security && (
            <div className="card-sm">
              <h3 className="text-sm font-medium text-gray-300 mb-2 flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5" /> Security Score
              </h3>
              <div className="flex items-end gap-2">
                <p className={clsx(
                  'text-2xl font-bold',
                  state.security.securityScore >= 80 ? 'text-emerald-400' :
                  state.security.securityScore >= 60 ? 'text-amber-400' : 'text-red-400'
                )}>
                  {state.security.securityScore}
                </p>
                <p className="text-gray-500 text-sm pb-1">/ 100</p>
              </div>
              <p className="text-xs text-gray-500">{(state.security.findings as unknown[]).length} findings</p>
            </div>
          )}

          {state.evaluation && (
            <div className="card-sm">
              <h3 className="text-sm font-medium text-gray-300 mb-2">Architecture Score</h3>
              <div className="flex items-end gap-2">
                <p className={clsx(
                  'text-2xl font-bold',
                  state.evaluation.overallScore >= 80 ? 'text-emerald-400' :
                  state.evaluation.overallScore >= 60 ? 'text-amber-400' : 'text-red-400'
                )}>
                  {state.evaluation.overallScore}
                </p>
                <p className="text-gray-500 text-sm pb-1">/ 100</p>
              </div>
              <span className={state.evaluation.passed ? 'badge-success' : 'badge-error'}>
                {state.evaluation.passed ? 'Passed' : 'Failed'}
              </span>
            </div>
          )}

          {state.generation && (
            <div className="card-sm">
              <h3 className="text-sm font-medium text-gray-300 mb-2 flex items-center gap-1.5">
                <Code2 className="w-3.5 h-3.5" /> Generated Files
              </h3>
              <p className="text-2xl font-bold text-white">{(state.generation.files as unknown[]).length}</p>
              <button
                className="btn-secondary text-xs mt-2 py-1"
                onClick={() => navigate(`/projects/${id}/code`)}
              >
                Browse Code →
              </button>
            </div>
          )}

          {state.finalValidation && (
            <div className={clsx(
              'card-sm border-2',
              state.finalValidation.passed ? 'border-emerald-700/50' : 'border-amber-700/50'
            )}>
              <h3 className="text-sm font-medium text-gray-300 mb-2">Final Validation</h3>
              <div className="flex items-end gap-2">
                <p className="text-2xl font-bold text-white">{state.finalValidation.passedCount}</p>
                <p className="text-gray-500 text-sm pb-1">/ {state.finalValidation.totalCount}</p>
              </div>
              <span className={state.finalValidation.passed ? 'badge-success' : 'badge-warning'}>
                {state.finalValidation.passed ? 'All Checks Passed' : 'Partial Success'}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Events log */}
      {(state.events?.length ?? 0) > 0 && (
        <div className="mt-8">
          <h2 className="section-title mb-4">Event Log</h2>
          <div className="card max-h-80 overflow-y-auto space-y-1">
            {[...(state.events ?? [])].reverse().map((event) => (
              <div key={event.id} className="flex items-start gap-3 py-2 border-b border-gray-800 last:border-0 text-sm">
                <span className="text-gray-600 text-xs font-mono w-16 flex-shrink-0 mt-0.5">
                  {new Date(event.timestamp).toLocaleTimeString()}
                </span>
                <span className={clsx(
                  'badge text-xs flex-shrink-0',
                  event.status === 'completed' ? 'badge-success' :
                  event.status === 'failed' ? 'badge-error' :
                  event.status === 'started' ? 'badge-info' : 'badge-warning'
                )}>
                  {event.status}
                </span>
                <span className="text-gray-300">
                  <span className="text-gray-500">[{event.agent ?? event.stage}]</span>{' '}
                  {event.error ?? event.message ?? event.stage}
                </span>
                {event.durationMs && (
                  <span className="ml-auto text-gray-600 text-xs flex-shrink-0">
                    {(event.durationMs / 1000).toFixed(1)}s
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
