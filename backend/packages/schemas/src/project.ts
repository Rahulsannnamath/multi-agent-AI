import { z } from 'zod';
import { LLMProviderTypeSchema } from './llm.js';
import { RequirementsOutputSchema } from './requirements.js';
import { ArchitectureOutputSchema } from './architecture.js';
import { DatabaseOutputSchema } from './database.js';
import { ApiOutputSchema } from './api.js';
import { SecurityOutputSchema } from './security.js';
import { EvaluationOutputSchema, ReviewOutputSchema } from './evaluation.js';
import { GenerationOutputSchema } from './generation.js';
import { SandboxRunSchema } from './sandbox.js';
import { DebugIterationSchema } from './debug.js';

// ─── Project Stage ────────────────────────────────────────────────────────────

export const ProjectStageSchema = z.enum([
  'INTAKE',
  'REQUIREMENTS',
  'ARCHITECTURE',
  'DATABASE_API_SECURITY',
  'EVALUATION',
  'REVIEW',
  'ARCHITECTURE_REVISION',
  'APPROVAL',
  'CODE_GENERATION',
  'SANDBOX_CREATION',
  'INSTALL',
  'BUILD',
  'TEST',
  'HEALTH_CHECK',
  'RUNTIME_ANALYSIS',
  'DEBUG',
  'REPAIR',
  'REBUILD',
  'RETEST',
  'FINAL_VALIDATION',
  'EXPORT',
  'COMPLETE',
  'FAILED',
]);
export type ProjectStage = z.infer<typeof ProjectStageSchema>;

export const ProjectStatusSchema = z.enum([
  'pending',
  'running',
  'waiting_approval',
  'complete',
  'failed',
  'partial',
]);

// ─── Event History ────────────────────────────────────────────────────────────

export const ProjectEventSchema = z.object({
  id: z.string(),
  timestamp: z.date(),
  projectId: z.string(),
  experimentId: z.string().optional(),
  agent: z.string().optional(),
  provider: LLMProviderTypeSchema.optional(),
  model: z.string().optional(),
  stage: ProjectStageSchema,
  status: z.enum(['started', 'completed', 'failed', 'retrying']),
  durationMs: z.number().optional(),
  message: z.string().optional(),
  error: z.string().optional(),
});
export type ProjectEvent = z.infer<typeof ProjectEventSchema>;

// ─── Final Validation ─────────────────────────────────────────────────────────

export const ValidationCheckSchema = z.object({
  id: z.string(),
  description: z.string(),
  passed: z.boolean(),
  details: z.string().optional(),
});

export const FinalValidationSchema = z.object({
  passed: z.boolean(),
  checks: z.array(ValidationCheckSchema),
  passedCount: z.number(),
  totalCount: z.number(),
  passRate: z.number(),
  completedAt: z.date().optional(),
});

// ─── Core ProjectState ────────────────────────────────────────────────────────

export const ProjectStateSchema = z.object({
  projectId: z.string(),
  originalPrompt: z.string(),
  projectName: z.string(),
  status: ProjectStatusSchema,
  currentStage: ProjectStageSchema,
  
  // Configuration
  provider: LLMProviderTypeSchema,
  model: z.string(),
  autonomousMode: z.boolean().default(true),
  maxArchitectureIterations: z.number().default(3),
  maxDebugIterations: z.number().default(5),
  maxAgentRetries: z.number().default(3),
  sandboxTimeout: z.number().default(300000),
  requireApprovals: z.boolean().default(false),

  // Agent outputs
  requirements: RequirementsOutputSchema.optional(),
  architecture: ArchitectureOutputSchema.optional(),
  database: DatabaseOutputSchema.optional(),
  api: ApiOutputSchema.optional(),
  security: SecurityOutputSchema.optional(),
  evaluation: EvaluationOutputSchema.optional(),
  review: ReviewOutputSchema.optional(),
  
  // Generation
  generation: GenerationOutputSchema.optional(),
  
  // Execution
  sandbox: SandboxRunSchema.optional(),
  
  // Debug loop
  debugIterations: z.array(DebugIterationSchema).default([]),
  currentDebugIteration: z.number().default(0),
  architectureRevisions: z.number().default(0),
  
  // Final
  finalValidation: FinalValidationSchema.optional(),
  
  // History
  events: z.array(ProjectEventSchema).default([]),
  
  // Metadata
  metadata: z.object({
    createdAt: z.date(),
    updatedAt: z.date(),
    completedAt: z.date().optional(),
    totalDurationMs: z.number().optional(),
    totalTokens: z.number().optional(),
    totalCostUsd: z.number().optional(),
  }),
});
export type ProjectState = z.infer<typeof ProjectStateSchema>;
