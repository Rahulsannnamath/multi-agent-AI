import { z } from 'zod';

// ─── Architecture Evaluation Schemas ─────────────────────────────────────────

export const EvalSeveritySchema = z.enum(['INFO', 'WARNING', 'ERROR', 'CRITICAL']);

export const EvalRuleResultSchema = z.object({
  ruleId: z.string(),
  category: z.enum([
    'scalability',
    'availability',
    'reliability',
    'security',
    'performance',
    'maintainability',
    'cost',
    'consistency',
  ]),
  severity: EvalSeveritySchema,
  passed: z.boolean(),
  message: z.string(),
  affectedComponent: z.string().optional(),
  recommendation: z.string().optional(),
});
export type EvalRuleResult = z.infer<typeof EvalRuleResultSchema>;

export const DimensionScoreSchema = z.object({
  dimension: z.string(),
  score: z.number().min(0).max(100),
  passedRules: z.number(),
  totalRules: z.number(),
  formula: z.string(), // e.g. "passedRules / totalRules * 100"
  findings: z.array(EvalRuleResultSchema),
});
export type DimensionScore = z.infer<typeof DimensionScoreSchema>;

export const EvaluationOutputSchema = z.object({
  passed: z.boolean(), // overall pass/fail gate
  overallScore: z.number().min(0).max(100),
  dimensions: z.array(DimensionScoreSchema),
  ruleResults: z.array(EvalRuleResultSchema),
  criticalViolations: z.array(EvalRuleResultSchema),
  warnings: z.array(EvalRuleResultSchema),
  recommendations: z.array(z.string()),
  requiresRevision: z.boolean(),
  revisionReasons: z.array(z.string()),
});
export type EvaluationOutput = z.infer<typeof EvaluationOutputSchema>;

export const ReviewFindingSchema = z.object({
  id: z.string(),
  severity: EvalSeveritySchema,
  affectedComponent: z.string(),
  issue: z.string(),
  explanation: z.string(),
  recommendation: z.string(),
  isBlocker: z.boolean().default(false),
});

export const ReviewOutputSchema = z.object({
  approved: z.boolean(),
  findings: z.array(ReviewFindingSchema),
  blockers: z.array(ReviewFindingSchema),
  revisionsRequired: z.array(z.string()),
  summary: z.string(),
});
export type ReviewOutput = z.infer<typeof ReviewOutputSchema>;
