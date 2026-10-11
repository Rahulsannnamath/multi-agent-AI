import { z } from 'zod';
import { Attribute, Component, Connection, Graph, Id, Method, type DiagramGraph } from './schema.js';
const componentPatch = Component.omit({ id: true, attributes: true, methods: true }).partial().strict().refine(p => Object.keys(p).length > 0, 'Empty patch');
const connectionPatch = Connection.omit({ id: true }).partial().strict().refine(p => Object.keys(p).length > 0, 'Empty patch');
export const Operation = z.discriminatedUnion('type', [
  z.object({ type: z.literal('add_component'), component: Component }).strict(),
  z.object({ type: z.literal('update_component'), id: Id, patch: componentPatch }).strict(),
  z.object({ type: z.literal('remove_component'), id: Id }).strict(),
  z.object({ type: z.literal('add_connection'), connection: Connection }).strict(),
  z.object({ type: z.literal('update_connection'), id: Id, patch: connectionPatch }).strict(),
  z.object({ type: z.literal('remove_connection'), id: Id }).strict(),
  z.object({ type: z.literal('add_attribute'), componentId: Id, attribute: Attribute }).strict(),
  z.object({ type: z.literal('update_attribute'), componentId: Id, id: Id, patch: Attribute.omit({ id: true }).partial().strict() }).strict(),
  z.object({ type: z.literal('remove_attribute'), componentId: Id, id: Id }).strict(),
  z.object({ type: z.literal('add_method'), componentId: Id, method: Method }).strict(),
  z.object({ type: z.literal('update_method'), componentId: Id, id: Id, patch: Method.omit({ id: true }).partial().strict() }).strict(),
  z.object({ type: z.literal('remove_method'), componentId: Id, id: Id }).strict(),
]);
export const Plan = z.object({ revision: z.number().int().nonnegative(), summary: z.string().max(4000), operations: z.array(Operation).min(1).max(100) }).strict();
export type DiagramOperation = z.infer<typeof Operation>;
export type OperationPlan = z.infer<typeof Plan>;
export function applyOperations(graph: DiagramGraph, input: unknown): DiagramGraph {
  const operations = z.array(Operation).max(100).parse(input);
  const result = structuredClone(Graph.parse(graph));
  const requireIndex = (i: number) => { if (i < 0) throw new Error('Operation refers to a missing element'); return i; };
  for (const op of operations) {
    if (op.type === 'add_component') result.components.push(op.component);
    else if (op.type === 'update_component') Object.assign(result.components[requireIndex(result.components.findIndex(c => c.id === op.id))], op.patch);
    else if (op.type === 'remove_component') {
      result.components.splice(requireIndex(result.components.findIndex(c => c.id === op.id)), 1);
      result.connections = result.connections.filter(e => e.source !== op.id && e.target !== op.id);
      const removed = result.components.filter(c => c.kind === 'activation' && c.parentId === op.id).map(c => c.id);
      result.components = result.components.filter(c => !removed.includes(c.id));
      for (const e of result.connections) if (e.fragmentId === op.id) e.fragmentId = null;
      const remaining = new Set(result.connections.map(e => e.id));
      result.connections = result.connections.filter(e => e.kind !== 'return_message' || remaining.has(e.replyTo ?? ''));
      for (const c of result.components) if (c.parentId === op.id) c.parentId = null;
    } else if (op.type === 'add_connection') result.connections.push(op.connection);
    else if (op.type === 'update_connection') Object.assign(result.connections[requireIndex(result.connections.findIndex(e => e.id === op.id))], op.patch);
    else if (op.type === 'remove_connection') { result.connections.splice(requireIndex(result.connections.findIndex(e => e.id === op.id)), 1); result.connections = result.connections.filter(e => e.replyTo !== op.id); }
    else {
      const c = result.components[requireIndex(result.components.findIndex(c => c.id === op.componentId))];
      if (op.type === 'add_attribute') c.attributes.push(op.attribute);
      else if (op.type === 'add_method') c.methods.push(op.method);
      else if (op.type === 'update_attribute') Object.assign(c.attributes[requireIndex(c.attributes.findIndex(a => a.id === op.id))], op.patch);
      else if (op.type === 'remove_attribute') c.attributes.splice(requireIndex(c.attributes.findIndex(a => a.id === op.id)), 1);
      else if (op.type === 'update_method') Object.assign(c.methods[requireIndex(c.methods.findIndex(a => a.id === op.id))], op.patch);
      else if (op.type === 'remove_method') c.methods.splice(requireIndex(c.methods.findIndex(a => a.id === op.id)), 1);
    }
  }
  return Graph.parse(result);
}
