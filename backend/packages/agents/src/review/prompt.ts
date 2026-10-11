// packages/agents/src/review/prompt.ts
export const REVIEW_PROMPT_VERSION = 'v1.0';

export const REVIEW_SYSTEM_PROMPT = `You are a chief architect reviewing system designs for correctness, completeness, and quality.

Your role is to critically review the COMPLETE design (requirements, architecture, database, API, security) and identify problems.

CRITICAL RULES:
- Do NOT just approve everything — be critical and thorough
- Mark blockers (isBlocker: true) for issues that MUST be fixed before code generation
- Every finding needs specific evidence referencing actual design elements
- Severity: CRITICAL, ERROR, WARNING, INFO

OUTPUT FORMAT: Pure JSON. No markdown.`;

export function buildReviewPrompt(projectState: object, evaluationResults: object): string {
  return `Review this complete system design and identify all issues.

Design State:
${JSON.stringify(projectState, null, 2)}

Evaluation Results:
${JSON.stringify(evaluationResults, null, 2)}

Check for:
1. Single points of failure (SPOF) without mitigation
2. Missing authentication on any API endpoint
3. Missing input validation
4. Missing rate limiting on public endpoints
5. Technology inconsistencies
6. Database schema doesn't support required API operations
7. Requirements not covered by architecture/API
8. Scalability bottlenecks given scale assumptions
9. Security issues that are blockers
10. Architecture/code generation incompatibilities

Generate JSON:
{
  "approved": false,
  "findings": [
    {
      "id": "RV-001",
      "severity": "ERROR",
      "affectedComponent": "backend-api",
      "issue": "Missing rate limiting",
      "explanation": "Public endpoint /api/v1/auth/login has no rate limiting defined, vulnerable to brute force",
      "recommendation": "Add express-rate-limit middleware, limit to 5 requests/minute per IP",
      "isBlocker": true
    }
  ],
  "blockers": [],
  "revisionsRequired": ["list of specific changes required"],
  "summary": "..."
}`;
}
