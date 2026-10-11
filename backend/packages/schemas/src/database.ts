import { z } from 'zod';

// ─── Database Schemas ─────────────────────────────────────────────────────────

export const FieldTypeSchema = z.enum([
  'String',
  'Int',
  'Float',
  'Boolean',
  'DateTime',
  'ObjectId',
  'Json',
  'Enum',
  'Array',
]);

export const DbFieldSchema = z.object({
  name: z.string(),
  type: FieldTypeSchema,
  isRequired: z.boolean().default(true),
  isUnique: z.boolean().default(false),
  isPrimaryKey: z.boolean().default(false),
  isForeignKey: z.boolean().default(false),
  references: z.string().optional(), // entity name it references
  defaultValue: z.string().optional(),
  enumValues: z.array(z.string()).optional(),
  description: z.string().optional(),
});
export type DbField = z.infer<typeof DbFieldSchema>;

export const DbIndexSchema = z.object({
  name: z.string(),
  fields: z.array(z.string()),
  isUnique: z.boolean().default(false),
  type: z.enum(['single', 'compound', 'text', 'geo']).default('single'),
});

const relationshipTypes = ['one-to-one', 'one-to-many', 'many-to-one', 'many-to-many'] as const;

const relationshipTypeAliases: Record<string, (typeof relationshipTypes)[number]> = {
  'one to one': 'one-to-one',
  'one_to_one': 'one-to-one',
  'one to many': 'one-to-many',
  'one_to_many': 'one-to-many',
  'many to one': 'many-to-one',
  'many_to_one': 'many-to-one',
  'many to many': 'many-to-many',
  'many_to_many': 'many-to-many',
};

export function normalizeRelationshipType(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const normalized = value.trim().toLowerCase();
  return relationshipTypeAliases[normalized] ?? normalized;
}

export const RelationshipTypeSchema = z.preprocess(
  normalizeRelationshipType,
  z.enum(relationshipTypes)
);

export const DbEntitySchema = z.object({
  id: z.string(), // e.g. "entity-user"
  name: z.string(),
  collectionName: z.string(),
  description: z.string(),
  requirements: z.array(z.string()), // REQ-xxx references
  fields: z.array(DbFieldSchema),
  indexes: z.array(DbIndexSchema),
  relationships: z.array(
    z.object({
      type: RelationshipTypeSchema,
      targetEntity: z.string(),
      description: z.string(),
    })
  ),
});
export type DbEntity = z.infer<typeof DbEntitySchema>;

export const DatabaseOutputSchema = z.object({
  technology: z.string(),
  version: z.string().optional(),
  entities: z.array(DbEntitySchema),
  mongooseSchemas: z.record(z.string()).optional(), // entity name → mongoose schema string
  prismaModels: z.string().optional(), // full prisma schema string
  migrationNotes: z.array(z.string()),
  seedData: z.record(z.array(z.unknown())).optional(),
});
export type DatabaseOutput = z.infer<typeof DatabaseOutputSchema>;
