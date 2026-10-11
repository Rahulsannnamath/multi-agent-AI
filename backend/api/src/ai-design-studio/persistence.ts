import mongoose, { Schema } from 'mongoose';
import { gzipSync, gunzipSync } from 'node:zlib';
import { z } from 'zod';
import { Graph, Text, Workspace, activeDiagram, migrateWorkspace } from '@multi-agent/ai-design-studio';

export const Payload = z.object({ title: Text.min(1).max(160), graph: Graph, canvas: z.record(z.unknown()).nullable(), workspace: Workspace.optional(), chat: z.array(z.object({ role: z.enum(['user','assistant']), content: Text })).max(100) }).strict();
export type StudioPayload = z.infer<typeof Payload>;
export const SaveRequest = Payload.extend({ revision: z.number().int().nonnegative() });
type Entry = { revision: number; savedAt: Date; payload: string };
interface StudioDocument { designId: string; owner: string; title: string; revision: number; payload: string; versions: Entry[]; createdAt: Date; updatedAt: Date }
const entrySchema = new Schema<Entry>({ revision: { type: Number, required: true }, savedAt: { type: Date, required: true }, payload: { type: String, required: true } }, { _id: false });
const schema = new Schema<StudioDocument>({ designId: { type: String, required: true, unique: true }, owner: { type: String, required: true }, title: { type: String, required: true }, revision: { type: Number, required: true }, payload: { type: String, required: true }, versions: { type: [entrySchema], required: true } }, { timestamps: true, collection: 'ai_design_studio_designs' });
schema.index({ owner: 1, updatedAt: -1 });
export const StudioDesign = mongoose.model<StudioDocument>('AiDesignStudioDesign', schema);
export function encode(payload: StudioPayload) {
  const workspace = migrateWorkspace(payload.workspace,payload.graph,payload.canvas);
  const tab = activeDiagram(workspace);
  const raw = JSON.stringify(Payload.parse({ ...payload, workspace, graph: tab.graph, canvas: tab.canvas }));
  if (Buffer.byteLength(raw) > 7_000_000) throw new Error('Design exceeds the 7 MB snapshot limit');
  return gzipSync(raw).toString('base64');
}
export function decode(payload: string): StudioPayload { const raw = JSON.parse(gunzipSync(Buffer.from(payload, 'base64'), { maxOutputLength: 7_000_000 }).toString()); const workspace = migrateWorkspace(raw.workspace,raw.graph,raw.canvas); const tab=activeDiagram(workspace); return Payload.parse({ ...raw,workspace,graph:tab.graph,canvas:tab.canvas }); }
export class ConflictError extends Error {}
export async function saveRevision(designId: string, owner: string, revision: number, payload: StudioPayload) {
  const packed = encode(payload);
  const current = await StudioDesign.findOne({ designId, owner });
  if (!current) return null;
  if (current.revision !== revision) throw new ConflictError('This design changed elsewhere. Reload or duplicate your local draft before saving.');
  // A single document CAS also appends history atomically on standalone MongoDB.
  const kept = current.versions.slice(-49);
  if (kept.reduce((total, v) => total + v.payload.length, packed.length * 2) > 14_000_000) throw new Error('Version storage limit reached. Duplicate this design to begin a new history.');
  const updated = await StudioDesign.findOneAndUpdate({ designId, owner, revision }, { $set: { title: payload.title, payload: packed }, $inc: { revision: 1 }, $push: { versions: { $each: [{ revision: revision + 1, savedAt: new Date(), payload: packed }], $slice: -50 } } }, { new: true });
  if (!updated) throw new ConflictError('Revision conflict');
  return updated;
}
