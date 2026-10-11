// packages/agents/src/architecture/agent.ts
import { BaseAgent, type AgentResult } from '../base.agent.js';
import { ArchitectureOutputSchema, type RequirementsOutput, type ArchitectureOutput } from '@multi-agent/schemas';
import { ARCHITECTURE_SYSTEM_PROMPT, ARCHITECTURE_PROMPT_VERSION, buildArchitecturePrompt } from './prompt.js';

export interface ArchitectureInput {
  requirements: RequirementsOutput;
  revisionNotes?: string[];
  previousArchitecture?: ArchitectureOutput;
}

export class ArchitectureAgent extends BaseAgent<ArchitectureInput, ArchitectureOutput> {
  readonly agentType = 'architecture' as const;
  readonly promptVersion = ARCHITECTURE_PROMPT_VERSION;

  async execute(input: ArchitectureInput): Promise<AgentResult<ArchitectureOutput>> {
    const startTime = Date.now();

    const result = await this.executeWithRetry(async () => {
      const response = await this.llm.generateStructured(
        {
          systemPrompt: ARCHITECTURE_SYSTEM_PROMPT,
          userPrompt: buildArchitecturePrompt(input.requirements, input.revisionNotes),
          temperature: 0.2,
          maxTokens: 8192,
        },
        (raw: string) => {
          const { data, error } = this.parseJson(raw, ArchitectureOutputSchema);
          if (error) throw new Error(error);
          return data!;
        }
      );

      if (!response.success) return { success: false, error: response.error };
      const arch = response.parsed as ArchitectureOutput;
      if (!arch) return { success: false, error: 'No architecture data returned' };

      // Validate: all connections reference valid component IDs
      const componentIds = new Set(arch.components.map((c) => c.id));
      const warnings: string[] = [];
      for (const conn of arch.connections) {
        if (!componentIds.has(conn.source)) {
          warnings.push(`Connection ${conn.id} references unknown source: ${conn.source}`);
        }
        if (!componentIds.has(conn.target)) {
          warnings.push(`Connection ${conn.id} references unknown target: ${conn.target}`);
        }
      }

      if (arch.components.length === 0) {
        return { success: false, error: 'Architecture has no components' };
      }

      return { success: true, data: arch, warnings };
    }, 'architecture-generation');

    if (!result.success || !result.data) {
      return this.buildResult(false, startTime, undefined, {
        code: 'ARCHITECTURE_GENERATION_FAILED',
        message: result.error ?? 'Architecture generation failed',
      }, result.warnings);
    }

    return this.buildResult(true, startTime, result.data, undefined, result.warnings);
  }
}
