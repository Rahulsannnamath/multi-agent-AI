// packages/agents/src/codegen/prompt.ts
export const CODEGEN_PROMPT_VERSION = 'v1.1';

export const CODEGEN_BACKEND_SYSTEM_PROMPT = `You are a senior full-stack engineer specializing in Node.js, Express, TypeScript, and MongoDB.

Your role is to generate PRODUCTION-QUALITY backend source code based on the architecture, database design, and API specification.

CRITICAL RULES:
- Generate REAL, runnable code — no placeholders, no "TODO: implement"
- Use TypeScript with strict types everywhere
- Include proper error handling in every route
- Use express-validator or zod for input validation
- Hash passwords with bcrypt (NEVER store plaintext)
- Use JWT for authentication
- Include a /health endpoint that returns { status: "ok", timestamp, version }
- Generate a proper package.json with all dependencies
- Use mongoose for MongoDB
- Include CORS, helmet, express-rate-limit middleware
- Structure: backend/src/index.ts, routes/, middleware/, models/, types/
- Every generated file MUST reference its requirements and API endpoints

OUTPUT FORMAT: Return exactly one JSON object matching the supplied GenerationOutput schema. The files property is an array of complete path/content records. Do not return a bare array, markdown, explanations, or placeholders.`;

export const CODEGEN_FRONTEND_SYSTEM_PROMPT = `You are a senior React/TypeScript developer specializing in modern web applications.

Your role is to generate PRODUCTION-QUALITY React frontend code.

CRITICAL RULES:
- Use React + TypeScript + Vite + Tailwind CSS
- Include proper routing with react-router-dom
- Create a polished, modern UI — not a basic HTML form
- Include proper form validation
- Handle API errors gracefully
- Include loading states
- Structure: frontend/src/App.tsx, components/, pages/, hooks/, types/, services/
- Generate proper package.json and vite.config.ts

OUTPUT FORMAT: Return exactly one JSON object matching the supplied GenerationOutput schema. The files property is an array of complete path/content records. Do not return a bare array, markdown, explanations, or placeholders.`;

export function buildBackendCodegenPrompt(
  requirements: object,
  architecture: object,
  database: object,
  api: object,
  projectName: string
): string {
  return `Generate complete backend source code for: ${projectName}

Requirements (for traceability):
${JSON.stringify(requirements, null, 2)}

Architecture:
${JSON.stringify(architecture, null, 2)}

Database Design:
${JSON.stringify(database, null, 2)}

API Specification:
${JSON.stringify(api, null, 2)}

Return a JSON object containing a files array:
{
  "projectName": "${projectName}",
  "version": 1,
  "files": [
    {
      "path": "backend/package.json",
      "content": "{ \\"name\\": \\"...\\", ... }",
      "language": "json",
      "purpose": "Backend dependencies",
      "agentType": "codegen-backend",
      "requirements": ["REQ-001"],
      "architectureComponents": ["backend-api"],
      "apiEndpoints": [],
      "databaseEntities": []
    },
    {
      "path": "backend/src/index.ts",
      "content": "// Express app entry point\\nimport express from 'express';\\n...",
      "language": "typescript",
      "purpose": "Express server entry point with middleware",
      "agentType": "codegen-backend",
      "requirements": [],
      "architectureComponents": ["backend-api"],
      "apiEndpoints": [],
      "databaseEntities": []
    }
  ],
  "manifest": {
    "projectName": "${projectName}",
    "version": "1.0.0",
    "generatedAt": "${new Date().toISOString()}",
    "totalFiles": 0,
    "files": []
  },
  "projectStructure": "backend/\\n  src/\\n    index.ts\\n    routes/\\n    models/\\n    middleware/\\n    types/\\n  package.json\\n  tsconfig.json",
  "setupInstructions": "cd backend && npm install && npm run dev",
  "healthEndpoint": "/health",
  "buildCommand": "npm run build",
  "startCommand": "npm start",
  "testCommand": "npm test",
  "envExample": "MONGODB_URL=mongodb://localhost:27017/${projectName}\\nJWT_SECRET=change-me\\nPORT=3001"
}

Generate ALL files needed for a complete, runnable backend. Include:
1. backend/package.json
2. backend/tsconfig.json
3. backend/src/index.ts (with middleware: cors, helmet, rate-limit, json)
4. backend/src/models/ (Mongoose models for ALL entities)
5. backend/src/routes/ (Express routes for ALL API endpoints)
6. backend/src/middleware/auth.ts (JWT middleware)
7. backend/src/types/index.ts
8. backend/.env.example

IMPORTANT: The content field must be the COMPLETE file content as a string.`;
}

export function buildFrontendCodegenPrompt(
  requirements: object,
  api: object,
  projectName: string
): string {
  return `Generate complete React frontend source code for: ${projectName}

Requirements:
${JSON.stringify(requirements, null, 2)}

API Specification (endpoints to integrate with):
${JSON.stringify(api, null, 2)}

Generate a JSON matching the GenerationOutput schema, with files including:
1. frontend/package.json
2. frontend/vite.config.ts
3. frontend/tsconfig.json
4. frontend/index.html
5. frontend/tailwind.config.js
6. frontend/src/main.tsx
7. frontend/src/App.tsx
8. frontend/src/pages/ (all main pages)
9. frontend/src/components/ (reusable components)
10. frontend/src/services/api.ts (API client)
11. frontend/src/hooks/ (custom hooks)
12. frontend/src/types/index.ts
13. frontend/.env.example

Generate real, styled, functional React components. Use Tailwind CSS for styling.
The backend runs on port 3001. The API base URL should come from import.meta.env.VITE_API_URL.

Return the same JSON structure as the backend but for frontend files.`;
}
