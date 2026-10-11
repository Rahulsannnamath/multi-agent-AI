// packages/agents/src/base.agent.ts
// Base class for all specialized agents

import type { LLMProvider } from '@multi-agent/llm';
import type { AgentType, LLMProviderType } from '@multi-agent/schemas';
import { z } from 'zod';

export interface AgentExecutionMeta {
  agentType: AgentType;
  provider: LLMProviderType;
  model: string;
  promptVersion: string;
  attemptNumber: number;
  startedAt: Date;
  completedAt?: Date;
  durationMs?: number;
  tokenUsage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    estimatedCostUsd?: number;
  };
}

export interface AgentResult<T> {
  success: boolean;
  agent: AgentType;
  provider: LLMProviderType;
  model: string;
  durationMs: number;
  promptVersion: string;
  data?: T;
  warnings: string[];
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export abstract class BaseAgent<TInput, TOutput> {
  abstract readonly agentType: AgentType;
  abstract readonly promptVersion: string;

  constructor(protected llm: LLMProvider, protected maxRetries: number = 3) {}

  abstract execute(input: TInput): Promise<AgentResult<TOutput>>;

  protected async executeWithRetry<T>(
    fn: () => Promise<{ success: boolean; data?: T; error?: string; warnings?: string[] }>,
    context: string
  ): Promise<{ success: boolean; data?: T; error?: string; warnings: string[] }> {
    let lastError = '';
    const warnings: string[] = [];

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const result = await fn();
        if (result.success && result.data !== undefined) {
          if (result.warnings) warnings.push(...result.warnings);
          return { ...result, warnings };
        }
        lastError = result.error ?? 'Unknown failure';
        warnings.push(`Attempt ${attempt} failed for ${context}: ${lastError}`);

        if (attempt < this.maxRetries) {
          // Exponential backoff: 1s, 2s, 4s
          await sleep(1000 * Math.pow(2, attempt - 1));
        }
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        warnings.push(`Attempt ${attempt} threw for ${context}: ${lastError}`);
        if (attempt < this.maxRetries) {
          await sleep(1000 * Math.pow(2, attempt - 1));
        }
      }
    }

    return {
      success: false,
      error: `Failed after ${this.maxRetries} attempts. Last error: ${lastError}`,
      warnings,
    };
  }

  protected buildResult(
    success: boolean,
    startTime: number,
    data?: TOutput,
    error?: { code: string; message: string; details?: unknown },
    warnings: string[] = []
  ): AgentResult<TOutput> {
    return {
      success,
      agent: this.agentType,
      provider: this.llm.providerType,
      model: this.llm.model,
      durationMs: Date.now() - startTime,
      promptVersion: this.promptVersion,
      data,
      warnings,
      error,
    };
  }

  protected parseJson<T>(raw: string, schema: z.ZodType<T>): { data?: T; error?: string } {
    try {
      let cleaned = raw.trim();
      cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
      // Extract first JSON block
      const match = cleaned.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
      if (match) cleaned = match[0];
      const parsed = JSON.parse(cleaned);
      const validated = schema.parse(parsed);
      return { data: validated };
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
