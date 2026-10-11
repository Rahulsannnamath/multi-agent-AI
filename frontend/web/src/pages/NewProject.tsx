// apps/web/src/pages/NewProject.tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Cpu, ChevronDown, ChevronUp, AlertCircle, Cloud } from 'lucide-react';
import { projectsApi } from '../services/api';
import { useAppStore } from '../store/app.store';

export function NewProject() {
  const navigate = useNavigate();
  const { providerStatus, addProject } = useAppStore();
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    projectName: '',
    originalPrompt: '',
    provider: 'openai' as 'ollama' | 'openai' | 'bedrock',
    model: '',
    autonomousMode: true,
    maxArchitectureIterations: 3,
    maxDebugIterations: 5,
    maxAgentRetries: 3,
    requireApprovals: false,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.originalPrompt.trim()) {
      setError('Application description is required');
      return;
    }

    if (form.provider === 'openai' && !providerStatus?.openai.configured) {
      setError('OpenAI API key is not configured. Set OPENAI_API_KEY in your .env file.');
      return;
    }

    if (form.provider === 'bedrock' && !providerStatus?.bedrock?.configured) {
      setError('AWS Bedrock is not configured. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in your .env file.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const payload = {
        ...form,
        model: form.model || (form.provider === 'openai'
          ? providerStatus?.openai.defaultModel ?? 'gpt-4o'
          : form.provider === 'bedrock'
          ? providerStatus?.bedrock?.defaultModel ?? 'nvidia.nemotron-super-3-120b'
          : providerStatus?.ollama.defaultModel ?? 'qwen2.5:0.5b'),
      };

      const { data } = await projectsApi.create(payload);
      addProject({
        projectId: data.projectId,
        projectName: form.projectName || data.projectId,
        status: 'pending',
        currentStage: 'INTAKE',
        provider: form.provider,
        model: payload.model,
        createdAt: new Date().toISOString(),
      });

      // Auto-run
      await projectsApi.run(data.projectId);
      navigate(`/projects/${data.projectId}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create project');
      setSubmitting(false);
    }
  };

  const demoPrompts = [
    {
      label: 'Task Management App',
      prompt:
        'Build a full-stack task management application. Users can register and login. They can create projects and add tasks to projects. Tasks have title, description, status (todo/in-progress/done), due date, and assignee. The app needs a REST API and a React dashboard. Support 1000 concurrent users.',
    },
    {
      label: 'E-Commerce Platform',
      prompt:
        'Build an e-commerce platform with product catalog, shopping cart, user authentication, order management, and payment integration (Stripe). Needs admin panel and customer-facing storefront. Support 5000 users.',
    },
    {
      label: 'Blog / CMS',
      prompt:
        'Build a blog content management system. Authors can write, edit, and publish articles. Readers can comment. Support categories, tags, search. Include an admin dashboard and public-facing blog. 2000 monthly active users.',
    },
  ];

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white">New Project</h1>
        <p className="text-gray-400 mt-2">
          Describe your application and the AI agents will design and generate it.
        </p>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-900/20 border border-red-700/50 rounded-xl flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-red-300 text-sm">{error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Project Name */}
        <div>
          <label className="label">Project Name <span className="text-gray-600">(optional)</span></label>
          <input
            type="text"
            className="input"
            placeholder="My Awesome App"
            value={form.projectName}
            onChange={(e) => setForm({ ...form, projectName: e.target.value })}
          />
        </div>

        {/* Description */}
        <div>
          <label className="label">
            Application Description <span className="text-red-400">*</span>
          </label>
          <textarea
            className="input min-h-[180px] resize-y"
            placeholder="Describe the application you want to build. Be specific about:&#10;- Core features&#10;- Target users&#10;- Expected scale&#10;- Any technical requirements"
            value={form.originalPrompt}
            onChange={(e) => setForm({ ...form, originalPrompt: e.target.value })}
            required
          />
          {/* Demo prompts */}
          <div className="mt-2 flex gap-2 flex-wrap">
            {demoPrompts.map((demo) => (
              <button
                key={demo.label}
                type="button"
                className="text-xs px-2.5 py-1 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-gray-200 rounded-md transition-colors border border-gray-700"
                onClick={() => setForm({ ...form, originalPrompt: demo.prompt })}
              >
                Use: {demo.label}
              </button>
            ))}
          </div>
        </div>

        {/* LLM Provider */}
        <div>
          <label className="label">LLM Provider</label>
          <div className="grid grid-cols-3 gap-3">
            {(['ollama', 'openai', 'bedrock'] as const).map((p) => {
              const isAvailable =
                p === 'ollama'
                  ? providerStatus?.ollama.configured
                  : p === 'openai'
                  ? providerStatus?.openai.configured
                  : providerStatus?.bedrock?.configured;
              const isSelected = form.provider === p;
              const providerLabel = p === 'ollama' ? 'Ollama' : p === 'openai' ? 'OpenAI' : 'AWS Bedrock';
              const providerDesc = p === 'ollama'
                ? `Local inference · ${providerStatus?.ollama.defaultModel ?? 'qwen2.5:0.5b'}`
                : p === 'openai'
                ? `Cloud API · ${providerStatus?.openai.defaultModel ?? 'gpt-4o'}`
                : `Cloud API · ${providerStatus?.bedrock?.defaultModel ?? 'nvidia.nemotron-super-3-120b'}`;
              const IconComp = p === 'bedrock' ? Cloud : Cpu;
              const iconColor = p === 'bedrock' ? 'text-orange-400' : (isSelected ? 'text-indigo-400' : 'text-gray-500');
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => setForm({ ...form, provider: p, model: '' })}
                  className={`p-4 rounded-xl border-2 text-left transition-all ${
                    isSelected
                      ? p === 'bedrock'
                        ? 'border-orange-500 bg-orange-600/10'
                        : 'border-indigo-500 bg-indigo-600/10'
                      : 'border-gray-700 bg-gray-800/50 hover:border-gray-600'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <IconComp className={`w-4 h-4 ${iconColor}`} />
                    <span className={`font-medium ${isSelected ? 'text-white' : 'text-gray-400'}`}>
                      {providerLabel}
                    </span>
                    {isAvailable ? (
                      <span className="badge-success ml-auto text-xs">configured</span>
                    ) : (
                      <span className="badge bg-gray-700 text-gray-500 ml-auto text-xs">not set</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-600">
                    {providerDesc}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Model override */}
        <div>
          <label className="label">
            Model{' '}
            <span className="text-gray-600">
              (default:{' '}
              {form.provider === 'openai'
                ? providerStatus?.openai.defaultModel ?? 'gpt-4o'
                : form.provider === 'bedrock'
                ? providerStatus?.bedrock?.defaultModel ?? 'nvidia.nemotron-super-3-120b'
                : providerStatus?.ollama.defaultModel ?? 'qwen2.5:0.5b'}
              )
            </span>
          </label>
          {form.provider === 'ollama' && (providerStatus?.ollama.availableModels.length ?? 0) > 0 ? (
            <select
              className="select"
              value={form.model}
              onChange={(e) => setForm({ ...form, model: e.target.value })}
            >
              <option value="">Use default ({providerStatus?.ollama.defaultModel})</option>
              {providerStatus?.ollama.availableModels.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              className="input"
              placeholder={
                form.provider === 'openai'
                  ? 'gpt-4o, gpt-4o-mini, gpt-4-turbo...'
                  : form.provider === 'bedrock'
                  ? 'nvidia.nemotron-super-3-120b, nvidia.nemotron-nano-3-30b...'
                  : 'qwen2.5:0.5b, gemma3:4b, llama3.2...'
              }
              value={form.model}
              onChange={(e) => setForm({ ...form, model: e.target.value })}
            />
          )}
        </div>

        {/* Advanced */}
        <div className="border border-gray-800 rounded-xl overflow-hidden">
          <button
            type="button"
            className="w-full flex items-center justify-between p-4 hover:bg-gray-800 transition-colors"
            onClick={() => setShowAdvanced(!showAdvanced)}
          >
            <span className="text-sm font-medium text-gray-300">Advanced Configuration</span>
            {showAdvanced ? (
              <ChevronUp className="w-4 h-4 text-gray-500" />
            ) : (
              <ChevronDown className="w-4 h-4 text-gray-500" />
            )}
          </button>
          {showAdvanced && (
            <div className="p-4 border-t border-gray-800 space-y-4 bg-gray-900/50">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="label text-xs">Max Architecture Iterations</label>
                  <input
                    type="number"
                    className="input"
                    min={1}
                    max={10}
                    value={form.maxArchitectureIterations}
                    onChange={(e) =>
                      setForm({ ...form, maxArchitectureIterations: parseInt(e.target.value) })
                    }
                  />
                </div>
                <div>
                  <label className="label text-xs">Max Debug Iterations</label>
                  <input
                    type="number"
                    className="input"
                    min={1}
                    max={20}
                    value={form.maxDebugIterations}
                    onChange={(e) =>
                      setForm({ ...form, maxDebugIterations: parseInt(e.target.value) })
                    }
                  />
                </div>
                <div>
                  <label className="label text-xs">Max Agent Retries</label>
                  <input
                    type="number"
                    className="input"
                    min={1}
                    max={10}
                    value={form.maxAgentRetries}
                    onChange={(e) =>
                      setForm({ ...form, maxAgentRetries: parseInt(e.target.value) })
                    }
                  />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="w-4 h-4 rounded"
                    checked={form.autonomousMode}
                    onChange={(e) => setForm({ ...form, autonomousMode: e.target.checked })}
                  />
                  <span className="text-sm text-gray-300">Autonomous Mode</span>
                  <span className="text-xs text-gray-600">(auto-fill assumptions)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="w-4 h-4 rounded"
                    checked={form.requireApprovals}
                    onChange={(e) => setForm({ ...form, requireApprovals: e.target.checked })}
                  />
                  <span className="text-sm text-gray-300">Require Approvals</span>
                </label>
              </div>
            </div>
          )}
        </div>

        <button
          type="submit"
          className="btn-primary w-full py-3 text-base"
          disabled={submitting}
        >
          {submitting ? 'Creating & Starting Project...' : 'Create & Run Project'}
        </button>
      </form>
    </div>
  );
}
