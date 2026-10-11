import { z } from 'zod';

// ─── Security Schemas ─────────────────────────────────────────────────────────

export const SeveritySchema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
export type Severity = z.infer<typeof SeveritySchema>;

export const SecurityFindingSchema = z.object({
  id: z.string(),
  category: z.enum([
    'authentication',
    'authorization',
    'input-validation',
    'injection',
    'secrets',
    'rate-limiting',
    'cors',
    'sensitive-data',
    'password-handling',
    'api-security',
    'dependency',
    'sandbox',
    'csrf',
    'xss',
    'transport',
  ]),
  severity: SeveritySchema,
  title: z.string(),
  description: z.string(),
  affectedComponent: z.string(),
  evidence: z.string(), // reasoning/evidence — cannot just say "secure"
  recommendation: z.string(),
  cweReference: z.string().optional(),
  isBlocking: z.boolean().default(false), // CRITICAL findings block generation
});
export type SecurityFinding = z.infer<typeof SecurityFindingSchema>;

export const SecurityOutputSchema = z.object({
  overallRiskLevel: SeveritySchema,
  findings: z.array(SecurityFindingSchema),
  authenticationMechanism: z.string(),
  authorizationModel: z.string(),
  encryptionAtRest: z.boolean(),
  encryptionInTransit: z.boolean(),
  hasRateLimiting: z.boolean(),
  hasCsrfProtection: z.boolean(),
  hasInputValidation: z.boolean(),
  hasSqlInjectionProtection: z.boolean(),
  recommendations: z.array(z.string()),
  securityScore: z.number().min(0).max(100), // deterministic from findings
});
export type SecurityOutput = z.infer<typeof SecurityOutputSchema>;
