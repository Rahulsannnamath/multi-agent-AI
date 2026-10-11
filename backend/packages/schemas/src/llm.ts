import { z } from 'zod';

// ─── LLM Provider Schemas ─────────────────────────────────────────────────────

export const LLMProviderTypeSchema = z.enum(['ollama', 'openai', 'bedrock']);
export type LLMProviderType = z.infer<typeof LLMProviderTypeSchema>;

export const LLMRequestSchema = z.object({
  systemPrompt: z.string(),
  userPrompt: z.string(),
  temperature: z.number().min(0).max(2).default(0.3),
  maxTokens: z.number().positive().default(4096),
  schema: z.record(z.unknown()).optional(), // JSON Schema for structured output
});
export type LLMRequest = z.infer<typeof LLMRequestSchema>;

export const LLMUsageSchema = z.object({
  promptTokens: z.number().optional(),
  completionTokens: z.number().optional(),
  totalTokens: z.number().optional(),
  estimatedCostUsd: z.number().optional(),
});
export type LLMUsage = z.infer<typeof LLMUsageSchema>;

export const LLMResponseSchema = z.object({
  content: z.string(),
  provider: LLMProviderTypeSchema,
  model: z.string(),
  latencyMs: z.number(),
  usage: LLMUsageSchema.optional(),
  success: z.boolean(),
  error: z.string().optional(),
});
export type LLMResponse = z.infer<typeof LLMResponseSchema>;

export const ModelInfoSchema = z.object({
  provider: LLMProviderTypeSchema,
  model: z.string(),
  available: z.boolean(),
  contextWindow: z.number().optional(),
  supportsStructuredOutput: z.boolean(),
});
export type ModelInfo = z.infer<typeof ModelInfoSchema>;
