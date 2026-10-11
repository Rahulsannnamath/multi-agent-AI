// packages/llm/src/ollama.provider.ts
// Ollama local LLM implementation

import type { LLMRequest, LLMResponse, ModelInfo } from '@multi-agent/schemas';
import type { LLMProvider } from './provider.js';

export interface OllamaConfig {
  baseUrl: string;
  model: string;
  timeout?: number;
}

export class OllamaProvider implements LLMProvider {
  readonly providerType = 'ollama' as const;
  readonly model: string;
  private baseUrl: string;
  private timeout: number;

  constructor(config: OllamaConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.model = config.model;
    this.timeout = config.timeout ?? 120000;
  }

  async generateText(request: LLMRequest): Promise<LLMResponse> {
    const startTime = Date.now();
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeout);

      const body = {
        model: this.model,
        system: request.systemPrompt,
        prompt: request.userPrompt,
        stream: false,
        ...(request.schema ? { format: request.schema } : {}),
        options: {
          temperature: request.temperature ?? 0.3,
          num_predict: request.maxTokens ?? 4096,
        },
      };

      const res = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Ollama HTTP ${res.status}: ${text}`);
      }

      const data = (await res.json()) as {
        response: string;
        eval_count?: number;
        prompt_eval_count?: number;
      };

      return {
        content: data.response,
        provider: 'ollama',
        model: this.model,
        latencyMs: Date.now() - startTime,
        success: true,
        usage: {
          promptTokens: data.prompt_eval_count,
          completionTokens: data.eval_count,
          totalTokens: (data.prompt_eval_count ?? 0) + (data.eval_count ?? 0),
        },
      };
    } catch (err: unknown) {
      return {
        content: '',
        provider: 'ollama',
        model: this.model,
        latencyMs: Date.now() - startTime,
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async generateStructured<T>(
    request: LLMRequest,
    parse: (raw: string) => T
  ): Promise<LLMResponse & { parsed?: T }> {
    // Add explicit instruction to return JSON only
    const jsonRequest: LLMRequest = {
      ...request,
      userPrompt:
        request.userPrompt +
        '\n\nIMPORTANT: Respond ONLY with valid JSON. No markdown, no explanation, no code blocks. Pure JSON only.',
    };

    const response = await this.generateText(jsonRequest);

    if (!response.success) {
      return response;
    }

    // Strip markdown code blocks if model still wraps output
    let cleaned = response.content.trim();
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
    // Sometimes models add explanation after JSON — try to extract first JSON object/array
    const jsonMatch = cleaned.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (jsonMatch) cleaned = jsonMatch[0];

    try {
      const parsed = parse(cleaned);
      return { ...response, parsed };
    } catch (parseErr) {
      return {
        ...response,
        success: false,
        error: `JSON parse failed: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}. Raw: ${cleaned.slice(0, 200)}`,
      };
    }
  }

  async getModelInfo(): Promise<ModelInfo> {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { models?: { name: string }[] };
      const available = (data.models ?? []).some(
        (m) => m.name === this.model || m.name.startsWith(this.model.split(':')[0])
      );
      return {
        provider: 'ollama',
        model: this.model,
        available,
        supportsStructuredOutput: true,
      };
    } catch {
      return {
        provider: 'ollama',
        model: this.model,
        available: false,
        supportsStructuredOutput: true,
      };
    }
  }
}
