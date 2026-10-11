// apps/web/src/pages/EvaluationView.tsx
import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, XCircle, AlertTriangle, Info } from 'lucide-react';
import { projectsApi } from '../services/api';
import clsx from 'clsx';
import { RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer, Tooltip } from 'recharts';

interface DimensionScore {
  dimension: string;
  score: number;
  passedRules: number;
  totalRules: number;
  formula: string;
  findings: RuleResult[];
}

interface RuleResult {
  ruleId: string;
  category: string;
  severity: string;
  passed: boolean;
  message: string;
  affectedComponent?: string;
  recommendation?: string;
}

interface Evaluation {
  passed: boolean;
  overallScore: number;
  dimensions: DimensionScore[];
  ruleResults: RuleResult[];
  criticalViolations: RuleResult[];
  warnings: RuleResult[];
  recommendations: string[];
  requiresRevision: boolean;
}

const severityColors: Record<string, string> = {
  CRITICAL: 'text-red-400',
  ERROR: 'text-orange-400',
  WARNING: 'text-amber-400',
  INFO: 'text-blue-400',
};

const SeverityIcon = ({ severity }: { severity: string }) => {
  if (severity === 'CRITICAL' || severity === 'ERROR') return <XCircle className="w-4 h-4" />;
  if (severity === 'WARNING') return <AlertTriangle className="w-4 h-4" />;
  return <Info className="w-4 h-4" />;
};

export function EvaluationView() {
  const { id } = useParams<{ id: string }>();
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'rules' | 'recommendations'>('overview');

  useEffect(() => {
    projectsApi.getEvaluation(id!)
      .then((res) => setEvaluation(res.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-500">Loading evaluation...</div>;
  if (!evaluation) return <div className="p-8 text-center text-gray-500">No evaluation data available yet.</div>;

  const radarData = evaluation.dimensions.map((d) => ({
    dimension: d.dimension.charAt(0).toUpperCase() + d.dimension.slice(1),
    score: d.score,
  }));

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-center gap-4 mb-8">
        <Link to={`/projects/${id}`} className="btn-secondary py-1.5 text-sm flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" />
          Back
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-white">Architecture Evaluation</h1>
          <p className="text-gray-500 text-sm">Deterministic rule-based evaluation — no LLM judge</p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <div className={clsx(
            'text-4xl font-bold',
            evaluation.overallScore >= 80 ? 'text-emerald-400' :
            evaluation.overallScore >= 60 ? 'text-amber-400' : 'text-red-400'
          )}>
            {evaluation.overallScore}
          </div>
          <div>
            <p className="text-gray-500 text-sm">/ 100</p>
            <span className={evaluation.passed ? 'badge-success' : 'badge-error'}>
              {evaluation.passed ? '✓ Passed' : '✗ Failed'}
            </span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-800 rounded-lg p-1 mb-6 w-fit">
        {(['overview', 'rules', 'recommendations'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={clsx(
              'px-4 py-1.5 rounded-md text-sm font-medium transition-colors',
              activeTab === tab ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-gray-200'
            )}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <div className="grid grid-cols-2 gap-6">
          {/* Radar chart */}
          <div className="card">
            <h2 className="section-title mb-4">Dimension Scores</h2>
            <ResponsiveContainer width="100%" height={280}>
              <RadarChart data={radarData}>
                <PolarGrid stroke="#374151" />
                <PolarAngleAxis dataKey="dimension" tick={{ fill: '#9ca3af', fontSize: 11 }} />
                <Radar
                  name="Score"
                  dataKey="score"
                  stroke="#6366f1"
                  fill="#6366f1"
                  fillOpacity={0.3}
                />
                <Tooltip
                  contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: 8 }}
                  labelStyle={{ color: '#f3f4f6' }}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>

          {/* Dimension breakdown */}
          <div className="space-y-3">
            {evaluation.dimensions.map((dim) => (
              <div key={dim.dimension} className="card-sm">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-300 capitalize">{dim.dimension}</span>
                  <span className={clsx(
                    'font-bold',
                    dim.score >= 80 ? 'text-emerald-400' :
                    dim.score >= 60 ? 'text-amber-400' : 'text-red-400'
                  )}>
                    {dim.score}%
                  </span>
                </div>
                <div className="w-full bg-gray-800 rounded-full h-1.5">
                  <div
                    className={clsx(
                      'h-1.5 rounded-full transition-all',
                      dim.score >= 80 ? 'bg-emerald-500' :
                      dim.score >= 60 ? 'bg-amber-500' : 'bg-red-500'
                    )}
                    style={{ width: `${dim.score}%` }}
                  />
                </div>
                <p className="text-xs text-gray-600 mt-1">
                  {dim.passedRules}/{dim.totalRules} rules passed · {dim.formula}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'rules' && (
        <div className="space-y-3">
          {evaluation.ruleResults.map((rule) => (
            <div
              key={rule.ruleId}
              className={clsx(
                'card-sm border',
                !rule.passed ? 'border-red-800/30' : 'border-emerald-800/20'
              )}
            >
              <div className="flex items-start gap-3">
                <div className={clsx('mt-0.5 flex-shrink-0', severityColors[rule.severity] ?? 'text-gray-400')}>
                  {rule.passed ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <SeverityIcon severity={rule.severity} />
                  )}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-xs text-gray-500">{rule.ruleId}</span>
                    <span className={clsx('badge text-xs', severityColors[rule.severity])}>
                      {rule.severity}
                    </span>
                    <span className="badge badge-info text-xs">{rule.category}</span>
                    {rule.affectedComponent && (
                      <span className="text-xs text-gray-600">{rule.affectedComponent}</span>
                    )}
                  </div>
                  <p className="text-sm text-gray-300">{rule.message}</p>
                  {rule.recommendation && !rule.passed && (
                    <p className="text-xs text-gray-500 mt-1">
                      <span className="text-indigo-400">Recommendation:</span> {rule.recommendation}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'recommendations' && (
        <div className="card">
          <h2 className="section-title mb-4">Recommendations</h2>
          {evaluation.recommendations.length === 0 ? (
            <p className="text-gray-500">No recommendations — architecture is clean!</p>
          ) : (
            <ol className="space-y-3">
              {evaluation.recommendations.map((rec, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="w-6 h-6 bg-indigo-600/20 rounded-full flex items-center justify-center text-xs font-bold text-indigo-400 flex-shrink-0 mt-0.5">
                    {i + 1}
                  </span>
                  <p className="text-gray-300 text-sm">{rec}</p>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}
