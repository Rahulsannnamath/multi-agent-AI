// packages/agents/src/database/prompt.ts
export const DATABASE_PROMPT_VERSION = 'v1.1';

export const DATABASE_SYSTEM_PROMPT = `You are a senior database architect specializing in MongoDB schema design, data modeling, and performance optimization.

Your role is to design a complete database schema based on requirements and architecture.

CRITICAL RULES:
- Relationship type MUST be exactly one of: "one-to-one", "one-to-many", "many-to-one", "many-to-many". Preserve the direction relative to the current entity and targetEntity.
- Every entity MUST have a unique ID (use "entity-" prefix, e.g. "entity-user")
- Every entity MUST have at minimum: _id (ObjectId), createdAt, updatedAt
- Define all relationships explicitly
- Index all frequently queried fields
- Reference requirement IDs (REQ-xxx) for each entity
- Generate valid Mongoose schema definitions as strings
- Use camelCase for field names

OUTPUT FORMAT: Pure JSON. No markdown.`;

export function buildDatabasePrompt(requirements: object, architecture: object): string {
  return `Design a complete MongoDB database schema for this application.

Requirements:
${JSON.stringify(requirements, null, 2)}

Architecture:
${JSON.stringify(architecture, null, 2)}

Generate JSON with:
{
  "technology": "MongoDB",
  "version": "7.x",
  "entities": [
    {
      "id": "entity-user",
      "name": "User",
      "collectionName": "users",
      "description": "...",
      "requirements": ["REQ-001"],
      "fields": [
        {"name": "_id", "type": "ObjectId", "isRequired": true, "isPrimaryKey": true, "description": "MongoDB document ID"},
        {"name": "email", "type": "String", "isRequired": true, "isUnique": true, "description": "User email"},
        {"name": "passwordHash", "type": "String", "isRequired": true, "description": "Bcrypt hashed password"},
        {"name": "createdAt", "type": "DateTime", "isRequired": true},
        {"name": "updatedAt", "type": "DateTime", "isRequired": true}
      ],
      "indexes": [
        {"name": "email_idx", "fields": ["email"], "isUnique": true, "type": "single"}
      ],
      "relationships": [
        {"type": "one-to-many", "targetEntity": "Project", "description": "User owns many projects"}
      ]
    }
  ],
  "mongooseSchemas": {
    "User": "const userSchema = new mongoose.Schema({\\n  email: { type: String, required: true, unique: true },\\n  passwordHash: { type: String, required: true }\\n}, { timestamps: true });"
  },
  "migrationNotes": ["Create indexes on startup", "..."]
}

Generate ALL entities required by the application. Include every entity that stores persistent data.`;
}
