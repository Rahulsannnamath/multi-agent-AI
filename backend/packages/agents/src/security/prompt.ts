// packages/agents/src/security/prompt.ts
export const SECURITY_PROMPT_VERSION = 'v1.0';

export const SECURITY_SYSTEM_PROMPT = `You are a senior application security engineer and penetration tester with expertise in OWASP Top 10, web application security, and API security.

Your role is to perform a thorough security analysis of the application design.

CRITICAL RULES:
- NEVER say "the app is secure" without evidence
- Every finding MUST include specific evidence or reasoning about WHY it is a risk
- Severity: CRITICAL (immediate exploitation risk), HIGH (significant risk), MEDIUM (moderate risk), LOW (minor risk)
- isBlocking = true for CRITICAL findings (they must be addressed before code generation)
- Reference CWE IDs where applicable (e.g. CWE-79 for XSS, CWE-89 for SQL Injection)
- The securityScore is deterministic: 100 - (CRITICAL*30 + HIGH*10 + MEDIUM*5 + LOW*1) capped at 0-100

OUTPUT FORMAT: Pure JSON. No markdown.`;

export function buildSecurityPrompt(
  requirements: object,
  architecture: object,
  api: object
): string {
  return `Perform a comprehensive security analysis of this application design.

Requirements:
${JSON.stringify(requirements, null, 2)}

Architecture:
${JSON.stringify(architecture, null, 2)}

API Design:
${JSON.stringify(api, null, 2)}

Analyze these security dimensions:
1. Authentication (are all endpoints properly protected?)
2. Authorization (is RBAC properly defined?)
3. Input validation (all user inputs validated?)
4. Injection risks (SQL, NoSQL, command injection)
5. Secrets management (hardcoded credentials, env var exposure)
6. Rate limiting (are public endpoints rate-limited?)
7. CORS configuration
8. Sensitive data exposure
9. Password handling (hashing, complexity requirements)
10. Transport security (HTTPS enforcement)
11. Dependency security risks
12. Sandbox/execution security (if applicable)

Generate JSON with ALL findings and NO fake "all clear":
{
  "overallRiskLevel": "HIGH",
  "findings": [
    {
      "id": "SEC-001",
      "category": "authentication",
      "severity": "HIGH",
      "title": "Missing authentication on sensitive endpoints",
      "description": "...",
      "affectedComponent": "backend-api",
      "evidence": "API endpoints /api/v1/users do not specify authentication=true in the spec",
      "recommendation": "Add JWT authentication middleware to all non-public endpoints",
      "cweReference": "CWE-306",
      "isBlocking": false
    }
  ],
  "authenticationMechanism": "JWT",
  "authorizationModel": "Role-Based Access Control (RBAC)",
  "encryptionAtRest": false,
  "encryptionInTransit": true,
  "hasRateLimiting": true,
  "hasCsrfProtection": false,
  "hasInputValidation": true,
  "hasSqlInjectionProtection": true,
  "recommendations": ["Use HTTPS in production", "..."],
  "securityScore": 65
}`;
}
