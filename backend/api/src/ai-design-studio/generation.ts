import mongoose, { Schema } from 'mongoose';
import { randomUUID } from 'node:crypto';
import type { LLMProvider } from '@multi-agent/llm';
import {
  SystemModel,
  SystemSpecification,
  Graph,
  Workspace,
  generationTypes,
  diagramLabels,
  layoutDiagram,
  activeDiagram,
  type DiagramTabType,
  type GeneratedDiagramType,
  type SystemModelType,
  type StudioWorkspace,
} from '@multi-agent/ai-design-studio';
import { generateDiagram, validatedResponse, providerFromConfig } from './ai.js';
import { StudioDesign, encode, decode } from './persistence.js';
export type GenerationState = {
  status: 'waiting' | 'generating' | 'layout' | 'ready' | 'failed';
  attempt: number;
  error?: string;
};
export type GenerationProgress = {
  type: GeneratedDiagramType;
  state: GenerationState;
  diagram?: DiagramTabType;
};
export async function analyzeSystem(prompt: string, provider = providerFromConfig()) {
  return validatedResponse(
    provider,
    SystemModel,
    JSON.stringify({
      task: 'Analyze this system once for seven consistent diagrams: Class, Sequence, Activity, Use Case, Component, Deployment, Architecture. Produce a compact complete shared specification. Include functional and non-functional requirements, human/external actors and capabilities, domain entities and relationships, software modules/services and dependencies, one critical workflow, APIs/communication, storage and a reasonable deployment topology. All entityId, dependency, sourceId, targetId, hosts and stores references must exist in entities. Avoid unnecessary services. Make reasonable explicit assumptions rather than asking questions. Supply at least one requirement, module, workflow and topology item. No coordinates.',
      prompt,
    }),
    (value) => SystemSpecification.parse(value)
  );
}
export async function generateSeven(
  prompt: string,
  spec: SystemModelType,
  onProgress: (progress: GenerationProgress) => Promise<void>,
  completed: Partial<Record<GeneratedDiagramType, DiagramTabType>> = {},
  provider: LLMProvider = providerFromConfig()
) {
  const results = { ...completed },
    errors: Partial<Record<GeneratedDiagramType, string>> = {};
  let cursor = 0;
  const queue = generationTypes.filter((type) => !results[type]);
  const worker = async () => {
    while (cursor < queue.length) {
      const type = queue[cursor++];
      let error = '';
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          await onProgress({ type, state: { status: 'generating', attempt } });
          const graph = await generateDiagram(
            prompt,
            type,
            JSON.stringify({
              sharedSpecification: spec,
              instruction:
                'Use this specification as the source of truth. Preserve entity IDs and canonical names for direct representations. Every diagram must have meaningful nodes and at least one valid relationship. Focus on the diagram-specific view: domain classes, critical interaction, complete workflow, capabilities, software modules/interfaces, execution/artifacts or overall infrastructure. Use entityId references; states/actions/use cases describe behavior. Do not invent unrelated systems.',
              repair: error,
            }),
            undefined,
            provider
          );
          Graph.parse(graph);
          if (!graph.connections.length) throw new Error('Diagram has no meaningful relationships');
          Workspace.parse({
            schemaVersion: 2,
            system: spec,
            diagrams: [
              {
                id: type,
                title: diagramLabels[type],
                graph,
                canvas: null,
                origin: 'ai',
                manuallyEdited: false,
              },
            ],
            activeDiagramId: type,
          });
          await onProgress({ type, state: { status: 'layout', attempt } });
          const layout = await layoutDiagram(graph);
          const canvas = { engine: 'tldraw-layout', schemaVersion: 1, layout };
          const diagram: DiagramTabType = {
            id: `diagram_${type}`,
            title: diagramLabels[type],
            graph,
            canvas,
            origin: 'ai',
            manuallyEdited: false,
          };
          results[type] = diagram;
          await onProgress({ type, state: { status: 'ready', attempt }, diagram });
          break;
        } catch (e) {
          error = e instanceof Error ? e.message : 'Diagram generation failed';
          if (attempt === 2) {
            errors[type] = error;
            await onProgress({ type, state: { status: 'failed', attempt, error } });
          }
          if (/401|403|authentication|api key|quota/i.test(error)) break;
        }
      }
      if (!results[type] && !errors[type]) {
        errors[type] = error;
        await onProgress({ type, state: { status: 'failed', attempt: 1, error } });
      }
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  return { results, errors };
}
interface Job {
  jobId: string;
  owner: string;
  prompt: string;
  runnerId: string;
  status: 'analyzing' | 'generating' | 'saving' | 'ready' | 'failed';
  error: string;
  spec?: SystemModelType;
  results: Partial<Record<GeneratedDiagramType, DiagramTabType>>;
  states: Record<GeneratedDiagramType, GenerationState>;
  designId?: string;
  expiresAt: Date;
}
const schema = new Schema<Job>(
  {
    jobId: { type: String, unique: true, required: true },
    owner: { type: String, required: true },
    prompt: { type: String, required: true },
    runnerId: String,
    status: String,
    error: String,
    spec: Schema.Types.Mixed,
    results: { type: Schema.Types.Mixed, default: {} },
    states: Schema.Types.Mixed,
    designId: String,
    expiresAt: { type: Date, index: { expireAfterSeconds: 0 } },
  },
  { timestamps: true, collection: 'ai_design_studio_generation_jobs' }
);
schema.index({ owner: 1, jobId: 1 });
export const StudioGeneration = mongoose.model<Job>('AiDesignStudioGeneration', schema);
const runnerId = randomUUID(),
  running = new Set<string>();
export function partialWorkspace(job: Job): StudioWorkspace | null {
  const diagrams = generationTypes.flatMap((type) =>
    job.results[type] ? [job.results[type]!] : []
  );
  return job.spec && diagrams.length
    ? Workspace.parse({
        schemaVersion: 2,
        prompt: job.prompt,
        system: job.spec,
        diagrams,
        activeDiagramId: diagrams.find((d) => d.graph.diagramType === 'hld')?.id ?? diagrams[0].id,
      })
    : null;
}
async function run(jobId: string) {
  if (running.has(jobId)) return;
  running.add(jobId);
  try {
    const job = await StudioGeneration.findOne({ jobId });
    if (!job) return;
    let spec = job.spec;
    if (!spec) {
      spec = await analyzeSystem(job.prompt);
      await StudioGeneration.updateOne({ jobId }, { $set: { spec, status: 'generating' } });
    } else await StudioGeneration.updateOne({ jobId }, { $set: { status: 'generating' } });
    const result = await generateSeven(
      job.prompt,
      spec,
      async (progress) => {
        await StudioGeneration.updateOne(
          { jobId },
          {
            $set: {
              [`states.${progress.type}`]: progress.state,
              ...(progress.diagram ? { [`results.${progress.type}`]: progress.diagram } : {}),
            },
          }
        );
      },
      job.results
    );
    if (Object.keys(result.errors).length) {
      await StudioGeneration.updateOne(
        { jobId },
        {
          $set: {
            status: 'failed',
            error:
              'Some diagrams failed. Completed diagrams are retained; retry resumes only missing diagrams.',
          },
        }
      );
      return;
    }
    await StudioGeneration.updateOne({ jobId }, { $set: { status: 'saving' } });
    const workspace = Workspace.parse({
        schemaVersion: 2,
        prompt: job.prompt,
        system: spec,
        diagrams: generationTypes.map((type) => result.results[type]!),
        activeDiagramId: 'diagram_hld',
      }),
      active = activeDiagram(workspace),
      title = spec.name.slice(0, 160) || 'System design',
      packed = encode({
        title,
        workspace,
        graph: active.graph,
        canvas: active.canvas,
        chat: [{ role: 'user', content: job.prompt.slice(0, 4000) }],
      });
    await StudioDesign.findOneAndUpdate(
      { designId: jobId, owner: job.owner },
      {
        $setOnInsert: {
          designId: jobId,
          owner: job.owner,
          title,
          revision: 0,
          payload: packed,
          versions: [{ revision: 0, savedAt: new Date(), payload: packed }],
        },
      },
      { upsert: true }
    );
    await StudioGeneration.updateOne(
      { jobId },
      { $set: { status: 'ready', designId: jobId, error: '' } }
    );
  } catch (e) {
    await StudioGeneration.updateOne(
      { jobId },
      { $set: { status: 'failed', error: e instanceof Error ? e.message : 'Generation failed' } }
    );
  } finally {
    running.delete(jobId);
  }
}
export async function startGeneration(owner: string, prompt: string) {
  const jobId = randomUUID(),
    states = Object.fromEntries(
      generationTypes.map((type) => [type, { status: 'waiting', attempt: 0 }])
    ) as Record<GeneratedDiagramType, GenerationState>;
  await StudioGeneration.create({
    jobId,
    owner,
    prompt,
    runnerId,
    status: 'analyzing',
    error: '',
    states,
    results: {},
    expiresAt: new Date(Date.now() + 86400000),
  });
  void run(jobId);
  return { jobId };
}
export async function generationStatus(owner: string, jobId: string) {
  const job = await StudioGeneration.findOne({ jobId, owner });
  if (!job) return null;
  if (job.runnerId !== runnerId && !['failed', 'ready'].includes(job.status)) {
    job.status = 'failed';
    job.error = 'Server restarted during generation. Retry resumes completed work.';
    await job.save();
  }
  const document = job.designId
    ? await StudioDesign.findOne({ designId: job.designId, owner })
    : null;
  return {
    jobId,
    status: job.status,
    error: job.error,
    states: job.states,
    workspace: partialWorkspace(job),
    document: document
      ? { designId: document.designId, revision: document.revision, ...decode(document.payload) }
      : null,
  };
}
export async function retryGeneration(owner: string, jobId: string) {
  const job = await StudioGeneration.findOne({ jobId, owner });
  if (!job) return null;
  if (job.status === 'ready') return { jobId };
  if (job.status !== 'failed') return { jobId };
  await StudioGeneration.updateOne(
    { jobId, owner },
    { $set: { status: job.spec ? 'generating' : 'analyzing', runnerId, error: '' } }
  );
  void run(jobId);
  return { jobId };
}
