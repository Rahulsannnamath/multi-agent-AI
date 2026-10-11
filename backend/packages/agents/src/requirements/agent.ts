// packages/agents/src/requirements/agent.ts
import { BaseAgent, type AgentResult } from '../base.agent.js';
import { RequirementsOutputSchema, type RequirementsInput, type RequirementsOutput } from '@multi-agent/schemas';
import { REQUIREMENTS_SYSTEM_PROMPT, REQUIREMENTS_PROMPT_VERSION, buildRequirementsPrompt } from './prompt.js';

export class RequirementsAgent extends BaseAgent<RequirementsInput, RequirementsOutput> {
  readonly agentType = 'requirements' as const;
  readonly promptVersion = REQUIREMENTS_PROMPT_VERSION;

  async execute(input: RequirementsInput): Promise<AgentResult<RequirementsOutput>> {
    const startTime = Date.now();

    const result = await this.executeWithRetry(async () => {
      const response = await this.llm.generateStructured(
        {
          systemPrompt: REQUIREMENTS_SYSTEM_PROMPT,
          userPrompt: buildRequirementsPrompt(input.rawPrompt, input.autonomousMode ?? true),
          temperature: 0.3,
          maxTokens: 8192,
        },
        (raw: string) => {
          const { data, error } = this.parseJson(raw, RequirementsOutputSchema);
          if (error) throw new Error(error);
          return data!;
        }
      );

      if (!response.success) {
        return { success: false, error: response.error };
      }

      const parsed = response.parsed as RequirementsOutput;
      if (!parsed) {
        return { success: false, error: 'LLM returned no parseable requirements data' };
      }

      // Post-validation: ensure REQ IDs are present
      const warnings: string[] = [];
      if (parsed.functionalRequirements.length === 0) {
        return { success: false, error: 'No functional requirements generated' };
      }

      // Ensure IDs are unique
      const reqIds = parsed.functionalRequirements.map((r) => r.id);
      const uniqueIds = new Set(reqIds);
      if (uniqueIds.size !== reqIds.length) {
        warnings.push('Duplicate requirement IDs detected — deduplicated');
        let counter = 1;
        for (const req of parsed.functionalRequirements) {
          req.id = `REQ-${String(counter++).padStart(3, '0')}`;
        }
      }

      return { success: true, data: parsed, warnings };
    }, 'requirements-generation');

    if (!result.success || !result.data) {
      return this.buildResult(false, startTime, undefined, {
        code: 'REQUIREMENTS_GENERATION_FAILED',
        message: result.error ?? 'Requirements generation failed',
      }, result.warnings);
    }

    return this.buildResult(true, startTime, result.data, undefined, result.warnings);
  }
}
