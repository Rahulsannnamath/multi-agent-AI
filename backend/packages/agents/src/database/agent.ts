// packages/agents/src/database/agent.ts
import { BaseAgent, type AgentResult } from '../base.agent.js';
import { DatabaseOutputSchema, type RequirementsOutput, type ArchitectureOutput, type DatabaseOutput } from '@multi-agent/schemas';
import { DATABASE_SYSTEM_PROMPT, DATABASE_PROMPT_VERSION, buildDatabasePrompt } from './prompt.js';

export interface DatabaseInput {
  requirements: RequirementsOutput;
  architecture: ArchitectureOutput;
}

export class DatabaseAgent extends BaseAgent<DatabaseInput, DatabaseOutput> {
  readonly agentType = 'database' as const;
  readonly promptVersion = DATABASE_PROMPT_VERSION;

  async execute(input: DatabaseInput): Promise<AgentResult<DatabaseOutput>> {
    const startTime = Date.now();

    const result = await this.executeWithRetry(async () => {
      const response = await this.llm.generateStructured(
        {
          systemPrompt: DATABASE_SYSTEM_PROMPT,
          userPrompt: buildDatabasePrompt(input.requirements, input.architecture),
          temperature: 0.2,
          maxTokens: 16384,
        },
        (raw: string) => {
          const { data, error } = this.parseJson(raw, DatabaseOutputSchema);
          if (error) throw new Error(error);
          return data!;
        }
      );

      if (!response.success) return { success: false, error: response.error };
      const db = response.parsed as DatabaseOutput;
      if (!db || db.entities.length === 0) {
        return { success: false, error: 'No database entities returned' };
      }

      return { success: true, data: db };
    }, 'database-generation');

    if (!result.success || !result.data) {
      return this.buildResult(false, startTime, undefined, {
        code: 'DATABASE_GENERATION_FAILED',
        message: result.error ?? 'Database design failed',
      }, result.warnings);
    }

    return this.buildResult(true, startTime, result.data, undefined, result.warnings);
  }
}
