// packages/llm/src/provider.ts
// Core LLM Provider interface

import type { LLMRequest, LLMResponse, ModelInfo } from '@multi-agent/schemas';

export interface LLMProvider {
  /**
   * Generate structured JSON output validated against a schema
   */
  generateStructured<T>(
    request: LLMRequest,
    parse: (raw: string) => T
  ): Promise<LLMResponse & { parsed?: T }>;

  /**
   * Generate free-form text output
   */
  generateText(request: LLMRequest): Promise<LLMResponse>;

  /**
   * Get info about the configured model
   */
  getModelInfo(): Promise<ModelInfo>;

  /**
   * Provider type identifier
   */
  readonly providerType: 'ollama' | 'openai' | 'bedrock';

  /**
   * Model name
   */
  readonly model: string;
}
