import { Router, type Request, type Response, type NextFunction } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { Graph, DiagramType, SystemModel, Id, Plan, applyOperations, emptyGraph, umlExport } from '@multi-agent/ai-design-studio';
import { authenticate, rateLimit, signSession, studioUsers, verifyPassword } from './auth.js';
import { AiError, generateDiagram, generateProject, editDiagram, explainDiagram } from './ai.js';
import { ConflictError, Payload, SaveRequest, StudioDesign, decode, encode, saveRevision } from './persistence.js';

import {startGeneration,generationStatus,retryGeneration} from './generation.js';
export const studioRouter = Router();
const route = (handler: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) => { Promise.resolve(handler(req, res)).catch(next); };
const owner = (res: Response) => String(res.locals['studioOwner']);
const document = async (req: Request, res: Response) => {
  const doc = await StudioDesign.findOne({ designId: Id.parse(req.params['id']), owner: owner(res) });
  if (!doc) res.status(404).json({ error: 'Design not found' });
  return doc;
};
const publicDoc = (doc: { designId: string; revision: number; payload: string }) => ({ designId: doc.designId, revision: doc.revision, ...decode(doc.payload) });
studioRouter.post('/session', rateLimit('login', 10), route(async (req, res) => {
  const { username, password } = z.object({ username: z.string().max(80), password: z.string().max(1024) }).strict().parse(req.body);
  const users = studioUsers();
  if (!Object.keys(users).length) return res.status(503).json({ error: 'Studio login is not configured. Run the studio setup command on the server.' });
  const valid = verifyPassword(password, users[username] ?? '00000000000000000000000000000000:' + '0'.repeat(128));
  if (!valid || !Object.hasOwn(users, username)) return res.status(401).json({ error: 'Invalid username or password' });
  return res.json({ token: signSession(username), username });
}));
studioRouter.use(authenticate, rateLimit('studio', 180));
studioRouter.get('/session', (_req, res) => res.json({ username: owner(res), model: process.env['OPENAI_MODEL'] ?? 'gpt-4o' }));
studioRouter.post('/designs', route(async (req, res) => {
  const body = z.object({ title: z.string().min(1).max(160), diagramType: DiagramType.optional(), payload: Payload.optional() }).strict().parse(req.body);
  const payload = body.payload ?? { title: body.title, graph: emptyGraph(body.diagramType), canvas: null, chat: [] };
  payload.title = body.title;
  const packed = encode(payload);
  const doc = await StudioDesign.create({ designId: randomUUID(), owner: owner(res), title: body.title, revision: 0, payload: packed, versions: [{ revision: 0, savedAt: new Date(), payload: packed }] });
  return res.status(201).json(publicDoc(doc));
}));
studioRouter.get('/designs', route(async (_req, res) => res.json(await StudioDesign.find({ owner: owner(res) }, { designId: 1, title: 1, revision: 1, updatedAt: 1, _id: 0 }).sort({ updatedAt: -1 }))));
studioRouter.get('/designs/:id', route(async (req, res) => { const doc = await document(req, res); if (doc) res.json(publicDoc(doc)); }));
studioRouter.put('/designs/:id', route(async (req, res) => {
  const { revision, ...payload } = SaveRequest.parse(req.body);
  const doc = await saveRevision(Id.parse(req.params['id']), owner(res), revision, payload);
  return doc ? res.json({ designId: doc.designId, revision: doc.revision }) : res.status(404).json({ error: 'Design not found' });
}));
studioRouter.delete('/designs/:id', route(async (req, res) => { const doc = await document(req, res); if (!doc) return; const { revision } = z.object({ revision: z.number().int().nonnegative() }).strict().parse(req.body); if (doc.revision !== revision) throw new ConflictError('Revision conflict'); const result = await StudioDesign.deleteOne({ designId: doc.designId, owner: owner(res), revision }); if (!result.deletedCount) throw new ConflictError('Revision conflict'); res.status(204).end(); }));
studioRouter.get('/designs/:id/versions', route(async (req, res) => { const doc = await document(req, res); if (doc) res.json(doc.versions.map(v => ({ revision: v.revision, savedAt: v.savedAt }))); }));
studioRouter.post('/designs/:id/restore', route(async (req, res) => {
  const doc = await document(req, res); if (!doc) return;
  const body = z.object({ revision: z.number().int().nonnegative(), version: z.number().int().nonnegative() }).strict().parse(req.body);
  const version = doc.versions.find(v => v.revision === body.version); if (!version) return res.status(404).json({ error: 'Version not retained' });
  const updated = await saveRevision(doc.designId, owner(res), body.revision, decode(version.payload)); if (updated) res.json(publicDoc(updated));
}));
studioRouter.post('/designs/:id/operations', route(async (req, res) => {
  const doc = await document(req, res); if (!doc) return;
  const { plan, payload } = z.object({ plan: Plan, payload: Payload }).strict().parse(req.body);
  const graph = applyOperations(payload.graph, plan.operations);
  const workspace = payload.workspace ? { ...payload.workspace, diagrams: payload.workspace.diagrams.map(tab => tab.id === payload.workspace!.activeDiagramId ? { ...tab, graph } : tab) } : undefined; const updated = await saveRevision(doc.designId, owner(res), plan.revision, { ...payload, graph, workspace }); if (updated) res.json(publicDoc(updated));
}));
studioRouter.post('/designs/:id/export', route(async (req, res) => {
  const doc = await document(req, res); if (!doc) return;
  const { format } = z.object({ format: z.enum(['json','mermaid','plantuml']) }).strict().parse(req.body);
  return res.json(format === 'json' ? { text: JSON.stringify(publicDoc(doc), null, 2), warnings: [] } : umlExport(decode(doc.payload).graph, format));
}));
const prompt = z.string().trim().min(1).max(12000);
studioRouter.post('/generate-all',rateLimit('ai',8),route(async(req,res)=>{const body=z.object({prompt}).strict().parse(req.body);res.status(202).json(await startGeneration(owner(res),body.prompt));}));
studioRouter.get('/generation/:id',route(async(req,res)=>{const result=await generationStatus(owner(res),Id.parse(req.params['id']));return result?res.json(result):res.status(404).json({error:'Generation not found'});}));
studioRouter.post('/generation/:id/retry',rateLimit('ai',8),route(async(req,res)=>{const result=await retryGeneration(owner(res),Id.parse(req.params['id']));return result?res.status(202).json(result):res.status(404).json({error:'Generation not found'});}));
studioRouter.post('/generate-project', rateLimit('ai',8), route(async (req,res) => { const body=z.object({prompt,diagramType:z.union([DiagramType,z.literal('auto')]),system:SystemModel.optional(),graphs:z.array(Graph).max(35).optional(),onlyTypes:z.array(DiagramType).min(1).max(7).optional()}).strict().parse(req.body); res.json(await generateProject(body.prompt,body.diagramType,body.system,body.graphs,body.onlyTypes)); }));
 studioRouter.post('/generate', rateLimit('ai', 8), route(async (req, res) => { const body = z.object({ prompt, diagramType: DiagramType, constraints: z.string().max(8000).optional(), source: Graph.optional() }).strict().parse(req.body); res.json({ graph: await generateDiagram(body.prompt, body.diagramType, body.constraints, body.source) }); }));
studioRouter.post('/edit', rateLimit('ai', 8), route(async (req, res) => { const body = z.object({ graph: Graph, selectedIds: z.array(Id).max(200), instruction: prompt, revision: z.number().int().nonnegative() }).strict().parse(req.body); if (body.selectedIds.some(id => !body.graph.components.some(c => c.id === id) && !body.graph.connections.some(c => c.id === id))) return res.status(400).json({ error: 'Selected component is missing' }); res.json(await editDiagram(body.graph, body.selectedIds, body.instruction, body.revision)); }));
studioRouter.post('/explain', rateLimit('ai', 8), route(async (req, res) => { const body = z.object({ graph: Graph, question: prompt }).strict().parse(req.body); res.json(await explainDiagram(body.graph, body.question)); }));
studioRouter.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof z.ZodError) { res.status(400).json({ error: 'Invalid studio data', details: err.issues.map(i => i.message).slice(0, 10) }); return; }
  if (err instanceof ConflictError) { res.status(409).json({ error: err.message }); return; }
  if (err instanceof AiError) { res.status(/429|rate/i.test(err.message) ? 429 : 502).json({ error: `AI request failed: ${err.message}` }); return; }
  console.error('[ai-design-studio]', err instanceof Error ? err.message : 'Request failed');
  res.status(500).json({ error: 'Studio request failed. Check server configuration and database availability.' });
});

