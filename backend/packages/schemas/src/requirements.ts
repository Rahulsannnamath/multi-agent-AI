import { z } from 'zod';

// ─── Requirements Schemas ─────────────────────────────────────────────────────

export const FunctionalRequirementSchema = z.object({
  id: z.string(), // REQ-001, REQ-002, ...
  title: z.string(),
  description: z.string(),
  priority: z.enum(['MUST', 'SHOULD', 'COULD', 'WONT']),
  acceptanceCriteria: z.array(z.string()),
  isAssumption: z.boolean().default(false),
});
export type FunctionalRequirement = z.infer<typeof FunctionalRequirementSchema>;

export const NonFunctionalRequirementSchema = z.object({
  id: z.string(), // NFR-001, ...
  category: z.enum([
    'performance',
    'scalability',
    'availability',
    'security',
    'maintainability',
    'usability',
    'reliability',
    'cost',
    'compliance',
  ]),
  description: z.string(),
  metric: z.string().optional(),
  isAssumption: z.boolean().default(false),
});
export type NonFunctionalRequirement = z.infer<typeof NonFunctionalRequirementSchema>;

export const ActorSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  responsibilities: z.array(z.string()),
});

export const RequirementsOutputSchema = z.object({
  applicationName: z.string(),
  applicationSummary: z.string(),
  actors: z.array(ActorSchema),
  functionalRequirements: z.array(FunctionalRequirementSchema),
  nonFunctionalRequirements: z.array(NonFunctionalRequirementSchema),
  constraints: z.array(z.string()),
  assumptions: z.array(z.string()),
  scaleAssumptions: z.object({
    expectedUsers: z.number(),
    peakRequestsPerSecond: z.number(),
    storageGb: z.number(),
    growthFactorPerYear: z.number(),
  }),
  technologyPreferences: z.object({
    frontend: z.string().optional(),
    backend: z.string().optional(),
    database: z.string().optional(),
    deployment: z.string().optional(),
  }),
  securityRequirements: z.array(z.string()),
  deploymentConstraints: z.array(z.string()),
  clarificationQuestions: z.array(z.string()).default([]),
});
export type RequirementsOutput = z.infer<typeof RequirementsOutputSchema>;

export const RequirementsInputSchema = z.object({
  rawPrompt: z.string(),
  autonomousMode: z.boolean().default(true),
  technologyPreferences: z
    .object({
      frontend: z.string().optional(),
      backend: z.string().optional(),
      database: z.string().optional(),
    })
    .optional(),
});
export type RequirementsInput = z.infer<typeof RequirementsInputSchema>;
