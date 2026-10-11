// apps/web/src/pages/ProvidersView.tsx
import { useEffect, useState } from 'react';
import { RefreshCw, Cpu, AlertTriangle, Cloud } from 'lucide-react';
import { providersApi } from '../services/api';
import { useAppStore } from '../store/app.store';
import clsx from 'clsx';

export function ProvidersView() {
  const { providerStatus, setProviderStatus } = useAppStore();
  const [refreshing, setRefreshing] = useState(false);

  const refresh = async () => {
    setRefreshing(true);
    try {
      const res = await providersApi.status();
      setProviderStatus(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white">LLM Providers</h1>
          <p className="text-gray-400 mt-1">Ollama (local), OpenAI (cloud), and AWS Bedrock (cloud)</p>
        </div>
        <button className="btn-secondary flex items-center gap-2" onClick={refresh} disabled={refreshing}>
          <RefreshCw className={clsx('w-4 h-4', refreshing && 'animate-spin')} />
          Refresh
        </button>
      </div>

      {!providerStatus ? (
        <div className="text-center py-12 text-gray-500">Loading provider status...</div>
      ) : (
        <div className="space-y-6">
          {/* Ollama */}
          <div className={clsx('card border-2', providerStatus.ollama.available ? 'border-emerald-700/50' : 'border-gray-700')}>
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-purple-600/20 rounded-xl flex items-center justify-center flex-shrink-0">
                <Cpu className="w-6 h-6 text-purple-400" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <h2 className="text-lg font-semibold text-white">Ollama</h2>
                  <span className={clsx('badge', providerStatus.ollama.available ? 'badge-success' : 'badge-error')}>
                    {providerStatus.ollama.available ? '✓ Available' : '✗ Unavailable'}
                  </span>
                </div>
                <p className="text-sm text-gray-400 mt-1">{providerStatus.ollama.message}</p>
                
                <div className="mt-4 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Base URL</span>
                    <span className="font-mono text-gray-300">{providerStatus.ollama.baseUrl}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Default Model</span>
                    <span className="font-mono text-gray-300">{providerStatus.ollama.defaultModel}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Env Variable</span>
                    <span className="font-mono text-gray-400">OLLAMA_MODEL</span>
                  </div>
                </div>

                {providerStatus.ollama.availableModels.length > 0 && (
                  <div className="mt-4">
                    <p className="text-xs text-gray-500 mb-2">Installed Models:</p>
                    <div className="flex flex-wrap gap-2">
                      {providerStatus.ollama.availableModels.map((m) => (
                        <span key={m} className="badge badge-purple font-mono">{m}</span>
                      ))}
                    </div>
                  </div>
                )}

                {!providerStatus.ollama.available && (
                  <div className="mt-4 p-3 bg-gray-800 rounded-lg">
                    <p className="text-xs font-medium text-gray-300 mb-2">How to start Ollama:</p>
                    <pre className="text-xs font-mono text-gray-400">
{`# Install Ollama
curl -fsSL https://ollama.com/install.sh | sh

# Pull a model
ollama pull qwen2.5:0.5b

# Start Ollama
ollama serve`}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* OpenAI */}
          <div className={clsx('card border-2', providerStatus.openai.available ? 'border-emerald-700/50' : 'border-gray-700')}>
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-emerald-600/20 rounded-xl flex items-center justify-center flex-shrink-0">
                <Cpu className="w-6 h-6 text-emerald-400" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <h2 className="text-lg font-semibold text-white">OpenAI</h2>
                  <span className={clsx('badge', providerStatus.openai.configured ? 'badge-success' : 'badge-error')}>
                    {providerStatus.openai.configured ? '✓ Configured' : '✗ Not Configured'}
                  </span>
                </div>
                <p className="text-sm text-gray-400 mt-1">{providerStatus.openai.message}</p>

                <div className="mt-4 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Default Model</span>
                    <span className="font-mono text-gray-300">{providerStatus.openai.defaultModel}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">API Key</span>
                    <span className="font-mono text-gray-400">
                      {providerStatus.openai.keyConfigured ? '••••••••••••••••' : 'Not set'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Env Variable</span>
                    <span className="font-mono text-gray-400">OPENAI_API_KEY</span>
                  </div>
                </div>

                {!providerStatus.openai.configured && (
                  <div className="mt-4 p-3 bg-gray-800 rounded-lg">
                    <p className="text-xs font-medium text-gray-300 mb-2">Configure OpenAI:</p>
                    <pre className="text-xs font-mono text-gray-400">
{`# In your .env file:
OPENAI_API_KEY=sk-...your-key...
OPENAI_MODEL=gpt-4o`}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* AWS Bedrock */}
          <div className={clsx('card border-2', providerStatus.bedrock?.available ? 'border-orange-700/50' : 'border-gray-700')}>
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-orange-600/20 rounded-xl flex items-center justify-center flex-shrink-0">
                <Cloud className="w-6 h-6 text-orange-400" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <h2 className="text-lg font-semibold text-white">AWS Bedrock</h2>
                  <span className={clsx('badge', providerStatus.bedrock?.configured ? 'badge-success' : 'badge-error')}>
                    {providerStatus.bedrock?.configured ? '✓ Configured' : '✗ Not Configured'}
                  </span>
                </div>
                <p className="text-sm text-gray-400 mt-1">{providerStatus.bedrock?.message ?? 'AWS Bedrock status unknown.'}</p>

                <div className="mt-4 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Default Model</span>
                    <span className="font-mono text-gray-300">{providerStatus.bedrock?.defaultModel ?? 'nvidia.nemotron-super-3-120b'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Region</span>
                    <span className="font-mono text-gray-300">{providerStatus.bedrock?.region ?? 'us-east-1'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">IAM Credentials</span>
                    <span className="font-mono text-gray-400">
                      {providerStatus.bedrock?.keyConfigured ? 'Configured' : 'Not set'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Env Variables</span>
                    <span className="font-mono text-gray-400">AWS_ACCESS_KEY_ID</span>
                  </div>
                </div>

                {!providerStatus.bedrock?.configured && (
                  <div className="mt-4 p-3 bg-gray-800 rounded-lg">
                    <p className="text-xs font-medium text-gray-300 mb-2">Configure AWS Bedrock:</p>
                    <pre className="text-xs font-mono text-gray-400">
{`# In your .env file:
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
AWS_BEDROCK_MODEL=deepseek.v3.2
AWS_BEDROCK_REGION=us-east-1`}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Daytona */}
          <div className={clsx('card border-2', providerStatus.daytona.configured ? 'border-blue-700/50' : 'border-gray-700')}>
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-blue-600/20 rounded-xl flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-6 h-6 text-blue-400" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <h2 className="text-lg font-semibold text-white">Daytona Sandbox</h2>
                  <span className={clsx('badge', providerStatus.daytona.configured ? 'badge-success' : 'badge-warning')}>
                    {providerStatus.daytona.configured ? '✓ Configured' : '⚠ Not Configured'}
                  </span>
                </div>
                <p className="text-sm text-gray-400 mt-1">{providerStatus.daytona.message}</p>
                <div className="mt-3 p-3 bg-gray-800 rounded-lg text-xs text-gray-400">
                  <p className="font-medium text-gray-300 mb-1">Configure Daytona:</p>
                  <code>DAYTONA_API_KEY=your-key</code><br />
                  <code>DAYTONA_API_URL=https://app.daytona.io/api</code>
                </div>
                <div className="mt-3 p-3 bg-amber-900/20 border border-amber-800/50 rounded-lg text-xs text-amber-400">
                  ⚠ Without Daytona, generated applications cannot be executed in an isolated sandbox. 
                  Build/test results will not be available.
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
