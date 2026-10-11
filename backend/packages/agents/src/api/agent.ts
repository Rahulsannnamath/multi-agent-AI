// packages/agents/src/api/agent.ts
import { BaseAgent, type AgentResult } from '../base.agent.js';
import { ApiOutputSchema, type RequirementsOutput, type ArchitectureOutput, type DatabaseOutput, type ApiOutput } from '@multi-agent/schemas';
import { API_SYSTEM_PROMPT, API_PROMPT_VERSION, buildApiPrompt } from './prompt.js';

export interface ApiInput {
  requirements: RequirementsOutput;
  architecture: ArchitectureOutput;
  database: DatabaseOutput;
}

export class ApiAgent extends BaseAgent<ApiInput, ApiOutput> {
  readonly agentType = 'api' as const;
  readonly promptVersion = API_PROMPT_VERSION;

  async execute(input: ApiInput): Promise<AgentResult<ApiOutput>> {
    const startTime = Date.now();

    const result = await this.executeWithRetry(async () => {
      const response = await this.llm.generateStructured(
        {
          systemPrompt: API_SYSTEM_PROMPT,
          userPrompt: buildApiPrompt(input.requirements, input.architecture, input.database),
          temperature: 0.2,
          maxTokens: 8192,
        },
        (raw: string) => {
          const { data, error } = this.parseJson(raw, ApiOutputSchema);
          if (error) throw new Error(error);
          return data!;
        }
      );

      if (!response.success) return { success: false, error: response.error };
      const api = response.parsed as ApiOutput;
      if (!api || api.endpoints.length === 0) {
        return { success: false, error: 'No API endpoints generated' };
      }

      // Validate IDs are unique
      const ids = api.endpoints.map((e) => e.id);
      if (new Set(ids).size !== ids.length) {
        let counter = 1;
        for (const ep of api.endpoints) {
          ep.id = `API-${String(counter++).padStart(3, '0')}`;
        }
      }

      return { success: true, data: api };
    }, 'api-generation');

    if (!result.success || !result.data) {
      return this.buildResult(false, startTime, undefined, {
        code: 'API_GENERATION_FAILED',
        message: result.error ?? 'API design failed',
      }, result.warnings);
    }

    return this.buildResult(true, startTime, result.data, undefined, result.warnings);
  }
}
