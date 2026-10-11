import { z } from 'zod';

// ─── Code Generation Schemas ──────────────────────────────────────────────────

export const GeneratedFileSchema = z.object({
  path: z.string(), // relative to project root, e.g. "backend/src/routes/users.ts"
  content: z.string(),
  language: z.string(),
  purpose: z.string(),
  agentType: z.string(), // which agent generated this
  requirements: z.array(z.string()), // REQ-xxx traceability
  architectureComponents: z.array(z.string()), // component IDs
  apiEndpoints: z.array(z.string()), // API-xxx IDs
  databaseEntities: z.array(z.string()), // entity IDs
  fileSizeBytes: z.number().nullable().optional().transform((value) => value ?? undefined),
  checksum: z.string().nullable().optional().transform((value) => value ?? undefined),
});
export type GeneratedFile = z.infer<typeof GeneratedFileSchema>;

export const FileManifestSchema = z.object({
  projectName: z.string(),
  version: z.string(),
  generatedAt: z.string(),
  totalFiles: z.number(),
  files: z.array(
    z.object({
      path: z.string(),
      purpose: z.string(),
      language: z.string(),
    })
  ),
});

export const GenerationOutputSchema = z.object({
  projectName: z.string(),
  version: z.number().default(1),
  files: z.array(GeneratedFileSchema),
  manifest: FileManifestSchema,
  projectStructure: z.string(), // tree-like string
  setupInstructions: z.string(),
  healthEndpoint: z.string().default('/health'),
  buildCommand: z.string(),
  startCommand: z.string(),
  testCommand: z.string(),
  envExample: z.string(),
});
export type GenerationOutput = z.infer<typeof GenerationOutputSchema>;

// OpenAI Structured Outputs requires every object property to be required and
// every object to reject undeclared fields. Optional metadata is represented
// as nullable here and normalized by GenerationOutputSchema after parsing.
export const GenerationOutputJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['projectName', 'version', 'files', 'manifest', 'projectStructure', 'setupInstructions', 'healthEndpoint', 'buildCommand', 'startCommand', 'testCommand', 'envExample'],
  properties: {
    projectName: { type: 'string' }, version: { type: 'number' },
    files: { type: 'array', items: { type: 'object', additionalProperties: false,
      required: ['path', 'content', 'language', 'purpose', 'agentType', 'requirements', 'architectureComponents', 'apiEndpoints', 'databaseEntities', 'fileSizeBytes', 'checksum'],
      properties: {
        path: { type: 'string' }, content: { type: 'string' }, language: { type: 'string' }, purpose: { type: 'string' }, agentType: { type: 'string' },
        requirements: { type: 'array', items: { type: 'string' } }, architectureComponents: { type: 'array', items: { type: 'string' } },
        apiEndpoints: { type: 'array', items: { type: 'string' } }, databaseEntities: { type: 'array', items: { type: 'string' } },
        fileSizeBytes: { type: ['number', 'null'] }, checksum: { type: ['string', 'null'] },
      } } },
    manifest: { type: 'object', additionalProperties: false, required: ['projectName', 'version', 'generatedAt', 'totalFiles', 'files'], properties: {
      projectName: { type: 'string' }, version: { type: 'string' }, generatedAt: { type: 'string' }, totalFiles: { type: 'number' },
      files: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['path', 'purpose', 'language'], properties: { path: { type: 'string' }, purpose: { type: 'string' }, language: { type: 'string' } } } },
    } },
    projectStructure: { type: 'string' }, setupInstructions: { type: 'string' }, healthEndpoint: { type: 'string' }, buildCommand: { type: 'string' }, startCommand: { type: 'string' }, testCommand: { type: 'string' }, envExample: { type: 'string' },
  },
} as const;
