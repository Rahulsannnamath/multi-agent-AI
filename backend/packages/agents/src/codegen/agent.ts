// packages/agents/src/codegen/agent.ts
import { BaseAgent, type AgentResult } from '../base.agent.js';
import { GenerationOutputJsonSchema, GenerationOutputSchema, type RequirementsOutput, type ArchitectureOutput, type DatabaseOutput, type ApiOutput, type GenerationOutput } from '@multi-agent/schemas';
import type { LLMProvider } from '@multi-agent/llm';
import {
  CODEGEN_BACKEND_SYSTEM_PROMPT,
  CODEGEN_FRONTEND_SYSTEM_PROMPT,
  CODEGEN_PROMPT_VERSION,
  buildBackendCodegenPrompt,
  buildFrontendCodegenPrompt,
} from './prompt.js';
import path from 'path';

export interface CodegenInput {
  requirements: RequirementsOutput;
  architecture: ArchitectureOutput;
  database: DatabaseOutput;
  api: ApiOutput;
  projectName: string;
  mode: 'backend' | 'frontend' | 'full';
}

export class CodegenAgent extends BaseAgent<CodegenInput, GenerationOutput> {
  readonly agentType = 'codegen-backend' as const;
  readonly promptVersion = CODEGEN_PROMPT_VERSION;

  constructor(llm: LLMProvider, maxRetries = 3) {
    super(llm, maxRetries);
  }

  async execute(input: CodegenInput): Promise<AgentResult<GenerationOutput>> {
    const startTime = Date.now();

    if (input.mode === 'full' || input.mode === 'backend') {
      return this.generateBackend(input, startTime);
    }
    return this.generateFrontend(input, startTime);
  }

  private async generateBackend(
    input: CodegenInput,
    startTime: number
  ): Promise<AgentResult<GenerationOutput>> {
    const result = await this.executeWithRetry(async () => {
      const response = await this.llm.generateStructured(
        {
          systemPrompt: CODEGEN_BACKEND_SYSTEM_PROMPT,
          userPrompt: buildBackendCodegenPrompt(
            input.requirements,
            input.architecture,
            input.database,
            input.api,
            input.projectName
          ),
          temperature: 0.1,
          maxTokens: 65536,
          schema: GenerationOutputJsonSchema,
        },
        (raw: string) => {
          const { data, error } = this.parseJson(raw, GenerationOutputSchema);
          if (error) throw new Error(error);
          return data!;
        }
      );

      if (!response.success) return { success: false, error: response.error };
      const gen = response.parsed as GenerationOutput;
      if (!gen || gen.files.length === 0) {
        return { success: false, error: 'No files generated' };
      }

      // Security: validate file paths
      const safeFiles = gen.files.filter((f) => this.isPathSafe(f.path));
      const warnings: string[] = [];
      if (safeFiles.length < gen.files.length) {
        warnings.push(
          `${gen.files.length - safeFiles.length} files rejected due to unsafe paths`
        );
      }
      gen.files = safeFiles;
      gen.manifest.totalFiles = safeFiles.length;
      gen.manifest.files = safeFiles.map((f) => ({
        path: f.path,
        purpose: f.purpose,
        language: f.language,
      }));

      return { success: true, data: gen, warnings };
    }, 'codegen-backend');

    if (!result.success || !result.data) {
      return this.buildResult(false, startTime, undefined, {
        code: 'CODEGEN_BACKEND_FAILED',
        message: result.error ?? 'Backend code generation failed',
      }, result.warnings);
    }

    return this.buildResult(true, startTime, result.data, undefined, result.warnings);
  }

  private async generateFrontend(
    input: CodegenInput,
    startTime: number
  ): Promise<AgentResult<GenerationOutput>> {
    const result = await this.executeWithRetry(async () => {
      const response = await this.llm.generateStructured(
        {
          systemPrompt: CODEGEN_FRONTEND_SYSTEM_PROMPT,
          userPrompt: buildFrontendCodegenPrompt(input.requirements, input.api, input.projectName),
          temperature: 0.1,
          maxTokens: 65536,
          schema: GenerationOutputJsonSchema,
        },
        (raw: string) => {
          const { data, error } = this.parseJson(raw, GenerationOutputSchema);
          if (error) throw new Error(error);
          return data!;
        }
      );

      if (!response.success) return { success: false, error: response.error };
      const gen = response.parsed as GenerationOutput;
      if (!gen) return { success: false, error: 'No frontend files generated' };

      const safeFiles = gen.files.filter((f) => this.isPathSafe(f.path));
      if (safeFiles.length === 0) return { success: false, error: 'No safe frontend files generated' };
      gen.files = safeFiles;
      gen.manifest.totalFiles = safeFiles.length;
      gen.manifest.files = safeFiles.map(({ path, purpose, language }) => ({ path, purpose, language }));

      return { success: true, data: gen };
    }, 'codegen-frontend');

    if (!result.success || !result.data) {
      return this.buildResult(false, startTime, undefined, {
        code: 'CODEGEN_FRONTEND_FAILED',
        message: result.error ?? 'Frontend code generation failed',
      }, result.warnings);
    }

    return this.buildResult(true, startTime, result.data, undefined, result.warnings);
  }

  private isPathSafe(filePath: string): boolean {
    const normalized = path.normalize(filePath);
    // No directory traversal, no absolute paths
    return (
      !normalized.includes('..') &&
      !path.isAbsolute(normalized) &&
      !normalized.startsWith('\\') &&
      normalized.length > 0 &&
      normalized.length < 200
    );
  }
}
