// packages/agents/src/api/prompt.ts
export const API_PROMPT_VERSION = 'v1.0';

export const API_SYSTEM_PROMPT = `You are a senior API architect specializing in RESTful API design, OpenAPI specification, and API security best practices.

Your role is to design a complete REST API based on requirements, architecture, and database design.

CRITICAL RULES:
- Every endpoint MUST have a unique ID (API-001, API-002, ...)
- Every endpoint MUST reference the requirements it satisfies (REQ-xxx)
- Every endpoint MUST reference the database entities it uses
- Authentication required by default unless explicitly public
- Include proper error responses (400, 401, 403, 404, 409, 500)
- Rate limiting must be specified for public endpoints
- Request/response schemas must be complete and realistic

OUTPUT FORMAT: Pure JSON. No markdown.`;

export function buildApiPrompt(requirements: object, architecture: object, database: object): string {
  return `Design a complete REST API specification.

Requirements:
${JSON.stringify(requirements, null, 2)}

Architecture:
${JSON.stringify(architecture, null, 2)}

Database Entities:
${JSON.stringify(database, null, 2)}

Generate JSON:
{
  "version": "1.0.0",
  "baseUrl": "/api/v1",
  "endpoints": [
    {
      "id": "API-001",
      "path": "/auth/register",
      "method": "POST",
      "summary": "Register new user",
      "description": "Create a new user account with email and password",
      "requirements": ["REQ-001"],
      "dbEntities": ["entity-user"],
      "authentication": false,
      "authorization": [],
      "parameters": [],
      "requestBody": {
        "type": "object",
        "required": ["email", "password"],
        "properties": {
          "email": {"type": "string", "format": "email"},
          "password": {"type": "string", "minLength": 8}
        }
      },
      "responses": [
        {"statusCode": 201, "description": "User created successfully", "schema": {"type": "object"}},
        {"statusCode": 400, "description": "Validation error"},
        {"statusCode": 409, "description": "Email already exists"}
      ],
      "rateLimited": true,
      "tags": ["auth"]
    }
  ],
  "authSchemes": [
    {"type": "Bearer JWT", "description": "JWT token in Authorization header"}
  ]
}

Generate ALL endpoints needed for the complete application. Include CRUD for all entities, auth endpoints, and any special endpoints.`;
}
