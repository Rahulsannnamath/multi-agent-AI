// packages/llm/src/openai.provider.ts
// OpenAI API implementation

import OpenAI from 'openai';
import type { LLMRequest, LLMResponse, ModelInfo } from '@multi-agent/schemas';
import type { LLMProvider } from './provider.js';

export interface OpenAIConfig {
  apiKey: string;
  model: string;
  timeout?: number;
}

function isGpt6Luna(model: string): boolean {
  return model === 'gpt-6-luna' || model.startsWith('gpt-6-luna-');
}

export class OpenAIProvider implements LLMProvider {
  readonly providerType = 'openai' as const;
  readonly model: string;
  private client: OpenAI;
  private timeout: number;

  constructor(config: OpenAIConfig) {
    // Never log the API key
    this.client = new OpenAI({
      apiKey: config.apiKey,
      timeout: config.timeout ?? 120000,
    });
    this.model = config.model;
    this.timeout = config.timeout ?? 120000;
  }

  async generateText(request: LLMRequest): Promise<LLMResponse> {
    const startTime = Date.now();
    try {
      const completion = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: request.systemPrompt },
          { role: 'user', content: request.userPrompt },
        ],
        max_completion_tokens: request.maxTokens ?? 4096,
        ...(isGpt6Luna(this.model)
          ? { reasoning_effort: 'medium' as const }
          : { temperature: request.temperature ?? 0.3 }),
      });

      const content = completion.choices[0]?.message?.content ?? '';
      const usage = completion.usage;

      // Estimate cost (rough, not exact)
      const estimatedCostUsd = usage
        ? estimateCost(this.model, usage.prompt_tokens, usage.completion_tokens)
        : undefined;

      return {
        content,
        provider: 'openai',
        model: this.model,
        latencyMs: Date.now() - startTime,
        success: true,
        usage: {
          promptTokens: usage?.prompt_tokens,
          completionTokens: usage?.completion_tokens,
          totalTokens: usage?.total_tokens,
          estimatedCostUsd,
        },
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      // Sanitize: never return the API key in the error
      const sanitized = message.replace(/sk-[A-Za-z0-9_-]{20,}/g, '[REDACTED_KEY]');
      return {
        content: '',
        provider: 'openai',
        model: this.model,
        latencyMs: Date.now() - startTime,
        success: false,
        error: sanitized,
      };
    }
  }

  async generateStructured<T>(
    request: LLMRequest,
    parse: (raw: string) => T
  ): Promise<LLMResponse & { parsed?: T }> {
    const startTime = Date.now();
    try {
      const supportsJsonSchema =
        this.model.includes('gpt-4o') ||
        this.model.includes('gpt-4.1') ||
        isGpt6Luna(this.model);
      const responseFormat = request.schema && supportsJsonSchema
        ? { type: 'json_schema' as const, json_schema: { name: 'generation_output', strict: true, schema: request.schema } }
        : { type: 'json_object' as const };
      const supportsJsonMode =
        this.model.includes('gpt-4o') ||
        this.model.includes('gpt-4-turbo') ||
        this.model.includes('gpt-4.1') ||
        this.model.includes('gpt-3.5-turbo') ||
        isGpt6Luna(this.model);

      const completion = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: request.systemPrompt + '\nReturn only the requested JSON object.' },
          { role: 'user', content: request.userPrompt },
        ],
        max_completion_tokens: request.maxTokens ?? 4096,
        ...(isGpt6Luna(this.model)
          ? { reasoning_effort: 'medium' as const }
          : { temperature: request.temperature ?? 0.3 }),
        ...(supportsJsonMode ? { response_format: responseFormat } : {}),
      });

      const choice = completion.choices[0];
      const raw = choice?.message?.content ?? '';
      if (choice?.finish_reason === 'length') {
        return {
          content: raw,
          provider: 'openai',
          model: this.model,
          latencyMs: Date.now() - startTime,
          success: false,
          error: 'The model response reached its output token limit. Reduce the requested file scope and retry.',
          usage: completion.usage ? {
            promptTokens: completion.usage.prompt_tokens,
            completionTokens: completion.usage.completion_tokens,
            totalTokens: completion.usage.total_tokens,
            estimatedCostUsd: estimateCost(this.model, completion.usage.prompt_tokens, completion.usage.completion_tokens),
          } : undefined,
        };
      }
      const usage = completion.usage;
      const estimatedCostUsd = usage
        ? estimateCost(this.model, usage.prompt_tokens, usage.completion_tokens)
        : undefined;

      const baseResponse: LLMResponse = {
        content: raw,
        provider: 'openai',
        model: this.model,
        latencyMs: Date.now() - startTime,
        success: true,
        usage: {
          promptTokens: usage?.prompt_tokens,
          completionTokens: usage?.completion_tokens,
          totalTokens: usage?.total_tokens,
          estimatedCostUsd,
        },
      };

      // Strip markdown if present
      let cleaned = raw.trim();
      cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');

      try {
        const parsed = parse(cleaned);
        return { ...baseResponse, parsed };
      } catch (parseErr) {
        return {
          ...baseResponse,
          success: false,
          error: `JSON parse failed: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`,
        };
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      const sanitized = message.replace(/sk-[A-Za-z0-9_-]{20,}/g, '[REDACTED_KEY]');
      return {
        content: '',
        provider: 'openai',
        model: this.model,
        latencyMs: Date.now() - startTime,
        success: false,
        error: sanitized,
      };
    }
  }

  async getModelInfo(): Promise<ModelInfo> {
    try {
      // Just check the client is initialized — don't make an unnecessary API call
      return {
        provider: 'openai',
        model: this.model,
        available: true,
        supportsStructuredOutput: true,
        contextWindow: getContextWindow(this.model),
      };
    } catch {
      return {
        provider: 'openai',
        model: this.model,
        available: false,
        supportsStructuredOutput: true,
      };
    }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function estimateCost(model: string, promptTokens: number, completionTokens: number): number {
  // Rough pricing per 1M tokens (as of early 2025 — may drift)
  const pricing: Record<string, { input: number; output: number }> = {
    'gpt-4o': { input: 2.5, output: 10 },
    'gpt-4o-mini': { input: 0.15, output: 0.6 },
    'gpt-4-turbo': { input: 10, output: 30 },
    'gpt-3.5-turbo': { input: 0.5, output: 1.5 },
  };

  const key = Object.keys(pricing).find((k) => model.startsWith(k)) ?? 'gpt-4o';
  const { input, output } = pricing[key];
  return (promptTokens / 1_000_000) * input + (completionTokens / 1_000_000) * output;
}

function getContextWindow(model: string): number {
  if (model.includes('gpt-4o')) return 128000;
  if (model.includes('gpt-4-turbo')) return 128000;
  if (model.includes('gpt-3.5-turbo')) return 16385;
  return 8192;
}
