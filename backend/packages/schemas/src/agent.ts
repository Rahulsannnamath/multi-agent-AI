import { z } from 'zod';
import { LLMProviderTypeSchema } from './llm.js';

// ─── Agent Schemas ────────────────────────────────────────────────────────────

export const AgentTypeSchema = z.enum([
  'requirements',
  'architecture',
  'database',
  'api',
  'security',
  'capacity',
  'review',
  'codegen-frontend',
  'codegen-backend',
  'codegen-database',
  'codegen-tests',
  'debug',
  'test-generation',
]);
export type AgentType = z.infer<typeof AgentTypeSchema>;

export const AgentStatusSchema = z.enum([
  'pending',
  'running',
  'success',
  'failed',
  'retrying',
  'skipped',
]);
export type AgentStatus = z.infer<typeof AgentStatusSchema>;

export const AgentRunSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  experimentId: z.string().optional(),
  agentType: AgentTypeSchema,
  status: AgentStatusSchema,
  provider: LLMProviderTypeSchema,
  model: z.string(),
  promptVersion: z.string(),
  attemptNumber: z.number().default(1),
  startedAt: z.date(),
  completedAt: z.date().optional(),
  durationMs: z.number().optional(),
  inputReference: z.string().optional(),
  outputReference: z.string().optional(),
  error: z.string().optional(),
  warnings: z.array(z.string()).default([]),
  tokenUsage: z
    .object({
      promptTokens: z.number().optional(),
      completionTokens: z.number().optional(),
      totalTokens: z.number().optional(),
      estimatedCostUsd: z.number().optional(),
    })
    .optional(),
});
export type AgentRun = z.infer<typeof AgentRunSchema>;

export const AgentOutputSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    success: z.boolean(),
    agent: AgentTypeSchema,
    provider: LLMProviderTypeSchema,
    model: z.string(),
    durationMs: z.number(),
    promptVersion: z.string(),
    data: dataSchema.optional(),
    warnings: z.array(z.string()).default([]),
    error: z
      .object({
        code: z.string(),
        message: z.string(),
        details: z.unknown().optional(),
      })
      .optional(),
  });
