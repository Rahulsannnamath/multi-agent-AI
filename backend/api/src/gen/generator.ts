// backend/api/src/gen/generator.ts
// Two-call structured generation: server files → client files → merge.
// Supports OpenAI (with structured outputs) and AWS Bedrock (with JSON-in-prompt).

import OpenAI from 'openai';
import {
  SERVER_SYSTEM_PROMPT,
  CLIENT_SYSTEM_PROMPT,
  FIX_SYSTEM_PROMPT,
  SERVER_FILES_JSON_SCHEMA,
  FILES_JSON_SCHEMA,
} from './prompts.js';

export type GenerationProvider = 'openai' | 'bedrock';

export interface GeneratedFile {
  path: string;
  content: string;
}

interface ServerCallResult {
  files: GeneratedFile[];
  apiContract: {
    endpoints: { method: string; path: string; requestBody?: string | null; responseShape: string }[];
  };
}

interface ClientCallResult {
  files: GeneratedFile[];
}

// ─── OpenAI client helpers ───────────────────────────────────────────────────

function getOpenAIClient(): OpenAI {
  const apiKey = process.env['OPENAI_API_KEY'];
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set');
  return new OpenAI({ apiKey, timeout: 180_000 });
}

function getOpenAIModel(): string {
  return process.env['OPENAI_MODEL'] ?? 'gpt-4o';
}

function isGpt6Luna(model: string): boolean {
  return model === 'gpt-6-luna' || model.startsWith('gpt-6-luna-');
}

function getOpenAIMaxCompletionTokens(model: string): number {
  const configured = Number(process.env['OPENAI_MAX_COMPLETION_TOKENS']);
  if (Number.isFinite(configured) && configured > 0) {
    return Math.min(Math.floor(configured), 128000);
  }
  return isGpt6Luna(model) ? 65536 : 16384;
}

function getOpenAICompletionOptions(model: string) {
  // GPT-6 Luna uses reasoning by default. OpenAI does not allow sampling
  // controls such as temperature when reasoning is enabled, so set the
  // reasoning effort explicitly and omit temperature for this model.
  const maxCompletionTokens = getOpenAIMaxCompletionTokens(model);
  return isGpt6Luna(model)
    ? { max_completion_tokens: maxCompletionTokens, reasoning_effort: 'low' as const }
    : { max_completion_tokens: maxCompletionTokens, temperature: 0.3 };
}

// ─── Bedrock fetch helper ────────────────────────────────────────────────────

// ─── Bedrock SDK helper ──────────────────────────────────────────────────────

import {
  BedrockRuntimeClient,
  ConverseCommand,
  type Message,
  type SystemContentBlock,
} from '@aws-sdk/client-bedrock-runtime';

let _bedrockClient: BedrockRuntimeClient | null = null;

function getBedrockClient(): BedrockRuntimeClient {
  if (_bedrockClient) return _bedrockClient;

  const accessKeyId = process.env['AWS_ACCESS_KEY_ID'];
  const secretAccessKey = process.env['AWS_SECRET_ACCESS_KEY'];
  const region = process.env['AWS_BEDROCK_REGION'] ?? 'us-east-1';

  if (!accessKeyId || !secretAccessKey) {
    throw new Error(
      'AWS IAM credentials not set. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in your .env file.'
    );
  }

  _bedrockClient = new BedrockRuntimeClient({
    region,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });

  console.log(`[bedrock] SDK client initialized (IAM credentials, region=${region})`);
  return _bedrockClient;
}

function getBedrockModel(): string {
  return process.env['AWS_BEDROCK_MODEL'] ?? 'deepseek.v3.2';
}

async function callBedrock(
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number = 16384,
): Promise<string> {
  const client = getBedrockClient();
  const model = getBedrockModel();

  const messages: Message[] = [
    {
      role: 'user',
      content: [{ text: userPrompt }],
    },
  ];

  const system: SystemContentBlock[] = [
    { text: systemPrompt + '\n\nIMPORTANT: Return ONLY valid JSON. No markdown code fences, no extra text.' },
  ];

  const MAX_RETRIES = 3;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`[bedrock] Calling model ${model}, maxTokens=${maxTokens}${attempt > 0 ? ` (retry ${attempt}/${MAX_RETRIES})` : ''}`);

      const command = new ConverseCommand({
        modelId: model,
        messages,
        system,
        inferenceConfig: {
          maxTokens,
          temperature: 0.3,
        },
      });

      const response = await client.send(command, { requestTimeout: 300_000 });

      console.log(
        `[bedrock] Response stopReason=${response.stopReason}, ` +
        `inputTokens=${response.usage?.inputTokens}, outputTokens=${response.usage?.outputTokens}`
      );

      if (response.stopReason === 'max_tokens') {
        throw new Error(
          `Bedrock generation truncated: used ${response.usage?.outputTokens ?? '?'}/${maxTokens} output tokens. ` +
          `Try a simpler prompt to reduce the output size.`
        );
      }

      let content = response.output?.message?.content?.[0]?.text ?? '';
      content = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
      return content;

    } catch (err: unknown) {
      const statusCode = (err as any)?.$metadata?.httpStatusCode;
      const errMsg = err instanceof Error ? err.message : String(err);

      // Retry on throttling (429)
      if (statusCode === 429 && attempt < MAX_RETRIES) {
        const waitSeconds = Math.pow(2, attempt + 1) * 5; // 10s, 20s, 40s
        console.warn(`[bedrock] Throttled (429), waiting ${waitSeconds}s...`);
        await new Promise((r) => setTimeout(r, waitSeconds * 1000));
        continue;
      }

      // Re-throw all other errors
      throw new Error(`Bedrock error: ${errMsg}`);
    }
  }

  throw new Error('Bedrock call failed after all retries.');
}

// ─── OpenAI Generation (existing logic) ──────────────────────────────────────

async function generateServerOpenAI(prompt: string): Promise<ServerCallResult> {
  const client = getOpenAIClient();
  const model = getOpenAIModel();

  const completion = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: SERVER_SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ],
    ...getOpenAICompletionOptions(model),
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'server_generation',
        strict: true,
        schema: SERVER_FILES_JSON_SCHEMA,
      },
    },
  });

  const raw = completion.choices[0]?.message?.content ?? '';
  if (completion.choices[0]?.finish_reason === 'length') {
    throw new Error('Server generation was truncated. Try a simpler prompt.');
  }

  const parsed = JSON.parse(raw) as ServerCallResult;
  if (!parsed.files || !Array.isArray(parsed.files)) {
    throw new Error('Server generation returned invalid structure');
  }
  return parsed;
}

async function generateClientOpenAI(prompt: string, apiContract: ServerCallResult['apiContract']): Promise<ClientCallResult> {
  const client = getOpenAIClient();
  const model = getOpenAIModel();

  const userPrompt = `Application description: ${prompt}

API Contract (these endpoints are available):
${JSON.stringify(apiContract.endpoints, null, 2)}

Generate all client/ files for a React + Vite app that uses these endpoints.`;

  const completion = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: CLIENT_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    ...getOpenAICompletionOptions(model),
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'client_generation',
        strict: true,
        schema: FILES_JSON_SCHEMA,
      },
    },
  });

  const raw = completion.choices[0]?.message?.content ?? '';
  if (completion.choices[0]?.finish_reason === 'length') {
    throw new Error('Client generation was truncated. Try a simpler prompt.');
  }

  const parsed = JSON.parse(raw) as ClientCallResult;
  if (!parsed.files || !Array.isArray(parsed.files)) {
    throw new Error('Client generation returned invalid structure');
  }
  return parsed;
}

// ─── Bedrock Generation ──────────────────────────────────────────────────────

async function generateServerBedrock(prompt: string): Promise<ServerCallResult> {
  const raw = await callBedrock(SERVER_SYSTEM_PROMPT, prompt, 16384);
  const parsed = JSON.parse(raw) as ServerCallResult;
  if (!parsed.files || !Array.isArray(parsed.files)) {
    throw new Error('Server generation returned invalid structure');
  }
  return parsed;
}

async function generateClientBedrock(prompt: string, apiContract: ServerCallResult['apiContract']): Promise<ClientCallResult> {
  const userPrompt = `Application description: ${prompt}

API Contract (these endpoints are available):
${JSON.stringify(apiContract.endpoints, null, 2)}

Generate all client/ files for a React + Vite app that uses these endpoints.`;

  const raw = await callBedrock(CLIENT_SYSTEM_PROMPT, userPrompt, 16384);
  const parsed = JSON.parse(raw) as ClientCallResult;
  if (!parsed.files || !Array.isArray(parsed.files)) {
    throw new Error('Client generation returned invalid structure');
  }
  return parsed;
}

// ─── Main pipeline ───────────────────────────────────────────────────────────

/**
 * Main generation pipeline: two calls, merged result.
 * @param provider — which LLM provider to use ('openai' | 'bedrock')
 */
export async function generateApp(
  prompt: string,
  onProgress?: (msg: string) => void,
  provider: GenerationProvider = 'openai',
): Promise<GeneratedFile[]> {
  const providerLabel = provider === 'bedrock'
    ? `AWS Bedrock (${process.env['AWS_BEDROCK_MODEL'] ?? 'deepseek.v3.2'})`
    : `OpenAI (${getOpenAIModel()})`;

  onProgress?.(`Generating server files via ${providerLabel}...`);

  const serverResult = provider === 'bedrock'
    ? await generateServerBedrock(prompt)
    : await generateServerOpenAI(prompt);

  onProgress?.(`Server: ${serverResult.files.length} files, ${serverResult.apiContract.endpoints.length} endpoints`);

  onProgress?.(`Generating client files via ${providerLabel}...`);

  const clientResult = provider === 'bedrock'
    ? await generateClientBedrock(prompt, serverResult.apiContract)
    : await generateClientOpenAI(prompt, serverResult.apiContract);

  onProgress?.(`Client: ${clientResult.files.length} files`);

  const allFiles = [...serverResult.files, ...clientResult.files];
  return allFiles;
}

/**
 * Fix loop: send error + current files back to LLM for correction.
 * @param provider — which LLM provider to use ('openai' | 'bedrock')
 */
export async function generateFix(
  currentFiles: GeneratedFile[],
  errorOutput: string,
  provider: GenerationProvider = 'openai',
): Promise<GeneratedFile[]> {
  const filesDescription = currentFiles
    .map((f) => `--- ${f.path} ---\n${f.content}`)
    .join('\n\n');

  const userPrompt = `Here are the current project files:

${filesDescription}

The build/run failed with this error:
\`\`\`
${errorOutput.slice(-3000)}
\`\`\`

Return the full corrected files array.`;

  if (provider === 'bedrock') {
    const raw = await callBedrock(FIX_SYSTEM_PROMPT, userPrompt, 16384);
    const parsed = JSON.parse(raw) as { files: GeneratedFile[] };
    if (!parsed.files || !Array.isArray(parsed.files)) {
      throw new Error('Fix generation returned invalid structure');
    }
    return parsed.files;
  }

  // OpenAI path (original)
  const client = getOpenAIClient();
  const model = getOpenAIModel();

  const completion = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: FIX_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    ...getOpenAICompletionOptions(model),
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'fix_generation',
        strict: true,
        schema: FILES_JSON_SCHEMA,
      },
    },
  });

  const raw = completion.choices[0]?.message?.content ?? '';
  const parsed = JSON.parse(raw) as { files: GeneratedFile[] };
  if (!parsed.files || !Array.isArray(parsed.files)) {
    throw new Error('Fix generation returned invalid structure');
  }
  return parsed.files;
}
