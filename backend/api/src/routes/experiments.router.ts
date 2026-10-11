// apps/api/src/routes/experiments.router.ts
import { Router, type Request, type Response } from 'express';
import { randomUUID } from 'crypto';
import { ExperimentModel } from '../db/models/experiment.model.js';
import { ProjectModel } from '../db/models/project.model.js';
import { computeComparisonMetrics } from '@multi-agent/evaluator';
import type { ProjectState } from '@multi-agent/schemas';

export const experimentsRouter = Router();

// ── POST /api/experiments ────────────────────────────────────────────────────
experimentsRouter.post('/', async (req: Request, res: Response) => {
  try {
    const {
      name,
      description,
      inputPrompt,
      ollamaModel,
      openaiModel,
      configuration,
    } = req.body as Record<string, unknown>;

    if (!inputPrompt || typeof inputPrompt !== 'string') {
      return res.status(400).json({ error: 'inputPrompt is required' });
    }

    const experimentId = randomUUID();
    const experiment = await ExperimentModel.create({
      experimentId,
      name: name || `Experiment-${experimentId.slice(0, 8)}`,
      description,
      inputPrompt,
      ollamaModel: ollamaModel || process.env['OLLAMA_MODEL'] || 'qwen2.5:0.5b',
      openaiModel: openaiModel || process.env['OPENAI_MODEL'] || 'gpt-4o',
      configuration,
      status: 'pending',
    });

    return res.status(201).json({
      experimentId: experiment.experimentId,
      status: 'pending',
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to create experiment' });
  }
});

// ── GET /api/experiments ─────────────────────────────────────────────────────
experimentsRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const experiments = await ExperimentModel.find({}).sort({ createdAt: -1 }).limit(20);
    return res.json(experiments);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch experiments' });
  }
});

// ── GET /api/experiments/:id ─────────────────────────────────────────────────
experimentsRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const experiment = await ExperimentModel.findOne({ experimentId: req.params['id'] });
    if (!experiment) return res.status(404).json({ error: 'Experiment not found' });
    return res.json(experiment);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch experiment' });
  }
});

// ── POST /api/experiments/:id/run ────────────────────────────────────────────
experimentsRouter.post('/:id/run', async (req: Request, res: Response) => {
  try {
    const experiment = await ExperimentModel.findOne({ experimentId: req.params['id'] });
    if (!experiment) return res.status(404).json({ error: 'Experiment not found' });

    if (experiment.status === 'running') {
      return res.status(409).json({ error: 'Experiment is already running' });
    }

    // Check OpenAI config
    if (!process.env['OPENAI_API_KEY']) {
      return res.status(400).json({
        error: 'OpenAI API key is required for comparison experiments',
        code: 'OPENAI_NOT_CONFIGURED',
      });
    }

    experiment.status = 'running';
    await experiment.save();

    res.json({
      message: 'Experiment started. Both Ollama and OpenAI runs will execute independently.',
      experimentId: experiment.experimentId,
    });

    // Background: create two independent project runs
    runExperiment(experiment).catch(console.error);

    return;
  } catch (err) {
    return res.status(500).json({ error: 'Failed to start experiment' });
  }
});

// ── GET /api/experiments/:id/compare ─────────────────────────────────────────
experimentsRouter.get('/:id/compare', async (req: Request, res: Response) => {
  try {
    const experiment = await ExperimentModel.findOne({ experimentId: req.params['id'] });
    if (!experiment) return res.status(404).json({ error: 'Experiment not found' });

    let ollamaMetrics = experiment.ollamaMetrics;
    let openaiMetrics = experiment.openaiMetrics;

    // Compute metrics from project states if not already computed
    if (experiment.ollamaProjectId && !ollamaMetrics) {
      const ollamaProject = await ProjectModel.findOne({ projectId: experiment.ollamaProjectId });
      if (ollamaProject) {
        ollamaMetrics = computeMetricsFromState(ollamaProject.state as unknown as ProjectState);
      }
    }

    if (experiment.openaiProjectId && !openaiMetrics) {
      const openaiProject = await ProjectModel.findOne({ projectId: experiment.openaiProjectId });
      if (openaiProject) {
        openaiMetrics = computeMetricsFromState(openaiProject.state as unknown as ProjectState);
      }
    }

    // Determine winner
    let winner: string | undefined;
    if (ollamaMetrics && openaiMetrics) {
      const ollamaScore = (ollamaMetrics as Record<string, number>)['overallScore'] ?? 0;
      const openaiScore = (openaiMetrics as Record<string, number>)['overallScore'] ?? 0;
      winner = ollamaScore >= openaiScore ? 'ollama' : 'openai';
    }

    return res.json({
      experimentId: experiment.experimentId,
      status: experiment.status,
      ollama: {
        model: experiment.ollamaModel,
        projectId: experiment.ollamaProjectId,
        metrics: ollamaMetrics,
      },
      openai: {
        model: experiment.openaiModel,
        projectId: experiment.openaiProjectId,
        metrics: openaiMetrics,
      },
      winner,
      note: 'Comparison based on deterministic metrics. No LLM judge used.',
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to compute comparison' });
  }
});

// ─── Helper functions ─────────────────────────────────────────────────────────

async function runExperiment(experiment: InstanceType<typeof ExperimentModel>) {
  const { Orchestrator } = await import('@multi-agent/orchestrator');

  const createProjectAndRun = async (
    provider: 'ollama' | 'openai',
    model: string
  ): Promise<string | undefined> => {
    try {
      const projectId = randomUUID();
      const now = new Date();
      const state: ProjectState = {
        projectId,
        originalPrompt: experiment.inputPrompt,
        projectName: `${experiment.name}-${provider}`,
        status: 'running',
        currentStage: 'INTAKE',
        provider,
        model,
        autonomousMode: true,
        maxArchitectureIterations: 2,
        maxDebugIterations: 3,
        maxAgentRetries: 2,
        sandboxTimeout: 300000,
        requireApprovals: false,
        debugIterations: [],
        currentDebugIteration: 0,
        architectureRevisions: 0,
        events: [],
        metadata: { createdAt: now, updatedAt: now },
      };

      await ProjectModel.create({
        projectId,
        projectName: state.projectName,
        originalPrompt: experiment.inputPrompt,
        status: 'running',
        currentStage: 'INTAKE',
        provider,
        model,
        autonomousMode: true,
        maxArchitectureIterations: 2,
        maxDebugIterations: 3,
        maxAgentRetries: 2,
        requireApprovals: false,
        state,
      });

      const orchestrator = new Orchestrator(() => {}); // no SSE for background
      const finalState = await orchestrator.run(
        state,
        {
          provider,
          model,
          maxArchitectureIterations: 2,
          maxDebugIterations: 3,
          maxAgentRetries: 2,
          requireApprovals: false,
          autonomousMode: true,
          openaiApiKey: process.env['OPENAI_API_KEY'],
          ollamaBaseUrl: process.env['OLLAMA_BASE_URL'],
        },
        async (updated) => {
          await ProjectModel.updateOne(
            { projectId },
            { status: updated.status, currentStage: updated.currentStage, state: updated }
          );
        }
      );

      return projectId;
    } catch (err) {
      console.error(`[experiment] ${provider} run failed:`, err);
      return undefined;
    }
  };

  // Run BOTH providers — they are isolated (no shared state)
  const [ollamaId, openaiId] = await Promise.allSettled([
    createProjectAndRun('ollama', experiment.ollamaModel),
    createProjectAndRun('openai', experiment.openaiModel),
  ]).then((results) =>
    results.map((r) => (r.status === 'fulfilled' ? r.value : undefined))
  );

  // Compute metrics
  let ollamaMetrics, openaiMetrics;

  if (ollamaId) {
    const proj = await ProjectModel.findOne({ projectId: ollamaId });
    if (proj) ollamaMetrics = computeMetricsFromState(proj.state as unknown as ProjectState);
  }

  if (openaiId) {
    const proj = await ProjectModel.findOne({ projectId: openaiId });
    if (proj) openaiMetrics = computeMetricsFromState(proj.state as unknown as ProjectState);
  }

  await ExperimentModel.updateOne(
    { experimentId: experiment.experimentId },
    {
      status: 'completed',
      ollamaProjectId: ollamaId,
      openaiProjectId: openaiId,
      ollamaMetrics,
      openaiMetrics,
    }
  );
}

function computeMetricsFromState(state: ProjectState) {
  return computeComparisonMetrics({
    requirements: state.requirements
      ? {
          totalRequirements: state.requirements.functionalRequirements.length,
          satisfiedRequirements: state.requirements.functionalRequirements.length,
        }
      : undefined,
    api: state.api
      ? {
          totalEndpoints: state.api.endpoints.length,
          endpointsWithAuth: state.api.endpoints.filter((e) => e.authentication).length,
          endpointsWithRateLimit: state.api.endpoints.filter((e) => e.rateLimited).length,
        }
      : undefined,
    security: state.security ? { score: state.security.securityScore } : undefined,
    evaluation: state.evaluation
      ? {
          passed: state.evaluation.passed,
          overallScore: state.evaluation.overallScore,
          ruleResults: state.evaluation.ruleResults,
        }
      : undefined,
    generation: state.generation
      ? {
          fileCount: state.generation.files.length,
          filesWithTraceability: state.generation.files.filter((f) => f.requirements.length > 0).length,
        }
      : undefined,
    sandbox: state.sandbox
      ? {
          buildSuccess: state.sandbox.buildResult?.success ?? false,
          testPassRate: state.sandbox.testResults?.testPassRate ?? 0,
          healthCheckSuccess: state.sandbox.healthCheckResult?.success ?? false,
          runtimeSuccess: state.sandbox.startResult?.success ?? false,
          repairIterations: state.debugIterations.length,
        }
      : undefined,
    acceptance: state.finalValidation
      ? {
          total: state.finalValidation.totalCount,
          passed: state.finalValidation.passedCount,
        }
      : undefined,
  });
}
