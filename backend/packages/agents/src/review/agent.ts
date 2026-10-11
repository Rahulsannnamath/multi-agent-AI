// packages/agents/src/review/agent.ts
import { BaseAgent, type AgentResult } from '../base.agent.js';
import { ReviewOutputSchema, type ReviewOutput, type EvaluationOutput } from '@multi-agent/schemas';
import { REVIEW_SYSTEM_PROMPT, REVIEW_PROMPT_VERSION, buildReviewPrompt } from './prompt.js';

export interface ReviewInput {
  projectState: object;
  evaluation: EvaluationOutput;
}

export class ReviewAgent extends BaseAgent<ReviewInput, ReviewOutput> {
  readonly agentType = 'review' as const;
  readonly promptVersion = REVIEW_PROMPT_VERSION;

  async execute(input: ReviewInput): Promise<AgentResult<ReviewOutput>> {
    const startTime = Date.now();

    const result = await this.executeWithRetry(async () => {
      const response = await this.llm.generateStructured(
        {
          systemPrompt: REVIEW_SYSTEM_PROMPT,
          userPrompt: buildReviewPrompt(input.projectState, input.evaluation),
          temperature: 0.2,
          maxTokens: 16384,
        },
        (raw: string) => {
          const { data, error } = this.parseJson(raw, ReviewOutputSchema);
          if (error) throw new Error(error);
          return data!;
        }
      );

      if (!response.success) return { success: false, error: response.error };
      const review = response.parsed as ReviewOutput;
      if (!review) return { success: false, error: 'No review data returned' };

      // Sync: blockers = findings where isBlocker = true
      review.blockers = review.findings.filter((f) => f.isBlocker);
      review.approved = review.blockers.length === 0;

      return { success: true, data: review };
    }, 'review-analysis');

    if (!result.success || !result.data) {
      return this.buildResult(false, startTime, undefined, {
        code: 'REVIEW_FAILED',
        message: result.error ?? 'Review failed',
      }, result.warnings);
    }

    return this.buildResult(true, startTime, result.data, undefined, result.warnings);
  }
}
