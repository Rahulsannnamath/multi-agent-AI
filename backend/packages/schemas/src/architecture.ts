import { z } from 'zod';

// ─── Architecture Schemas ─────────────────────────────────────────────────────

const canonicalComponentTypes = [
  'frontend',
  'backend',
  'database',
  'cache',
  'queue',
  'storage',
  'gateway',
  'auth',
  'external',
  'cdn',
  'loadbalancer',
  'monitoring',
] as const;

// LLMs commonly call an application server a generic "service". Keep the
// stored contract canonical while accepting common aliases at validation time.
const componentTypeAliases: Record<string, (typeof canonicalComponentTypes)[number]> = {
  service: 'backend',
  server: 'backend',
  api: 'backend',
  'api-service': 'backend',
  microservice: 'backend',
  'web-app': 'frontend',
};

export function normalizeComponentType(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const normalized = value.trim().toLowerCase();
  return componentTypeAliases[normalized] ?? normalized;
}

export const ComponentTypeSchema = z.preprocess(
  normalizeComponentType,
  z.enum(canonicalComponentTypes)
);
export type ComponentType = z.infer<typeof ComponentTypeSchema>;

export const ArchitectureComponentSchema = z.object({
  id: z.string(), // e.g. "frontend-react", "backend-api"
  type: ComponentTypeSchema,
  name: z.string(),
  technology: z.string(),
  description: z.string(),
  responsibilities: z.array(z.string()),
  requirements: z.array(z.string()), // REQ-001, REQ-002 references
  scalingStrategy: z.string().optional(),
  replicationFactor: z.number().optional(),
  isSinglePointOfFailure: z.boolean().default(false),
  metadata: z.record(z.string()).optional(),
  // React Flow layout hints
  position: z
    .object({
      x: z.number(),
      y: z.number(),
    })
    .optional(),
});
export type ArchitectureComponent = z.infer<typeof ArchitectureComponentSchema>;

export const ArchitectureConnectionSchema = z.object({
  id: z.string(),
  source: z.string(), // component id
  target: z.string(), // component id
  protocol: z.string(), // HTTPS, gRPC, AMQP, etc.
  purpose: z.string(),
  isSync: z.boolean().default(true),
  isCritical: z.boolean().default(false),
});
export type ArchitectureConnection = z.infer<typeof ArchitectureConnectionSchema>;

export const DeploymentModelSchema = z.enum([
  'single-server',
  'multi-server',
  'containerized',
  'serverless',
  'hybrid',
]);

export const ArchitectureOutputSchema = z.object({
  version: z.number().default(1),
  deploymentModel: DeploymentModelSchema,
  components: z.array(ArchitectureComponentSchema),
  connections: z.array(ArchitectureConnectionSchema),
  technologyStack: z.object({
    frontend: z.string(),
    backend: z.string(),
    database: z.string(),
    cache: z.string().optional(),
    queue: z.string().optional(),
    auth: z.string(),
    deployment: z.string(),
  }),
  designDecisions: z.array(
    z.object({
      decision: z.string(),
      rationale: z.string(),
      alternatives: z.array(z.string()),
    })
  ),
  summary: z.string(),
});
export type ArchitectureOutput = z.infer<typeof ArchitectureOutputSchema>;
