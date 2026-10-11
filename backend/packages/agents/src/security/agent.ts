// packages/agents/src/security/agent.ts
import { BaseAgent, type AgentResult } from '../base.agent.js';
import { SecurityOutputSchema, type RequirementsOutput, type ArchitectureOutput, type ApiOutput, type SecurityOutput } from '@multi-agent/schemas';
import { SECURITY_SYSTEM_PROMPT, SECURITY_PROMPT_VERSION, buildSecurityPrompt } from './prompt.js';

export interface SecurityInput {
  requirements: RequirementsOutput;
  architecture: ArchitectureOutput;
  api: ApiOutput;
}

export class SecurityAgent extends BaseAgent<SecurityInput, SecurityOutput> {
  readonly agentType = 'security' as const;
  readonly promptVersion = SECURITY_PROMPT_VERSION;

  async execute(input: SecurityInput): Promise<AgentResult<SecurityOutput>> {
    const startTime = Date.now();

    const result = await this.executeWithRetry(async () => {
      const response = await this.llm.generateStructured(
        {
          systemPrompt: SECURITY_SYSTEM_PROMPT,
          userPrompt: buildSecurityPrompt(input.requirements, input.architecture, input.api),
          temperature: 0.2,
          maxTokens: 16384,
        },
        (raw: string) => {
          const { data, error } = this.parseJson(raw, SecurityOutputSchema);
          if (error) throw new Error(error);
          return data!;
        }
      );

      if (!response.success) return { success: false, error: response.error };
      const sec = response.parsed as SecurityOutput;
      if (!sec) return { success: false, error: 'No security analysis returned' };

      // Recalculate score deterministically — ignore what LLM says
      const criticals = sec.findings.filter((f) => f.severity === 'CRITICAL').length;
      const highs = sec.findings.filter((f) => f.severity === 'HIGH').length;
      const mediums = sec.findings.filter((f) => f.severity === 'MEDIUM').length;
      const lows = sec.findings.filter((f) => f.severity === 'LOW').length;
      sec.securityScore = Math.max(0, 100 - criticals * 30 - highs * 10 - mediums * 5 - lows * 1);

      return { success: true, data: sec };
    }, 'security-analysis');

    if (!result.success || !result.data) {
      return this.buildResult(false, startTime, undefined, {
        code: 'SECURITY_ANALYSIS_FAILED',
        message: result.error ?? 'Security analysis failed',
      }, result.warnings);
    }

    return this.buildResult(true, startTime, result.data, undefined, result.warnings);
  }
}
