// packages/llm/src/factory.ts
// Creates the correct provider from configuration

import { OllamaProvider } from './ollama.provider.js';
import { OpenAIProvider } from './openai.provider.js';
import { BedrockProvider } from './bedrock.provider.js';
import type { LLMProvider } from './provider.js';
import type { LLMProviderType } from '@multi-agent/schemas';

export interface ProviderConfig {
  provider: LLMProviderType;
  model: string;
  ollamaBaseUrl?: string;
  openaiApiKey?: string;
  // AWS Bedrock — IAM credentials (preferred, no quota)
  awsAccessKeyId?: string;
  awsSecretAccessKey?: string;
  bedrockRegion?: string;
  timeout?: number;
}

export function createProvider(config: ProviderConfig): LLMProvider {
  if (config.provider === 'ollama') {
    const baseUrl = config.ollamaBaseUrl ?? 'http://localhost:11434';
    return new OllamaProvider({ baseUrl, model: config.model, timeout: config.timeout });
  }

  if (config.provider === 'openai') {
    const apiKey = config.openaiApiKey;
    if (!apiKey) {
      throw new Error(
        'OpenAI API key is not configured. Set OPENAI_API_KEY environment variable.'
      );
    }
    return new OpenAIProvider({ apiKey, model: config.model, timeout: config.timeout });
  }

  if (config.provider === 'bedrock') {
    if (!config.awsAccessKeyId || !config.awsSecretAccessKey) {
      throw new Error(
        'AWS credentials not configured. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY environment variables.'
      );
    }
    return new BedrockProvider({
      model: config.model,
      region: config.bedrockRegion ?? 'us-east-1',
      accessKeyId: config.awsAccessKeyId,
      secretAccessKey: config.awsSecretAccessKey,
      timeout: config.timeout,
    });
  }

  throw new Error(`Unknown LLM provider: ${config.provider}`);
}

export function createProviderFromEnv(
  provider: LLMProviderType,
  overrideModel?: string
): LLMProvider {
  if (provider === 'ollama') {
    return createProvider({
      provider: 'ollama',
      model: overrideModel ?? process.env['OLLAMA_MODEL'] ?? 'qwen2.5:0.5b',
      ollamaBaseUrl: process.env['OLLAMA_BASE_URL'] ?? 'http://localhost:11434',
    });
  }

  if (provider === 'openai') {
    const apiKey = process.env['OPENAI_API_KEY'];
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is not set.');
    }
    return createProvider({
      provider: 'openai',
      model: overrideModel ?? process.env['OPENAI_MODEL'] ?? 'gpt-4o',
      openaiApiKey: apiKey,
    });
  }

  if (provider === 'bedrock') {
    const accessKeyId = process.env['AWS_ACCESS_KEY_ID'];
    const secretAccessKey = process.env['AWS_SECRET_ACCESS_KEY'];
    if (!accessKeyId || !secretAccessKey) {
      throw new Error(
        'AWS IAM credentials not set. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in your .env file.'
      );
    }
    return createProvider({
      provider: 'bedrock',
      model: overrideModel ?? process.env['AWS_BEDROCK_MODEL'] ?? 'deepseek.v3.2',
      awsAccessKeyId: accessKeyId,
      awsSecretAccessKey: secretAccessKey,
      bedrockRegion: process.env['AWS_BEDROCK_REGION'] ?? 'us-east-1',
    });
  }

  throw new Error(`Unknown provider: ${provider}`);
}
