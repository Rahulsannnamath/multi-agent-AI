// apps/api/src/routes/providers.router.ts
import { Router, type Request, type Response } from 'express';
import { createProviderFromEnv } from '@multi-agent/llm';

export const providersRouter = Router();

// ── GET /api/providers/status ─────────────────────────────────────────────────
providersRouter.get('/status', async (_req: Request, res: Response) => {
  const ollamaConfigured = !!process.env['OLLAMA_BASE_URL'];
  const openaiConfigured = !!process.env['OPENAI_API_KEY'];
  const bedrockConfigured = !!process.env['AWS_ACCESS_KEY_ID'] && !!process.env['AWS_SECRET_ACCESS_KEY'];

  let ollamaAvailable = false;
  let openaiAvailable = false;
  let bedrockAvailable = false;
  let ollamaModels: string[] = [];

  // Check Ollama
  if (ollamaConfigured) {
    try {
      const ollamaProvider = createProviderFromEnv('ollama');
      const info = await ollamaProvider.getModelInfo();
      ollamaAvailable = info.available;

      // Also fetch model list
      const baseUrl = process.env['OLLAMA_BASE_URL'] ?? 'http://localhost:11434';
      const r = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(3000) });
      if (r.ok) {
        const data = (await r.json()) as { models?: { name: string }[] };
        ollamaModels = (data.models ?? []).map((m) => m.name);
      }
    } catch {
      ollamaAvailable = false;
    }
  }

  // Check OpenAI (just validate key format — don't make an API call)
  if (openaiConfigured) {
    const key = process.env['OPENAI_API_KEY']!;
    openaiAvailable = key.startsWith('sk-') && key.length > 20;
  }

  if (bedrockConfigured) {
    const key = process.env['AWS_ACCESS_KEY_ID']!;
    bedrockAvailable = key.startsWith('AKIA') && key.length > 10;
  }

  return res.json({
    ollama: {
      configured: ollamaConfigured,
      available: ollamaAvailable,
      baseUrl: process.env['OLLAMA_BASE_URL'] ?? 'http://localhost:11434',
      defaultModel: process.env['OLLAMA_MODEL'] ?? 'qwen2.5:0.5b',
      availableModels: ollamaModels,
      message: !ollamaConfigured
        ? 'Ollama is not configured.'
        : !ollamaAvailable
        ? 'Ollama is configured but not reachable. Is Ollama running?'
        : 'Ollama is available.',
    },
    openai: {
      configured: openaiConfigured,
      available: openaiAvailable,
      defaultModel: process.env['OPENAI_MODEL'] ?? 'gpt-4o',
      // NEVER expose the key — just show a masked indicator
      keyConfigured: openaiConfigured,
      message: !openaiConfigured
        ? 'OpenAI is not configured. Set OPENAI_API_KEY.'
        : !openaiAvailable
        ? 'OpenAI key format appears invalid.'
        : 'OpenAI is configured.',
    },
    bedrock: {
      configured: bedrockConfigured,
      available: bedrockAvailable,
      defaultModel: process.env['AWS_BEDROCK_MODEL'] ?? 'nvidia.nemotron-super-3-120b',
      region: process.env['AWS_BEDROCK_REGION'] ?? 'us-east-1',
      keyConfigured: bedrockConfigured,
      message: !bedrockConfigured
        ? 'AWS Bedrock is not configured. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY.'
        : !bedrockAvailable
        ? 'AWS Access Key ID format appears invalid.'
        : 'AWS Bedrock is configured.',
    },
    daytona: {
      configured: !!process.env['DAYTONA_API_KEY'],
      message: process.env['DAYTONA_API_KEY']
        ? 'Daytona is configured.'
        : 'Daytona is not configured. Set DAYTONA_API_KEY and DAYTONA_API_URL.',
    },
  });
});
