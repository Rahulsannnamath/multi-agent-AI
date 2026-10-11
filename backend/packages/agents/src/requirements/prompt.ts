// packages/agents/src/requirements/prompt.ts
export const REQUIREMENTS_PROMPT_VERSION = 'v1.0';

export const REQUIREMENTS_SYSTEM_PROMPT = `You are a senior software requirements analyst with 15+ years of experience in enterprise software development.

Your role is to analyze a natural-language application description and produce a comprehensive, structured requirements specification.

CRITICAL RULES:
- ALWAYS assign unique IDs: functional requirements get REQ-001, REQ-002... and non-functional get NFR-001, NFR-002...
- NEVER skip IDs or leave sections empty
- Every functional requirement MUST have at least 2 acceptance criteria
- In autonomous mode, make reasonable assumptions and mark them explicitly
- Be specific — vague requirements like "the app should be fast" are NOT acceptable
- Priority MUST be one of: MUST, SHOULD, COULD, WONT (MoSCoW)
- NFR categories: performance, scalability, availability, security, maintainability, usability, reliability, cost, compliance

OUTPUT FORMAT: Pure JSON object matching the schema exactly. No markdown, no explanation.`;

export function buildRequirementsPrompt(rawPrompt: string, autonomousMode: boolean): string {
  return `Analyze the following application description and generate a complete structured requirements specification.

Application Description:
"""
${rawPrompt}
"""

Autonomous Mode: ${autonomousMode ? 'YES — make reasonable assumptions and mark them as isAssumption: true' : 'NO — ask clarification questions for missing info'}

Generate the JSON with ALL these fields populated:
{
  "applicationName": "short name",
  "applicationSummary": "2-3 sentence description",
  "actors": [
    {
      "id": "actor-1",
      "name": "name",
      "description": "...",
      "responsibilities": ["..."]
    }
  ],
  "functionalRequirements": [
    {
      "id": "REQ-001",
      "title": "...",
      "description": "detailed description",
      "priority": "MUST",
      "acceptanceCriteria": ["Given...", "When...", "Then..."],
      "isAssumption": false
    }
  ],
  "nonFunctionalRequirements": [
    {
      "id": "NFR-001",
      "category": "performance",
      "description": "...",
      "metric": "e.g. response time < 200ms for 95th percentile",
      "isAssumption": false
    }
  ],
  "constraints": ["list of technical/business constraints"],
  "assumptions": ["list of assumptions made"],
  "scaleAssumptions": {
    "expectedUsers": 1000,
    "peakRequestsPerSecond": 100,
    "storageGb": 10,
    "growthFactorPerYear": 2
  },
  "technologyPreferences": {
    "frontend": "React",
    "backend": "Node.js + Express",
    "database": "MongoDB"
  },
  "securityRequirements": ["list of security requirements"],
  "deploymentConstraints": ["list"],
  "clarificationQuestions": []
}

Generate at minimum 5 functional requirements and 4 non-functional requirements. Be thorough and realistic.`;
}
