// packages/agents/src/architecture/prompt.ts
export const ARCHITECTURE_PROMPT_VERSION = 'v1.1';

export const ARCHITECTURE_SYSTEM_PROMPT = `You are a principal solutions architect with deep expertise in distributed systems, cloud-native architecture, and modern application design.

Your role is to design a complete system architecture based on structured requirements.

CRITICAL RULES:
- Component type MUST be exactly one of: "frontend", "backend", "database", "cache", "queue", "storage", "gateway", "auth", "external", "cdn", "loadbalancer", "monitoring".
- NEVER use "service", "server", "api", or "microservice" as the type. An application/API service is type "backend".
- Every component MUST have a unique ID (use kebab-case, e.g. "frontend-react", "backend-api", "db-mongo")
- Include ONLY components that are actually needed — avoid over-engineering
- Every connection must reference valid source/target component IDs
- Components must reference requirement IDs (REQ-xxx, NFR-xxx)
- Identify single points of failure explicitly (isSinglePointOfFailure: true)
- Include position hints for React Flow layout (x, y coordinates in a 1200x800 canvas)
- The default stack is: React frontend, Node.js/Express backend, MongoDB database

OUTPUT FORMAT: Pure JSON object. No markdown, no explanation.`;

export function buildArchitecturePrompt(
  requirements: object,
  revisionNotes?: string[]
): string {
  return `Design a complete system architecture based on these requirements:

${JSON.stringify(requirements, null, 2)}

${revisionNotes && revisionNotes.length > 0 ? `\nREVISION NOTES (must address these):\n${revisionNotes.map((n, i) => `${i + 1}. ${n}`).join('\n')}` : ''}

Generate the JSON with ALL these fields:
{
  "version": 1,
  "deploymentModel": "containerized",
  "components": [
    {
      "id": "frontend-react",
      "type": "frontend",
      "name": "React Frontend",
      "technology": "React + Vite + TypeScript",
      "description": "...",
      "responsibilities": ["..."],
      "requirements": ["REQ-001"],
      "scalingStrategy": "CDN + horizontal",
      "isSinglePointOfFailure": false,
      "position": {"x": 600, "y": 50}
    }
  ],
  "connections": [
    {
      "id": "conn-fe-be",
      "source": "frontend-react",
      "target": "backend-api",
      "protocol": "HTTPS/REST",
      "purpose": "API communication",
      "isSync": true,
      "isCritical": true
    }
  ],
  "technologyStack": {
    "frontend": "React + Vite + TypeScript + Tailwind",
    "backend": "Node.js + Express + TypeScript",
    "database": "MongoDB",
    "auth": "JWT + bcrypt",
    "deployment": "Docker + Docker Compose"
  },
  "designDecisions": [
    {
      "decision": "...",
      "rationale": "...",
      "alternatives": ["..."]
    }
  ],
  "summary": "Brief architecture summary"
}

Layout hint: arrange components top-to-bottom, frontend at top (y:50), backend in middle (y:250), database at bottom (y:450). Use x coordinates to spread horizontally.`;
}
