// apps/web/src/pages/ComparisonView.tsx
// Side-by-side comparison of Ollama vs OpenAI
import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, TrendingUp, Info } from 'lucide-react';
import { experimentsApi } from '../services/api';
import clsx from 'clsx';

interface Metrics {
  schemaValidity: number;
  completenessScore: number;
  requirementsCoverage: number;
  architectureConsistency: number;
  apiCompleteness: number;
  databaseConsistency: number;
  securityRuleScore: number;
  buildSuccess: number;
  testPassRate: number;
  healthCheckSuccess: number;
  runtimeSuccess: number;
  repairIterations: number;
  timeToBuildMs?: number;
  generatedFileCount: number;
  requirementToCodeTraceability: number;
  designToCodeConsistency: number;
  totalTokens?: number;
  estimatedCostUsd?: number;
  acceptanceCriteriaPassRate: number;
  overallScore: number;
  formulas: Record<string, string>;
}

interface ComparisonData {
  experimentId: string;
  status: string;
  ollama: { model: string; projectId?: string; metrics?: Metrics };
  openai: { model: string; projectId?: string; metrics?: Metrics };
  winner?: string;
  note: string;
}

const metricRows: { key: keyof Metrics; label: string; format?: (v: number) => string; higherBetter?: boolean }[] = [
  { key: 'schemaValidity', label: 'Schema Validity', format: (v) => v === 1 ? '✓ Valid' : '⚠ Invalid' },
  { key: 'completenessScore', label: 'Completeness', format: (v) => `${v}%` },
  { key: 'requirementsCoverage', label: 'Req. Coverage', format: (v) => `${Math.round(v * 100)}%` },
  { key: 'architectureConsistency', label: 'Architecture Score', format: (v) => `${Math.round(v * 100)}%` },
  { key: 'apiCompleteness', label: 'API Completeness', format: (v) => `${Math.round(v * 100)}%` },
  { key: 'securityRuleScore', label: 'Security Score', format: (v) => `${Math.round(v * 100)}/100` },
  { key: 'buildSuccess', label: 'Build Success', format: (v) => v === 1 ? '✓ Pass' : '✗ Fail' },
  { key: 'testPassRate', label: 'Test Pass Rate', format: (v) => `${Math.round(v * 100)}%` },
  { key: 'healthCheckSuccess', label: 'Health Check', format: (v) => v === 1 ? '✓ Pass' : '✗ Fail' },
  { key: 'runtimeSuccess', label: 'Runtime', format: (v) => v === 1 ? '✓ Pass' : '✗ Fail' },
  { key: 'repairIterations', label: 'Repair Iterations', higherBetter: false },
  { key: 'generatedFileCount', label: 'Generated Files' },
  { key: 'requirementToCodeTraceability', label: 'Traceability', format: (v) => `${Math.round(v * 100)}%` },
  { key: 'totalTokens', label: 'Total Tokens' },
  { key: 'estimatedCostUsd', label: 'Estimated Cost', format: (v) => v ? `$${v.toFixed(4)}` : 'N/A' },
  { key: 'acceptanceCriteriaPassRate', label: 'Acceptance Criteria', format: (v) => `${Math.round(v * 100)}%` },
  { key: 'overallScore', label: 'Overall Score (Weighted)', format: (v) => `${v}/100` },
];

export function ComparisonView() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<ComparisonData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showFormulas, setShowFormulas] = useState(false);

  useEffect(() => {
    experimentsApi.compare(id!)
      .then((res) => setData(res.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-500">Loading comparison...</div>;
  if (!data) return <div className="p-8 text-center text-gray-500">Comparison data not available.</div>;

  const ollamaMetrics = data.ollama.metrics;
  const openaiMetrics = data.openai.metrics;

  const getCellClass = (key: keyof Metrics, ollamaVal: number | undefined, openaiVal: number | undefined, isOllama: boolean) => {
    if (ollamaVal === undefined || openaiVal === undefined) return 'text-gray-500';
    const ollamaNum = Number(ollamaVal);
    const openaiNum = Number(openaiVal);
    const isHigherBetter = metricRows.find((r) => r.key === key)?.higherBetter !== false;
    const thisVal = isOllama ? ollamaNum : openaiNum;
    const otherVal = isOllama ? openaiNum : ollamaNum;
    
    if (thisVal > otherVal) return isHigherBetter ? 'text-emerald-400 font-semibold' : 'text-red-400';
    if (thisVal < otherVal) return isHigherBetter ? 'text-gray-400' : 'text-emerald-400 font-semibold';
    return 'text-gray-300';
  };

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-center gap-4 mb-8">
        <Link to="/experiments" className="btn-secondary py-1.5 text-sm flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" />
          Back
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-white">LLM Comparison Results</h1>
          <p className="text-xs text-gray-500 mt-1 flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5" />
            {data.note}
          </p>
        </div>
      </div>

      {data.winner && (
        <div className="mb-6 p-5 bg-gradient-to-r from-indigo-900/30 to-purple-900/30 border border-indigo-700/50 rounded-xl flex items-center gap-4">
          <TrendingUp className="w-8 h-8 text-indigo-400" />
          <div>
            <p className="text-sm text-gray-400">Higher Overall Score</p>
            <p className="text-xl font-bold text-white capitalize">{data.winner === 'ollama' ? `Ollama (${data.ollama.model})` : `OpenAI (${data.openai.model})`}</p>
            <p className="text-xs text-gray-500 mt-1">Score: {data.winner === 'ollama' ? ollamaMetrics?.overallScore : openaiMetrics?.overallScore}/100 vs {data.winner === 'ollama' ? openaiMetrics?.overallScore : ollamaMetrics?.overallScore}/100</p>
          </div>
        </div>
      )}

      {/* Status check */}
      {data.status !== 'completed' && (
        <div className="mb-6 p-4 bg-blue-900/20 border border-blue-700/50 rounded-xl text-blue-300 text-sm">
          Experiment is {data.status}. Results will appear when both runs complete.
        </div>
      )}

      {/* Comparison table */}
      <div className="card overflow-hidden">
        <div className="grid grid-cols-3 gap-0 border-b border-gray-700 pb-4 mb-0">
          <div className="p-4">
            <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide">Metric</h3>
          </div>
          <div className="p-4 bg-purple-900/10 border-x border-gray-700/50">
            <h3 className="font-semibold text-purple-300 flex items-center gap-2">
              🔵 Ollama
            </h3>
            <p className="text-xs text-gray-500 mt-1">{data.ollama.model}</p>
            {ollamaMetrics && (
              <div className="mt-2">
                <span className="text-2xl font-bold text-white">{ollamaMetrics.overallScore}</span>
                <span className="text-gray-500 text-sm">/100</span>
              </div>
            )}
          </div>
          <div className="p-4 bg-emerald-900/10">
            <h3 className="font-semibold text-emerald-300 flex items-center gap-2">
              🟢 OpenAI
            </h3>
            <p className="text-xs text-gray-500 mt-1">{data.openai.model}</p>
            {openaiMetrics && (
              <div className="mt-2">
                <span className="text-2xl font-bold text-white">{openaiMetrics.overallScore}</span>
                <span className="text-gray-500 text-sm">/100</span>
              </div>
            )}
          </div>
        </div>

        <div className="divide-y divide-gray-800">
          {metricRows.map((row) => {
            const ollamaVal = ollamaMetrics?.[row.key] as number | undefined;
            const openaiVal = openaiMetrics?.[row.key] as number | undefined;
            const fmt = row.format ?? ((v: number) => String(v));

            return (
              <div key={row.key} className="grid grid-cols-3">
                <div className="px-4 py-3 text-sm text-gray-400">{row.label}</div>
                <div className={clsx(
                  'px-4 py-3 text-sm text-center bg-purple-900/5 border-x border-gray-800',
                  getCellClass(row.key, ollamaVal, openaiVal, true)
                )}>
                  {ollamaVal !== undefined ? fmt(ollamaVal) : '—'}
                </div>
                <div className={clsx(
                  'px-4 py-3 text-sm text-center bg-emerald-900/5',
                  getCellClass(row.key, ollamaVal, openaiVal, false)
                )}>
                  {openaiVal !== undefined ? fmt(openaiVal) : '—'}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Formulas */}
      <div className="mt-6">
        <button
          className="btn-secondary text-sm flex items-center gap-2"
          onClick={() => setShowFormulas(!showFormulas)}
        >
          <Info className="w-4 h-4" />
          {showFormulas ? 'Hide' : 'Show'} Metric Formulas
        </button>
        {showFormulas && ollamaMetrics && (
          <div className="mt-4 card">
            <h2 className="section-title mb-4">Transparent Metric Formulas</h2>
            <div className="space-y-2">
              {Object.entries(ollamaMetrics.formulas ?? {}).map(([key, formula]) => (
                <div key={key} className="flex items-start gap-3 text-sm">
                  <span className="text-gray-500 w-48 flex-shrink-0">{key}:</span>
                  <span className="font-mono text-gray-300">{formula}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
