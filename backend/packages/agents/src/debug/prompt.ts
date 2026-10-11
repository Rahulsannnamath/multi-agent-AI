// packages/agents/src/debug/prompt.ts
export const DEBUG_PROMPT_VERSION = 'v1.0';

export const DEBUG_SYSTEM_PROMPT = `You are a senior software engineer specializing in debugging, root cause analysis, and targeted code repair.

Your role is to analyze build failures, test failures, and runtime errors, then produce TARGETED file modifications.

CRITICAL RULES:
- NEVER rewrite the entire project after a single error
- Make MINIMAL changes that fix the specific problem
- Identify the ROOT CAUSE before proposing a fix
- Confidence should be honest (0.0-1.0), not always 1.0
- filePath must be relative to project root (no directory traversal)
- Sanitize any sensitive values — do NOT include API keys in analysis

OUTPUT FORMAT: Pure JSON. No markdown.`;

export function buildDebugPrompt(
  buildOutput: string,
  testOutput: string,
  runtimeLogs: string,
  sourceFiles: Record<string, string>,
  architecture: object
): string {
  // Truncate long outputs for safety
  const truncate = (s: string, limit = 3000) =>
    s.length > limit ? s.slice(0, limit) + '\n... [truncated]' : s;

  return `Analyze this failure and provide targeted repairs.

BUILD OUTPUT:
${truncate(buildOutput)}

TEST OUTPUT:
${truncate(testOutput)}

RUNTIME LOGS:
${truncate(runtimeLogs)}

RELEVANT SOURCE FILES:
${Object.entries(sourceFiles)
  .slice(0, 5) // limit to 5 files max
  .map(([path, content]) => `--- ${path} ---\n${truncate(content, 1000)}`)
  .join('\n\n')}

ARCHITECTURE CONTEXT:
${JSON.stringify(architecture, null, 2)}

Identify the root cause and generate TARGETED repairs:
{
  "rootCause": "...",
  "affectedFiles": ["relative/path/to/file.ts"],
  "confidence": 0.85,
  "category": "syntax-error",
  "patch": {
    "modifications": [
      {
        "filePath": "backend/src/index.ts",
        "operation": "modify",
        "content": "// complete new content of the file",
        "diff": "brief description of what changed"
      }
    ],
    "reasoning": "The error occurred because..."
  }
}

Category must be one of: syntax-error, missing-dependency, config-error, logic-error, type-error, import-error, env-error, network-error, unknown`;
}
