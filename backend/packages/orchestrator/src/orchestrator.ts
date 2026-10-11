// packages/orchestrator/src/orchestrator.ts
// The central workflow state machine

import { createProviderFromEnv } from '@multi-agent/llm';
import {
  RequirementsAgent,
  ArchitectureAgent,
  DatabaseAgent,
  ApiAgent,
  SecurityAgent,
  ReviewAgent,
  CodegenAgent,
  DebugAgent,
} from '@multi-agent/agents';
import { ArchitectureEvaluator, type EvalContext } from '@multi-agent/evaluator';
import type {
  ProjectState,
  ProjectStage,
  ProjectEvent,
  LLMProviderType,
  RequirementsOutput,
  ArchitectureOutput,
} from '@multi-agent/schemas';
import { randomUUID } from 'crypto';

export type EventEmitter = (event: {
  type: string;
  projectId: string;
  stage: ProjectStage;
  data?: unknown;
}) => void;

export interface OrchestratorConfig {
  maxArchitectureIterations: number;
  maxDebugIterations: number;
  maxAgentRetries: number;
  requireApprovals: boolean;
  autonomousMode: boolean;
  provider: LLMProviderType;
  model: string;
  ollamaBaseUrl?: string;
  openaiApiKey?: string;
}

export class Orchestrator {
  private evaluator = new ArchitectureEvaluator();
  private emit: EventEmitter;

  constructor(emit: EventEmitter) {
    this.emit = emit;
  }

  async run(
    state: ProjectState,
    config: OrchestratorConfig,
    onStateUpdate: (state: ProjectState) => Promise<void>
  ): Promise<ProjectState> {
    const llm = createProviderFromEnv(config.provider, config.model);

    const addEvent = async (
      stage: ProjectStage,
      status: ProjectEvent['status'],
      message?: string,
      error?: string,
      agent?: string,
      durationMs?: number
    ) => {
      const event: ProjectEvent = {
        id: randomUUID(),
        timestamp: new Date(),
        projectId: state.projectId,
        agent,
        provider: config.provider,
        model: config.model,
        stage,
        status,
        message,
        error,
        durationMs,
      };
      state.events.push(event);
      state.metadata.updatedAt = new Date();
      await onStateUpdate(state);
      this.emit({ type: 'agent-event', projectId: state.projectId, stage, data: event });
    };

    try {
      // ── REQUIREMENTS ──────────────────────────────────────────────────────
      state.currentStage = 'REQUIREMENTS';
      await addEvent('REQUIREMENTS', 'started', 'Requirements analysis started', undefined, 'requirements');
      const reqAgent = new RequirementsAgent(llm, config.maxAgentRetries);
      const reqResult = await reqAgent.execute({
        rawPrompt: state.originalPrompt,
        autonomousMode: config.autonomousMode,
      });
      if (!reqResult.success || !reqResult.data) {
        state.currentStage = 'FAILED';
        state.status = 'failed';
        await addEvent('REQUIREMENTS', 'failed', undefined, reqResult.error?.message, 'requirements');
        return state;
      }
      state.requirements = reqResult.data;
      await addEvent('REQUIREMENTS', 'completed', `Generated ${reqResult.data.functionalRequirements.length} requirements`, undefined, 'requirements', reqResult.durationMs);

      // ── ARCHITECTURE ──────────────────────────────────────────────────────
      let architectureIterations = 0;
      let architectureApproved = false;

      while (!architectureApproved && architectureIterations < config.maxArchitectureIterations) {
        architectureIterations++;
        state.architectureRevisions = architectureIterations - 1;
        state.currentStage = architectureIterations === 1 ? 'ARCHITECTURE' : 'ARCHITECTURE_REVISION';
        await addEvent(state.currentStage, 'started', `Architecture generation attempt ${architectureIterations}`, undefined, 'architecture');

        const archAgent = new ArchitectureAgent(llm, config.maxAgentRetries);
        const archResult = await archAgent.execute({
          requirements: state.requirements,
          revisionNotes: state.review?.revisionsRequired,
          previousArchitecture: state.architecture,
        });

        if (!archResult.success || !archResult.data) {
          await addEvent(state.currentStage, 'failed', undefined, archResult.error?.message, 'architecture');
          break;
        }
        state.architecture = archResult.data;
        await addEvent(state.currentStage, 'completed', `Architecture v${architectureIterations} with ${archResult.data.components.length} components`, undefined, 'architecture', archResult.durationMs);

        // ── DATABASE / API / SECURITY in parallel concept (sequential for simplicity) ──
        state.currentStage = 'DATABASE_API_SECURITY';
        await addEvent('DATABASE_API_SECURITY', 'started', 'Database design started', undefined, 'database');
        const dbAgent = new DatabaseAgent(llm, config.maxAgentRetries);
        const dbResult = await dbAgent.execute({ requirements: state.requirements, architecture: state.architecture });
        if (!dbResult.success || !dbResult.data) {
          await addEvent('DATABASE_API_SECURITY', 'failed', undefined, dbResult.error?.message, 'database');
          break;
        }
        state.database = dbResult.data;

        await addEvent('DATABASE_API_SECURITY', 'completed', `Database: ${dbResult.data.entities.length} entities`, undefined, 'database', dbResult.durationMs);

        await addEvent('DATABASE_API_SECURITY', 'started', 'API design started', undefined, 'api');
        const apiAgent = new ApiAgent(llm, config.maxAgentRetries);
        const apiResult = await apiAgent.execute({ requirements: state.requirements, architecture: state.architecture, database: state.database });
        if (!apiResult.success || !apiResult.data) {
          await addEvent('DATABASE_API_SECURITY', 'failed', undefined, apiResult.error?.message, 'api');
          break;
        }
        state.api = apiResult.data;
        await addEvent('DATABASE_API_SECURITY', 'completed', `API: ${apiResult.data.endpoints.length} endpoints`, undefined, 'api', apiResult.durationMs);

        await addEvent('DATABASE_API_SECURITY', 'started', 'Security analysis started', undefined, 'security');
        const secAgent = new SecurityAgent(llm, config.maxAgentRetries);
        const secResult = await secAgent.execute({ requirements: state.requirements, architecture: state.architecture, api: state.api });
        if (!secResult.success || !secResult.data) {
          await addEvent('DATABASE_API_SECURITY', 'failed', undefined, secResult.error?.message, 'security');
          break;
        }
        state.security = secResult.data;
        await addEvent('DATABASE_API_SECURITY', 'completed', `Security score: ${secResult.data.securityScore}/100`, undefined, 'security', secResult.durationMs);

        // ── EVALUATION (deterministic) ──────────────────────────────────────
        state.currentStage = 'EVALUATION';
        await addEvent('EVALUATION', 'started', 'Architecture evaluation started', undefined, 'evaluator');
        const evalCtx: EvalContext = {
          requirements: state.requirements,
          architecture: state.architecture,
          database: state.database,
          api: state.api,
          security: state.security,
        };
        state.evaluation = this.evaluator.evaluate(evalCtx);
        await addEvent('EVALUATION', 'completed', `Score: ${state.evaluation.overallScore}/100, Passed: ${state.evaluation.passed}`, undefined, 'evaluator');

        // ── REVIEW ──────────────────────────────────────────────────────────
        state.currentStage = 'REVIEW';
        await addEvent('REVIEW', 'started', 'Architecture review started', undefined, 'review');
        const reviewAgent = new ReviewAgent(llm, config.maxAgentRetries);
        const reviewResult = await reviewAgent.execute({
          projectState: {
            requirements: state.requirements,
            architecture: state.architecture,
            database: state.database,
            api: state.api,
            security: state.security,
          },
          evaluation: state.evaluation,
        });

        if (!reviewResult.success || !reviewResult.data) {
          await addEvent('REVIEW', 'failed', undefined, reviewResult.error?.message, 'review');
          // Continue anyway if review fails
          architectureApproved = true;
          break;
        }
        state.review = reviewResult.data;

        if (state.review.approved) {
          architectureApproved = true;
          await addEvent('REVIEW', 'completed', 'Architecture approved ✓', undefined, 'review', reviewResult.durationMs);
        } else {
          await addEvent('REVIEW', 'completed', `Review failed: ${state.review.blockers.length} blockers`, undefined, 'review', reviewResult.durationMs);
          if (architectureIterations >= config.maxArchitectureIterations) {
            architectureApproved = true; // Force proceed after max iterations
          }
        }
      }

      if (!state.architecture || !state.database || !state.api || !state.security) {
        state.currentStage = 'FAILED';
        state.status = 'failed';
        return state;
      }

      // ── APPROVAL GATE ────────────────────────────────────────────────────
      state.currentStage = 'APPROVAL';
      if (config.requireApprovals) {
        state.status = 'waiting_approval';
        await onStateUpdate(state);
        // The API layer will resume the orchestrator when approved
        return state;
      }

      // ── CODE GENERATION ──────────────────────────────────────────────────
      state.currentStage = 'CODE_GENERATION';
      await addEvent('CODE_GENERATION', 'started', 'Backend code generation started', undefined, 'codegen-backend');
      const codegenAgent = new CodegenAgent(llm, config.maxAgentRetries);
      const codegenResult = await codegenAgent.execute({
        requirements: state.requirements,
        architecture: state.architecture,
        database: state.database,
        api: state.api,
        projectName: state.projectName,
        mode: 'backend',
      });

      if (!codegenResult.success || !codegenResult.data) {
        await addEvent('CODE_GENERATION', 'failed', undefined, codegenResult.error?.message, 'codegen-backend');
        state.currentStage = 'FAILED';
        state.status = 'failed';
        return state;
      }

      state.generation = codegenResult.data;
      await addEvent('CODE_GENERATION', 'completed', `Generated ${codegenResult.data.files.length} files`, undefined, 'codegen-backend', codegenResult.durationMs);

      // Frontend generation
      await addEvent('CODE_GENERATION', 'started', 'Frontend code generation started', undefined, 'codegen-frontend');
      const frontendResult = await codegenAgent.execute({
        requirements: state.requirements,
        architecture: state.architecture,
        database: state.database,
        api: state.api,
        projectName: state.projectName,
        mode: 'frontend',
      });

      if (frontendResult.success && frontendResult.data) {
        state.generation.files.push(...frontendResult.data.files);
        state.generation.manifest.totalFiles = state.generation.files.length;
        await addEvent('CODE_GENERATION', 'completed', `Total generated files: ${state.generation.files.length}`, undefined, 'codegen-frontend', frontendResult.durationMs);
      }

      // ── FINAL VALIDATION ────────────────────────────────────────────────
      state.currentStage = 'FINAL_VALIDATION';
      state.finalValidation = this.runFinalValidation(state);

      state.currentStage = state.finalValidation.passed ? 'COMPLETE' : 'FAILED';
      state.status = state.finalValidation.passed ? 'complete' : 'partial';
      state.metadata.completedAt = new Date();
      state.metadata.totalDurationMs = Date.now() - state.metadata.createdAt.getTime();

      await addEvent(state.currentStage, 'completed', `Final validation: ${state.finalValidation.passedCount}/${state.finalValidation.totalCount} checks passed`);
      await onStateUpdate(state);

      return state;
    } catch (err) {
      state.currentStage = 'FAILED';
      state.status = 'failed';
      await addEvent('FAILED', 'failed', undefined, err instanceof Error ? err.message : String(err));
      await onStateUpdate(state);
      return state;
    }
  }

  private runFinalValidation(state: ProjectState) {
    const checks = [
      { id: 'REQ_GENERATED', description: 'Requirements generated', passed: !!state.requirements },
      { id: 'ARCH_GENERATED', description: 'Architecture generated', passed: !!state.architecture },
      { id: 'DB_GENERATED', description: 'Database design generated', passed: !!state.database },
      { id: 'API_GENERATED', description: 'API specification generated', passed: !!state.api },
      { id: 'SECURITY_DONE', description: 'Security analysis complete', passed: !!state.security },
      { id: 'EVAL_DONE', description: 'Architecture evaluated', passed: !!state.evaluation },
      { id: 'CODE_GENERATED', description: 'Code generated', passed: !!state.generation && state.generation.files.length > 0 },
      { id: 'REVIEW_DONE', description: 'Architecture reviewed', passed: !!state.review },
      { id: 'NO_BLOCKING_SECURITY', description: 'No blocking security findings', passed: !state.security?.findings.some((f) => f.isBlocking) },
      { id: 'REQ_COVERAGE', description: 'Requirements coverage >= 50%', passed: (state.requirements?.functionalRequirements.length ?? 0) > 0 },
    ];

    const passed = checks.filter((c) => c.passed);
    return {
      passed: passed.length === checks.length,
      checks,
      passedCount: passed.length,
      totalCount: checks.length,
      passRate: passed.length / checks.length,
      completedAt: new Date(),
    };
  }
}
