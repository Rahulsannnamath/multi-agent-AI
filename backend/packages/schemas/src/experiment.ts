import { z } from 'zod';
import { LLMProviderTypeSchema } from './llm.js';

// ─── Experiment / Comparison Schemas ─────────────────────────────────────────

export const ComparisonMetricsSchema = z.object({
  // Schema & structure
  schemaValidity: z.number().min(0).max(1), // 1 = valid, 0 = invalid
  completenessScore: z.number().min(0).max(100), // % of required sections present
  requirementsCoverage: z.number().min(0).max(1), // satisfiedReqs / totalReqs
  // Architecture
  architectureConsistency: z.number().min(0).max(1),
  apiCompleteness: z.number().min(0).max(1),
  databaseConsistency: z.number().min(0).max(1),
  // Security
  securityRuleScore: z.number().min(0).max(1),
  // Build & tests
  buildSuccess: z.number().min(0).max(1), // 0 or 1
  testPassRate: z.number().min(0).max(1),
  healthCheckSuccess: z.number().min(0).max(1),
  runtimeSuccess: z.number().min(0).max(1),
  // Repair
  repairIterations: z.number(),
  timeToBuildMs: z.number().optional(),
  // Files
  generatedFileCount: z.number(),
  // Traceability
  requirementToCodeTraceability: z.number().min(0).max(1),
  designToCodeConsistency: z.number().min(0).max(1),
  // Cost & tokens
  totalTokens: z.number().optional(),
  estimatedCostUsd: z.number().optional(),
  // Final
  acceptanceCriteriaPassRate: z.number().min(0).max(1),
  overallScore: z.number().min(0).max(100),
  // Formulas (human-readable)
  formulas: z.record(z.string()),
});
export type ComparisonMetrics = z.infer<typeof ComparisonMetricsSchema>;

export const ExperimentRunSchema = z.object({
  id: z.string(),
  experimentId: z.string(),
  provider: LLMProviderTypeSchema,
  model: z.string(),
  status: z.enum(['pending', 'running', 'completed', 'failed']),
  startedAt: z.date().optional(),
  completedAt: z.date().optional(),
  metrics: ComparisonMetricsSchema.optional(),
  projectId: z.string().optional(), // linked project run
});

export const ExperimentSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  inputPrompt: z.string(),
  ollamaModel: z.string(),
  openaiModel: z.string(),
  configuration: z.record(z.unknown()).optional(),
  runs: z.array(ExperimentRunSchema),
  status: z.enum(['pending', 'running', 'completed', 'failed']),
  createdAt: z.date(),
  completedAt: z.date().optional(),
  comparison: z
    .object({
      ollamaMetrics: ComparisonMetricsSchema.optional(),
      openaiMetrics: ComparisonMetricsSchema.optional(),
      winner: LLMProviderTypeSchema.optional(),
      analysis: z.string().optional(),
    })
    .optional(),
});
export type Experiment = z.infer<typeof ExperimentSchema>;
