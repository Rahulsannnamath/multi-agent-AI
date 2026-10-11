import { z } from 'zod';

// ─── API Schemas ──────────────────────────────────────────────────────────────

export const HttpMethodSchema = z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);

export const ApiParameterSchema = z.object({
  name: z.string(),
  in: z.enum(['path', 'query', 'header', 'body']),
  required: z.boolean(),
  type: z.string(),
  description: z.string().optional(),
  example: z.unknown().optional(),
});

export const ApiEndpointSchema = z.object({
  id: z.string(), // API-001, ...
  path: z.string(),
  method: HttpMethodSchema,
  summary: z.string(),
  description: z.string(),
  requirements: z.array(z.string()), // REQ-xxx references
  dbEntities: z.array(z.string()), // entity IDs touched
  authentication: z.boolean().default(true),
  authorization: z.array(z.string()).default([]), // roles
  parameters: z.array(ApiParameterSchema),
  requestBody: z.unknown().optional(), // JSON Schema
  responses: z.array(
    z.object({
      statusCode: z.number(),
      description: z.string(),
      schema: z.unknown().optional(),
    })
  ),
  rateLimited: z.boolean().default(false),
  tags: z.array(z.string()).default([]),
});
export type ApiEndpoint = z.infer<typeof ApiEndpointSchema>;

export const ApiOutputSchema = z.object({
  version: z.string().default('1.0.0'),
  baseUrl: z.string().default('/api/v1'),
  endpoints: z.array(ApiEndpointSchema),
  openApiSpec: z.record(z.unknown()).optional(), // full OpenAPI 3.0 object
  authSchemes: z.array(
    z.object({
      type: z.string(),
      description: z.string(),
    })
  ),
});
export type ApiOutput = z.infer<typeof ApiOutputSchema>;
