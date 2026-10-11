import { z } from 'zod';

// ─── Debug/Repair Schemas ─────────────────────────────────────────────────────

export const DebugIterationSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  iterationNumber: z.number(),
  trigger: z.enum(['build-failure', 'test-failure', 'health-check-failure', 'runtime-error']),
  input: z.object({
    buildOutput: z.string().optional(),
    testOutput: z.string().optional(),
    runtimeLogs: z.string().optional(),
    errorMessage: z.string().optional(),
    affectedFiles: z.array(z.string()).optional(),
  }),
  analysis: z
    .object({
      rootCause: z.string(),
      affectedFiles: z.array(z.string()),
      confidence: z.number().min(0).max(1),
      category: z.enum([
        'syntax-error',
        'missing-dependency',
        'config-error',
        'logic-error',
        'type-error',
        'import-error',
        'env-error',
        'network-error',
        'unknown',
      ]),
    })
    .optional(),
  patch: z
    .object({
      modifications: z.array(
        z.object({
          filePath: z.string(),
          operation: z.enum(['create', 'modify', 'delete']),
          content: z.string().optional(),
          diff: z.string().optional(),
        })
      ),
      reasoning: z.string(),
    })
    .optional(),
  result: z
    .object({
      applied: z.boolean(),
      buildSuccess: z.boolean().optional(),
      testSuccess: z.boolean().optional(),
      healthCheckSuccess: z.boolean().optional(),
      error: z.string().optional(),
    })
    .optional(),
  durationMs: z.number().optional(),
  startedAt: z.date(),
  completedAt: z.date().optional(),
  provider: z.string().optional(),
  model: z.string().optional(),
});
export type DebugIteration = z.infer<typeof DebugIterationSchema>;
