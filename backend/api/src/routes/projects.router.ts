// apps/api/src/routes/projects.router.ts
import { Router, type Request, type Response } from 'express';
import { randomUUID } from 'crypto';
import { ProjectModel } from '../db/models/project.model.js';
import { Orchestrator } from '@multi-agent/orchestrator';
import { sseManager } from '../sse/sse.manager.js';
import type { ProjectState, ProjectStage } from '@multi-agent/schemas';

export const projectsRouter = Router();

// ── POST /api/projects ──────────────────────────────────────────────────────
projectsRouter.post('/', async (req: Request, res: Response) => {
  try {
    const {
      projectName,
      originalPrompt,
      provider = 'openai',
      model,
      autonomousMode = true,
      maxArchitectureIterations = 3,
      maxDebugIterations = 5,
      maxAgentRetries = 3,
      requireApprovals = false,
    } = req.body as Record<string, unknown>;

    if (!originalPrompt || typeof originalPrompt !== 'string') {
      return res.status(400).json({ error: 'originalPrompt is required' });
    }
    if (!provider || (provider !== 'ollama' && provider !== 'openai' && provider !== 'bedrock')) {
      return res.status(400).json({ error: 'provider must be ollama, openai, or bedrock' });
    }

    // Check provider availability
    if (provider === 'openai' && !process.env['OPENAI_API_KEY']) {
      return res.status(400).json({
        error: 'OpenAI is not configured. Set OPENAI_API_KEY environment variable.',
        code: 'OPENAI_NOT_CONFIGURED',
      });
    }
    if (provider === 'bedrock' && (!process.env['AWS_ACCESS_KEY_ID'] || !process.env['AWS_SECRET_ACCESS_KEY'])) {
      return res.status(400).json({
        error: 'AWS Bedrock is not configured. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY environment variables.',
        code: 'BEDROCK_NOT_CONFIGURED',
      });
    }

    const projectId = randomUUID();
    const now = new Date();
    const resolvedModel =
      (model as string) ||
      (provider === 'openai'
        ? process.env['OPENAI_MODEL'] ?? 'gpt-4o'
        : provider === 'bedrock'
        ? process.env['AWS_BEDROCK_MODEL'] ?? 'nvidia.nemotron-super-3-120b'
        : process.env['OLLAMA_MODEL'] ?? 'qwen2.5:0.5b');

    const initialState: ProjectState = {
      projectId,
      originalPrompt: originalPrompt as string,
      projectName: (projectName as string) || `Project-${projectId.slice(0, 8)}`,
      status: 'pending',
      currentStage: 'INTAKE',
      provider: provider as 'ollama' | 'openai',
      model: resolvedModel,
      autonomousMode: Boolean(autonomousMode),
      maxArchitectureIterations: Number(maxArchitectureIterations),
      maxDebugIterations: Number(maxDebugIterations),
      maxAgentRetries: Number(maxAgentRetries),
      sandboxTimeout: 300000,
      requireApprovals: Boolean(requireApprovals),
      debugIterations: [],
      currentDebugIteration: 0,
      architectureRevisions: 0,
      events: [],
      metadata: { createdAt: now, updatedAt: now },
    };

    await ProjectModel.create({
      projectId,
      projectName: initialState.projectName,
      originalPrompt: originalPrompt as string,
      status: 'pending',
      currentStage: 'INTAKE',
      provider,
      llmModel: resolvedModel,
      autonomousMode: Boolean(autonomousMode),
      maxArchitectureIterations: Number(maxArchitectureIterations),
      maxDebugIterations: Number(maxDebugIterations),
      maxAgentRetries: Number(maxAgentRetries),
      requireApprovals: Boolean(requireApprovals),
      state: initialState,
    });

    return res.status(201).json({ projectId, status: 'pending', message: 'Project created' });
  } catch (err) {
    console.error('[projects] POST error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /api/projects ────────────────────────────────────────────────────────
projectsRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const projects = await ProjectModel.find({}, {
      projectId: 1,
      projectName: 1,
      status: 1,
      currentStage: 1,
      provider: 1,
      llmModel: 1,
      createdAt: 1,
      updatedAt: 1,
    }).sort({ createdAt: -1 }).limit(50);
    return res.json(projects);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch projects' });
  }
});

// ── GET /api/projects/:id ────────────────────────────────────────────────────
projectsRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const project = await ProjectModel.findOne({ projectId: req.params['id'] });
    if (!project) return res.status(404).json({ error: 'Project not found' });
    return res.json(project);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch project' });
  }
});

// ── GET /api/projects/:id/state ──────────────────────────────────────────────
projectsRouter.get('/:id/state', async (req: Request, res: Response) => {
  try {
    const project = await ProjectModel.findOne({ projectId: req.params['id'] });
    if (!project) return res.status(404).json({ error: 'Project not found' });
    return res.json(project.state);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch project state' });
  }
});

// ── POST /api/projects/:id/run ───────────────────────────────────────────────
projectsRouter.post('/:id/run', async (req: Request, res: Response) => {
  try {
    const project = await ProjectModel.findOne({ projectId: req.params['id'] });
    if (!project) return res.status(404).json({ error: 'Project not found' });

    if (project.status === 'running') {
      return res.status(409).json({ error: 'Project is already running' });
    }

    // Mark as running
    project.status = 'running';
    await project.save();

    res.json({ message: 'Orchestration started', projectId: project.projectId });

    // Run orchestrator in background (don't await)
    const orchestrator = new Orchestrator((event) => {
      sseManager.sendToProject(project.projectId, {
        type: event.type,
        data: event,
      });
    });

    const state = project.state as unknown as ProjectState;
    state.status = 'running';

    orchestrator
      .run(
        state,
        {
          provider: project.provider as 'ollama' | 'openai',
          model: project.llmModel,
          maxArchitectureIterations: project.maxArchitectureIterations,
          maxDebugIterations: project.maxDebugIterations,
          maxAgentRetries: project.maxAgentRetries,
          requireApprovals: project.requireApprovals,
          autonomousMode: project.autonomousMode,
          openaiApiKey: process.env['OPENAI_API_KEY'],
          ollamaBaseUrl: process.env['OLLAMA_BASE_URL'],
        },
        async (updatedState) => {
          await ProjectModel.updateOne(
            { projectId: project.projectId },
            {
              status: updatedState.status,
              currentStage: updatedState.currentStage,
              state: updatedState,
            }
          );
        }
      )
      .catch((err) => {
        console.error('[orchestrator] Error:', err);
        ProjectModel.updateOne(
          { projectId: project.projectId },
          { status: 'failed' }
        ).catch(console.error);
      });

    return;
  } catch (err) {
    return res.status(500).json({ error: 'Failed to start orchestration' });
  }
});

// ── GET /api/projects/:id/architecture ──────────────────────────────────────
projectsRouter.get('/:id/architecture', async (req: Request, res: Response) => {
  try {
    const project = await ProjectModel.findOne({ projectId: req.params['id'] });
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const state = project.state as unknown as ProjectState;
    return res.json(state.architecture ?? null);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch architecture' });
  }
});

// ── GET /api/projects/:id/evaluation ────────────────────────────────────────
projectsRouter.get('/:id/evaluation', async (req: Request, res: Response) => {
  try {
    const project = await ProjectModel.findOne({ projectId: req.params['id'] });
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const state = project.state as unknown as ProjectState;
    return res.json(state.evaluation ?? null);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch evaluation' });
  }
});

// ── GET /api/projects/:id/logs ────────────────────────────────────────────────
projectsRouter.get('/:id/logs', async (req: Request, res: Response) => {
  try {
    const project = await ProjectModel.findOne({ projectId: req.params['id'] });
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const state = project.state as unknown as ProjectState;
    return res.json(state.events ?? []);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch logs' });
  }
});

// ── GET /api/projects/:id/events (SSE) ────────────────────────────────────────
projectsRouter.get('/:id/events', (req: Request, res: Response) => {
  const projectId = req.params['id'] as string;
  const clientId = randomUUID();

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  // Send initial ping
  res.write(`event: connected\ndata: {"clientId":"${clientId}","projectId":"${projectId}"}\n\n`);

  sseManager.addClient(clientId, projectId, res);

  // Heartbeat every 30s
  const heartbeat = setInterval(() => {
    try {
      res.write(': heartbeat\n\n');
    } catch {
      clearInterval(heartbeat);
    }
  }, 30000);

  req.on('close', () => {
    clearInterval(heartbeat);
    sseManager.removeClient(clientId);
  });
});
