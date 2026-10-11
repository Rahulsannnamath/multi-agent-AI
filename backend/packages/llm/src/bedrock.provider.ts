// packages/llm/src/bedrock.provider.ts
// AWS Bedrock provider using the official AWS SDK with IAM credentials (SigV4).
// No daily token quota — uses the same auth as the AWS console.

import {
  BedrockRuntimeClient,
  ConverseCommand,
  type ConverseCommandInput,
  type ConverseCommandOutput,
  type Message,
  type SystemContentBlock,
} from '@aws-sdk/client-bedrock-runtime';
import type { LLMRequest, LLMResponse, ModelInfo } from '@multi-agent/schemas';
import type { LLMProvider } from './provider.js';

export interface BedrockConfig {
  model: string;              // e.g. 'nvidia.nemotron-super-3-120b'
  region?: string;            // e.g. 'us-east-1'
  accessKeyId?: string;       // IAM Access Key ID
  secretAccessKey?: string;   // IAM Secret Access Key
  apiKey?: string;            // Legacy: Bedrock API Key (bearer token) — fallback
  timeout?: number;
}

export class BedrockProvider implements LLMProvider {
  readonly providerType = 'bedrock' as const;
  readonly model: string;
  private client: BedrockRuntimeClient;
  private timeout: number;

  constructor(config: BedrockConfig) {
    const region = config.region ?? 'us-east-1';
    this.model = config.model;
    this.timeout = config.timeout ?? 300_000;

    // Build client with IAM credentials if provided
    const clientConfig: Record<string, unknown> = { region };

    if (config.accessKeyId && config.secretAccessKey) {
      clientConfig.credentials = {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      };
      console.log('[bedrock] Using IAM credentials (SigV4) — no daily token quota');
    } else {
      console.log('[bedrock] No IAM credentials found, SDK will use default credential chain');
    }

    this.client = new BedrockRuntimeClient(clientConfig as any);
  }

  private async callConverse(
    systemPrompt: string,
    userPrompt: string,
    temperature: number,
    maxTokens: number,
  ): Promise<{ content: string; usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number }; stopReason?: string }> {
    const messages: Message[] = [
      {
        role: 'user',
        content: [{ text: userPrompt }],
      },
    ];

    const system: SystemContentBlock[] = [{ text: systemPrompt }];

    const input: ConverseCommandInput = {
      modelId: this.model,
      messages,
      system,
      inferenceConfig: {
        maxTokens,
        temperature,
      },
    };

    const command = new ConverseCommand(input);

    const response: ConverseCommandOutput = await this.client.send(command, {
      requestTimeout: this.timeout,
    });

    const text = response.output?.message?.content?.[0]?.text ?? '';

    return {
      content: text,
      usage: {
        inputTokens: response.usage?.inputTokens,
        outputTokens: response.usage?.outputTokens,
        totalTokens: (response.usage?.inputTokens ?? 0) + (response.usage?.outputTokens ?? 0),
      },
      stopReason: response.stopReason,
    };
  }

  async generateText(request: LLMRequest): Promise<LLMResponse> {
    const startTime = Date.now();
    try {
      const result = await this.callConverse(
        request.systemPrompt,
        request.userPrompt,
        request.temperature ?? 0.3,
        request.maxTokens ?? 4096,
      );

      return {
        content: result.content,
        provider: 'bedrock',
        model: this.model,
        latencyMs: Date.now() - startTime,
        success: true,
        usage: {
          promptTokens: result.usage?.inputTokens,
          completionTokens: result.usage?.outputTokens,
          totalTokens: result.usage?.totalTokens,
        },
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: '',
        provider: 'bedrock',
        model: this.model,
        latencyMs: Date.now() - startTime,
        success: false,
        error: message,
      };
    }
  }

  async generateStructured<T>(
    request: LLMRequest,
    parse: (raw: string) => T
  ): Promise<LLMResponse & { parsed?: T }> {
    const startTime = Date.now();
    try {
      const systemPromptWithJson = request.systemPrompt +
        '\n\nIMPORTANT: Return ONLY valid JSON. No markdown code fences, no extra text.';

      const requestedMax = request.maxTokens ?? 16384;

      // Try with the requested maxTokens first, then auto-retry with 2x if truncated
      for (const maxTokens of [requestedMax, Math.min(requestedMax * 2, 65536)]) {
        const result = await this.callConverse(
          systemPromptWithJson,
          request.userPrompt,
          request.temperature ?? 0.3,
          maxTokens,
        );

        if (result.stopReason === 'max_tokens') {
          // If this was already the retry (2x), give up
          if (maxTokens > requestedMax) {
            return {
              content: result.content,
              provider: 'bedrock',
              model: this.model,
              latencyMs: Date.now() - startTime,
              success: false,
              error: `The model response reached its output token limit (tried ${requestedMax} then ${maxTokens} tokens). The output may be too complex for this model.`,
              usage: {
                promptTokens: result.usage?.inputTokens,
                completionTokens: result.usage?.outputTokens,
                totalTokens: result.usage?.totalTokens,
              },
            };
          }
          // First attempt truncated — auto-retry with 2x tokens
          console.warn(`[bedrock] Output truncated at ${maxTokens} tokens, retrying with ${Math.min(maxTokens * 2, 65536)}...`);
          continue;
        }

        const baseResponse: LLMResponse = {
          content: result.content,
          provider: 'bedrock',
          model: this.model,
          latencyMs: Date.now() - startTime,
          success: true,
          usage: {
            promptTokens: result.usage?.inputTokens,
            completionTokens: result.usage?.outputTokens,
            totalTokens: result.usage?.totalTokens,
          },
        };

        // Strip markdown fences if the model wrapped JSON in them
        let cleaned = result.content.trim();
        cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');

        try {
          const parsed = parse(cleaned);
          return { ...baseResponse, parsed };
        } catch (parseErr) {
          return {
            ...baseResponse,
            success: false,
            error: `JSON parse failed: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`,
          };
        }
      }

      // Should not reach here, but satisfy TS
      return {
        content: '',
        provider: 'bedrock',
        model: this.model,
        latencyMs: Date.now() - startTime,
        success: false,
        error: 'Unexpected: no result from retry loop',
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: '',
        provider: 'bedrock',
        model: this.model,
        latencyMs: Date.now() - startTime,
        success: false,
        error: message,
      };
    }
  }

  async getModelInfo(): Promise<ModelInfo> {
    try {
      // Quick ping to verify connectivity
      const command = new ConverseCommand({
        modelId: this.model,
        messages: [{ role: 'user', content: [{ text: 'ping' }] }],
        inferenceConfig: { maxTokens: 1 },
      });

      try {
        await this.client.send(command, { requestTimeout: 10_000 });
        return {
          provider: 'bedrock',
          model: this.model,
          available: true,
          supportsStructuredOutput: false,
          contextWindow: 256_000,
        };
      } catch (err: unknown) {
        // A 4xx error still means the API is reachable
        const statusCode = (err as any)?.$metadata?.httpStatusCode;
        if (statusCode && statusCode < 500) {
          return {
            provider: 'bedrock',
            model: this.model,
            available: true,
            supportsStructuredOutput: false,
            contextWindow: 256_000,
          };
        }
        return {
          provider: 'bedrock',
          model: this.model,
          available: false,
          supportsStructuredOutput: false,
        };
      }
    } catch {
      return {
        provider: 'bedrock',
        model: this.model,
        available: false,
        supportsStructuredOutput: false,
      };
    }
  }
}
