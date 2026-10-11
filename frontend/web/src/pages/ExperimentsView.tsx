// apps/web/src/pages/ExperimentsView.tsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, FlaskConical, ChevronRight, AlertCircle } from 'lucide-react';
import { experimentsApi } from '../services/api';
import { useAppStore } from '../store/app.store';
import clsx from 'clsx';

interface Experiment {
  experimentId: string;
  name: string;
  description?: string;
  inputPrompt: string;
  ollamaModel: string;
  openaiModel: string;
  status: string;
  createdAt: string;
}

export function ExperimentsView() {
  const navigate = useNavigate();
  const { providerStatus } = useAppStore();
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    inputPrompt: '',
    ollamaModel: '',
    openaiModel: '',
  });

  useEffect(() => {
    experimentsApi.list()
      .then((res) => setExperiments(res.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.inputPrompt.trim()) {
      setError('Input prompt is required');
      return;
    }
    if (!providerStatus?.openai.configured) {
      setError('OpenAI API key is required to run comparison experiments.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const { data } = await experimentsApi.create({
        ...form,
        ollamaModel: form.ollamaModel || providerStatus?.ollama.defaultModel || 'qwen2.5:0.5b',
        openaiModel: form.openaiModel || providerStatus?.openai.defaultModel || 'gpt-4o',
      });
      await experimentsApi.run(data.experimentId);
      setShowForm(false);
      // Refresh list
      const res = await experimentsApi.list();
      setExperiments(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create experiment');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white">Experiments</h1>
          <p className="text-gray-400 mt-1">Compare Ollama vs OpenAI on the same task</p>
        </div>
        <button className="btn-primary flex items-center gap-2" onClick={() => setShowForm(true)}>
          <Plus className="w-4 h-4" />
          New Experiment
        </button>
      </div>

      {!providerStatus?.openai.configured && (
        <div className="mb-6 p-4 bg-amber-900/20 border border-amber-700/50 rounded-xl flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0" />
          <div>
            <p className="text-amber-300 text-sm font-medium">OpenAI not configured</p>
            <p className="text-amber-400/70 text-sm mt-1">
              Set <span className="font-mono">OPENAI_API_KEY</span> in your .env file to run comparison experiments.
            </p>
          </div>
        </div>
      )}

      {/* New experiment form */}
      {showForm && (
        <div className="card mb-6">
          <h2 className="section-title mb-4">New Comparison Experiment</h2>
          {error && (
            <div className="mb-4 p-3 bg-red-900/20 border border-red-700/50 rounded-lg text-red-300 text-sm">
              {error}
            </div>
          )}
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="label">Experiment Name</label>
              <input className="input" placeholder="Task App Comparison" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className="label">Application Prompt <span className="text-red-400">*</span></label>
              <textarea
                className="input min-h-[120px]"
                placeholder="Describe the application to build..."
                value={form.inputPrompt}
                onChange={(e) => setForm({ ...form, inputPrompt: e.target.value })}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Ollama Model</label>
                <input className="input" placeholder={providerStatus?.ollama.defaultModel ?? 'qwen2.5:0.5b'} value={form.ollamaModel} onChange={(e) => setForm({ ...form, ollamaModel: e.target.value })} />
              </div>
              <div>
                <label className="label">OpenAI Model</label>
                <input className="input" placeholder={providerStatus?.openai.defaultModel ?? 'gpt-4o'} value={form.openaiModel} onChange={(e) => setForm({ ...form, openaiModel: e.target.value })} />
              </div>
            </div>
            <div className="flex gap-3">
              <button type="submit" className="btn-primary" disabled={submitting}>
                {submitting ? 'Starting...' : 'Start Experiment'}
              </button>
              <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* Experiments list */}
      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading experiments...</div>
      ) : experiments.length === 0 ? (
        <div className="card text-center py-16">
          <FlaskConical className="w-12 h-12 text-gray-600 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-300 mb-2">No experiments yet</h3>
          <p className="text-gray-500 mb-6 max-w-sm mx-auto">
            Create an experiment to compare Ollama and OpenAI on identical tasks using deterministic metrics.
          </p>
          <button className="btn-primary" onClick={() => setShowForm(true)}>Create Experiment</button>
        </div>
      ) : (
        <div className="space-y-3">
          {experiments.map((exp) => (
            <div
              key={exp.experimentId}
              className="card-sm hover:bg-gray-800 cursor-pointer transition-colors flex items-center gap-4 group"
              onClick={() => navigate(`/experiments/${exp.experimentId}/compare`)}
            >
              <div className="w-10 h-10 bg-indigo-600/20 rounded-lg flex items-center justify-center flex-shrink-0">
                <FlaskConical className="w-5 h-5 text-indigo-400" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-medium text-white">{exp.name}</h3>
                <p className="text-sm text-gray-500 truncate mt-0.5">{exp.inputPrompt}</p>
                <div className="flex items-center gap-3 mt-1 text-xs text-gray-600">
                  <span>Ollama: {exp.ollamaModel}</span>
                  <span>·</span>
                  <span>OpenAI: {exp.openaiModel}</span>
                  <span>·</span>
                  <span className={clsx(
                    exp.status === 'completed' ? 'text-emerald-400' :
                    exp.status === 'running' ? 'text-blue-400' :
                    exp.status === 'failed' ? 'text-red-400' : 'text-gray-500'
                  )}>
                    {exp.status}
                  </span>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-600 group-hover:text-gray-400" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
