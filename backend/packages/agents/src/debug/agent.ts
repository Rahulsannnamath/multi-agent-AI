// packages/agents/src/debug/agent.ts
import { BaseAgent, type AgentResult } from '../base.agent.js';
import { z } from 'zod';
import type { LLMProvider } from '@multi-agent/llm';
import { DEBUG_SYSTEM_PROMPT, DEBUG_PROMPT_VERSION, buildDebugPrompt } from './prompt.js';

const DebugAnalysisSchema = z.object({
  rootCause: z.string(),
  affectedFiles: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  category: z.enum([
    'syntax-error',
    'missing-dependency',
    'config-error',
    'logic-error',
    'type-error',
    'import-error',
    'env-error',
    'network-error',
    'unknown',
  ]),
  patch: z.object({
    modifications: z.array(
      z.object({
        filePath: z.string(),
        operation: z.enum(['create', 'modify', 'delete']),
        content: z.string().optional(),
        diff: z.string().optional(),
      })
    ),
    reasoning: z.string(),
  }),
});

export type DebugAnalysis = z.infer<typeof DebugAnalysisSchema>;

export interface DebugInput {
  buildOutput: string;
  testOutput: string;
  runtimeLogs: string;
  sourceFiles: Record<string, string>;
  architecture: object;
  iterationNumber: number;
}

export class DebugAgent extends BaseAgent<DebugInput, DebugAnalysis> {
  readonly agentType = 'debug' as const;
  readonly promptVersion = DEBUG_PROMPT_VERSION;

  constructor(llm: LLMProvider, maxRetries = 3) {
    super(llm, maxRetries);
  }

  async execute(input: DebugInput): Promise<AgentResult<DebugAnalysis>> {
    const startTime = Date.now();

    const result = await this.executeWithRetry(async () => {
      const response = await this.llm.generateStructured(
        {
          systemPrompt: DEBUG_SYSTEM_PROMPT,
          userPrompt: buildDebugPrompt(
            input.buildOutput,
            input.testOutput,
            input.runtimeLogs,
            input.sourceFiles,
            input.architecture
          ),
          temperature: 0.1, // Low temperature for debugging precision
          maxTokens: 8192,
        },
        (raw: string) => {
          const { data, error } = this.parseJson(raw, DebugAnalysisSchema);
          if (error) throw new Error(error);
          return data!;
        }
      );

      if (!response.success) return { success: false, error: response.error };
      const analysis = response.parsed as DebugAnalysis;
      if (!analysis) return { success: false, error: 'No debug analysis returned' };

      // Security: validate file paths — no directory traversal
      const safeModifications = analysis.patch.modifications.filter((mod) => {
        const path = mod.filePath;
        return !path.includes('..') && !path.startsWith('/') && !path.includes('\\');
      });

      if (safeModifications.length < analysis.patch.modifications.length) {
        const removed =
          analysis.patch.modifications.length - safeModifications.length;
        analysis.patch.modifications = safeModifications;
        return {
          success: true,
          data: analysis,
          warnings: [`${removed} modifications removed due to unsafe file paths`],
        };
      }

      return { success: true, data: analysis };
    }, 'debug-analysis');

    if (!result.success || !result.data) {
      return this.buildResult(false, startTime, undefined, {
        code: 'DEBUG_ANALYSIS_FAILED',
        message: result.error ?? 'Debug analysis failed',
      }, result.warnings);
    }

    return this.buildResult(true, startTime, result.data, undefined, result.warnings);
  }
}
