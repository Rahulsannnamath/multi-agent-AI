import { z } from 'zod';
import {
  Graph,
  GraphBase,
  Id,
  Text,
  emptyGraph,
  migrateGraph,
  diagramLabels,
  type DiagramGraph,
} from './schema.js';

export const SystemEntity = z
  .object({
    id: Id,
    name: Text.min(1),
    kind: z.enum(['actor', 'entity', 'service', 'infrastructure', 'artifact']),
    responsibility: Text,
  })
  .strict();
export const SystemModel = z
  .object({
    name: Text,
    requirements: z.array(Text).max(60),
    nonFunctionalRequirements: z.array(Text).max(60).default([]),
    assumptions: z.array(Text).max(60),
    entities: z.array(SystemEntity).max(250),
    roles: z
      .array(z.object({ entityId: Id, capabilities: z.array(Text).max(40) }).strict())
      .max(30)
      .default([]),
    relationships: z
      .array(z.object({ sourceId: Id, targetId: Id, description: Text }).strict())
      .max(100)
      .default([]),
    modules: z
      .array(
        z.object({ entityId: Id, responsibility: Text, dependencies: z.array(Id).max(30) }).strict()
      )
      .max(50)
      .default([]),
    workflows: z
      .array(
        z
          .object({
            id: Id,
            name: Text,
            steps: z.array(Text).min(1).max(30),
            entityIds: z.array(Id).max(30),
          })
          .strict()
      )
      .max(30)
      .default([]),
    apis: z
      .array(
        z.object({ id: Id, serviceId: Id, method: Text, route: Text, protocol: Text }).strict()
      )
      .max(80)
      .default([]),
    storage: z
      .array(z.object({ entityId: Id, stores: z.array(Id).max(50), technology: Text }).strict())
      .max(30)
      .default([]),
    topology: z
      .array(z.object({ entityId: Id, hosts: z.array(Id).max(30), communication: Text }).strict())
      .max(30)
      .default([]),
  })
  .strict();
export const SystemSpecification = SystemModel.superRefine((s, ctx) => {
  const ids = new Set(s.entities.map((e) => e.id));
  const fail = (message: string) => ctx.addIssue({ code: 'custom', message });
  if (ids.size !== s.entities.length) fail('Duplicate specification entity ID');
  if (
    !s.requirements.length ||
    !s.entities.length ||
    !s.modules.length ||
    !s.workflows.length ||
    !s.topology.length
  )
    fail('Specification must include requirements, entities, modules, workflows and topology');
  const refs = [
    ...s.roles.map((r) => r.entityId),
    ...s.relationships.flatMap((r) => [r.sourceId, r.targetId]),
    ...s.modules.flatMap((m) => [m.entityId, ...m.dependencies]),
    ...s.workflows.flatMap((w) => w.entityIds),
    ...s.apis.map((a) => a.serviceId),
    ...s.storage.flatMap((d) => [d.entityId, ...d.stores]),
    ...s.topology.flatMap((t) => [t.entityId, ...t.hosts]),
  ];
  for (const id of refs) if (!ids.has(id)) fail(`Unknown specification entity: ${id}`);
});
export const emptySystem = (): z.infer<typeof SystemModel> =>
  SystemModel.parse({ name: 'Untitled system', requirements: [], assumptions: [], entities: [] });
export const DiagramTab = z
  .object({
    id: Id,
    title: Text.min(1).max(160),
    graph: Graph,
    canvas: z.record(z.unknown()).nullable(),
    manuallyEdited: z.boolean(),
    origin: z.enum(['manual', 'ai', 'legacy']),
  })
  .strict();
export const WorkspaceBase = z
  .object({
    schemaVersion: z.literal(2),
    prompt: z.string().max(12000).default(''),
    system: SystemModel,
    diagrams: z.array(DiagramTab).min(1).max(35),
    activeDiagramId: Id,
  })
  .strict();
export const Workspace = WorkspaceBase.superRefine((w, ctx) => {
  const fail = (message: string) => ctx.addIssue({ code: 'custom', message });
  const ids = new Set<string>();
  const entities = new Map(w.system.entities.map((e) => [e.id, e]));
  if (entities.size !== w.system.entities.length) fail('Duplicate shared entity ID');
  for (const d of w.diagrams) {
    if (ids.has(d.id)) fail('Duplicate diagram ID');
    ids.add(d.id);
    for (const c of d.graph.components)
      if (c.entityId) {
        const e = entities.get(c.entityId);
        if (!e) fail(`Missing system entity: ${c.entityId}`);
        else if (
          ![
            'state',
            'initial_state',
            'final_state',
            'composite_state',
            'action',
            'decision',
            'merge',
            'fork',
            'join',
            'start',
            'end',
            'activation',
            'fragment',
            'swimlane',
            'use_case',
            'artifact',
            'execution_environment',
          ].includes(c.kind) &&
          e.name !== c.name
        )
          fail(`Shared entity name conflict: ${c.name} / ${e.name}`);
      }
  }
  if (!ids.has(w.activeDiagramId)) fail('Active diagram is missing');
});
export type StudioWorkspace = z.infer<typeof Workspace>;
export type SystemModelType = z.infer<typeof SystemModel>;
export type DiagramTabType = z.infer<typeof DiagramTab>;
export const GeneratedWorkspace = z
  .object({
    system: SystemModel,
    diagrams: z
      .array(z.object({ title: Text.min(1).max(160), graph: GraphBase }).strict())
      .min(1)
      .max(7),
  })
  .strict();
export function newWorkspace(
  graph = emptyGraph(),
  canvas: Record<string, unknown> | null = null
): StudioWorkspace {
  return {
    schemaVersion: 2,
    prompt: '',
    system: emptySystem(),
    diagrams: [
      {
        id: 'diagram_main',
        title: diagramLabels[graph.diagramType],
        graph,
        canvas,
        manuallyEdited: false,
        origin: 'manual',
      },
    ],
    activeDiagramId: 'diagram_main',
  };
}
export function migrateWorkspace(
  value: unknown,
  graph?: unknown,
  canvas?: Record<string, unknown> | null
): StudioWorkspace {
  return value
    ? Workspace.parse(value)
    : newWorkspace(migrateGraph(graph ?? emptyGraph()), canvas ?? null);
}
export function activeDiagram(w: StudioWorkspace) {
  return w.diagrams.find((d) => d.id === w.activeDiagramId)!;
}
export function validateGenerated(value: unknown, only?: DiagramGraph['diagramType']) {
  const result = GeneratedWorkspace.parse(value);
  const types = new Set<string>();
  for (const d of result.diagrams) {
    Graph.parse(d.graph);
    if (types.has(d.graph.diagramType))
      throw new Error('Generation returned duplicate diagram types');
    types.add(d.graph.diagramType);
    if (!d.graph.components.length) throw new Error('Generated diagram is empty');
  }
  if (only && (result.diagrams.length !== 1 || result.diagrams[0].graph.diagramType !== only))
    throw new Error('Explicit diagram selection must generate only that type');
  Workspace.parse({
    schemaVersion: 2,
    system: result.system,
    diagrams: result.diagrams.map((d, i) => ({
      ...d,
      id: `generated_${i}`,
      canvas: null,
      manuallyEdited: false,
      origin: 'ai',
    })),
    activeDiagramId: 'generated_0',
  });
  return result;
}
export function consistencyWarnings(w: StudioWorkspace) {
  const warnings: string[] = [];
  for (const d of w.diagrams)
    for (const c of d.graph.components) {
      if (c.entityId) {
        const e = w.system.entities.find((e) => e.id === c.entityId);
        if (e && c.description && e.responsibility !== c.description)
          warnings.push(`${d.title}: ${c.name} has a local responsibility override`);
      }
    }
  return warnings;
}
