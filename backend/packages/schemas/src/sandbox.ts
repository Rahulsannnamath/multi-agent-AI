import { z } from 'zod';

// ─── Sandbox Schemas ──────────────────────────────────────────────────────────

export const SandboxProviderTypeSchema = z.enum(['daytona', 'local']);
export type SandboxProviderType = z.infer<typeof SandboxProviderTypeSchema>;

export const SandboxStatusSchema = z.enum([
  'creating',
  'ready',
  'installing',
  'building',
  'running',
  'testing',
  'stopped',
  'error',
  'destroyed',
]);

export const SandboxRunSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  provider: SandboxProviderTypeSchema,
  status: SandboxStatusSchema,
  workspaceId: z.string().optional(), // Daytona workspace ID
  createdAt: z.date(),
  destroyedAt: z.date().optional(),
  installResult: z
    .object({
      success: z.boolean(),
      stdout: z.string(),
      stderr: z.string(),
      durationMs: z.number(),
    })
    .optional(),
  buildResult: z
    .object({
      success: z.boolean(),
      stdout: z.string(),
      stderr: z.string(),
      durationMs: z.number(),
    })
    .optional(),
  startResult: z
    .object({
      success: z.boolean(),
      stdout: z.string(),
      stderr: z.string(),
      pid: z.number().optional(),
    })
    .optional(),
  healthCheckResult: z
    .object({
      success: z.boolean(),
      statusCode: z.number().optional(),
      responseBody: z.string().optional(),
      latencyMs: z.number(),
      attempts: z.number(),
    })
    .optional(),
  testResults: z
    .object({
      totalTests: z.number(),
      passed: z.number(),
      failed: z.number(),
      skipped: z.number(),
      durationMs: z.number(),
      output: z.string(),
      testPassRate: z.number(),
    })
    .optional(),
  runtimeLogs: z.string().optional(),
  error: z.string().optional(),
});
export type SandboxRun = z.infer<typeof SandboxRunSchema>;
