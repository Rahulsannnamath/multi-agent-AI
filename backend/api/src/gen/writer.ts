// backend/api/src/gen/writer.ts
// Writes generated files to disk with path traversal protection.
// Copies Docker templates from templates/ into the project directory.

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import type { GeneratedFile } from './generator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Templates live at backend/api/src/gen/../../templates → backend/api/templates/
// But we'll resolve relative to the project root's templates/ dir.
const TEMPLATES_DIR = path.resolve(__dirname, '../../../../templates');

/**
 * Validate a file path from LLM output. Treat LLM output as untrusted.
 * Only allow paths starting with client/ or server/.
 * Reject absolute paths, "..", and resolved paths outside appDir.
 */
function validateFilePath(filePath: string, appDir: string): string {
  // Reject absolute paths
  if (path.isAbsolute(filePath)) {
    throw new Error(`Absolute path rejected: ${filePath}`);
  }

  // Reject ".." components
  const normalized = path.normalize(filePath);
  if (normalized.includes('..')) {
    throw new Error(`Path traversal rejected: ${filePath}`);
  }

  // Must start with client/ or server/
  const posixPath = filePath.replace(/\\/g, '/');
  if (!posixPath.startsWith('client/') && !posixPath.startsWith('server/')) {
    throw new Error(`Path must start with client/ or server/: ${filePath}`);
  }

  // Resolve and verify it stays within appDir
  const resolved = path.resolve(appDir, normalized);
  const resolvedAppDir = path.resolve(appDir);
  if (!resolved.startsWith(resolvedAppDir + path.sep) && resolved !== resolvedAppDir) {
    throw new Error(`Path resolves outside project directory: ${filePath}`);
  }

  return resolved;
}
/**
 * Known-good dependency versions. LLMs often hallucinate non-existent versions
 * (e.g., lucide-react@^0.2.0). This map forces correct minimum versions at write
 * time as a safety net, regardless of what the LLM produced.
 */
const KNOWN_GOOD_VERSIONS: Record<string, string> = {
  // Client deps
  'react': '^18.3.1',
  'react-dom': '^18.3.1',
  'react-router-dom': '^7.1.0',
  'lucide-react': '^0.469.0',
  'react-hot-toast': '^2.4.1',
  'axios': '^1.7.9',
  'recharts': '^2.15.0',
  'date-fns': '^4.1.0',
  'clsx': '^2.1.1',
  // Client devDeps
  '@vitejs/plugin-react': '^4.3.4',
  'vite': '^6.0.11',
  'tailwindcss': '^3.4.17',
  'postcss': '^8.5.1',
  'autoprefixer': '^10.4.20',
  // Server deps
  'express': '^4.21.0',
  'mongoose': '^8.9.0',
  'cors': '^2.8.5',
  'dotenv': '^16.4.0',
  'bcryptjs': '^2.4.3',
  'jsonwebtoken': '^9.0.2',
  'multer': '^1.4.5-lts.1',
  'uuid': '^11.0.0',
};

/**
 * Sanitize a generated package.json: replace hallucinated dependency versions
 * with known-good versions. Returns the corrected JSON string.
 */
function sanitizePackageJson(content: string): string {
  try {
    const pkg = JSON.parse(content);

    for (const depKey of ['dependencies', 'devDependencies', 'peerDependencies']) {
      const deps = pkg[depKey];
      if (!deps || typeof deps !== 'object') continue;
      for (const [name, _version] of Object.entries(deps)) {
        if (KNOWN_GOOD_VERSIONS[name]) {
          deps[name] = KNOWN_GOOD_VERSIONS[name];
        }
      }
    }

    return JSON.stringify(pkg, null, 2) + '\n';
  } catch {
    // If JSON parsing fails, return content unchanged
    return content;
  }
}

/**
 * Write generated files to disk. Clears appDir first, then writes each file.
 */
export async function writeProject(appDir: string, files: GeneratedFile[]): Promise<string[]> {
  const resolvedAppDir = path.resolve(appDir);

  // Clear and create appDir
  await fs.rm(resolvedAppDir, { recursive: true, force: true });
  await fs.mkdir(resolvedAppDir, { recursive: true });

  const writtenPaths: string[] = [];

  for (const file of files) {
    const resolvedPath = validateFilePath(file.path, resolvedAppDir);
    const parentDir = path.dirname(resolvedPath);
    await fs.mkdir(parentDir, { recursive: true });
    let finalContent = file.content;
    
    // Auto-fix common LLM mistake where it tries to serve from ../public instead of public
    if (file.path === 'server/index.js' || file.path === 'server/app.js') {
      finalContent = finalContent.replace(/\.\.\/public/g, 'public');
      finalContent = finalContent.replace(/\.\.\/client\/dist/g, 'public');
    }

    // Sanitize package.json dependency versions
    if (file.path.endsWith('package.json')) {
      finalContent = sanitizePackageJson(finalContent);
    }

    await fs.writeFile(resolvedPath, finalContent, 'utf-8');
    writtenPaths.push(file.path);
  }

  // Copy Docker templates (these are OUR templates, not LLM-generated)
  const templateFiles = ['Dockerfile', 'docker-compose.yml', '.dockerignore'];
  for (const tpl of templateFiles) {
    const src = path.join(TEMPLATES_DIR, tpl);
    const dest = path.join(resolvedAppDir, tpl);
    try {
      await fs.copyFile(src, dest);
      writtenPaths.push(tpl);
    } catch (err) {
      console.error(`[writer] Failed to copy template ${tpl}:`, err);
      throw new Error(`Template file missing: ${tpl}. Run from the project root.`);
    }
  }

  return writtenPaths;
}

/**
 * Get the workspace directory for generated apps.
 */
export function getWorkspaceDir(): string {
  // workspace/ lives at the monorepo root
  return path.resolve(__dirname, '../../../../workspace');
}

/**
 * Get the app directory for a specific app ID.
 */
export function getAppDir(appId: string): string {
  // Sanitize appId — only allow alphanumeric and hyphens
  const sanitized = appId.replace(/[^a-zA-Z0-9-]/g, '');
  if (!sanitized || sanitized !== appId) {
    throw new Error(`Invalid app ID: ${appId}`);
  }
  return path.join(getWorkspaceDir(), sanitized);
}

/**
 * Remove an app directory entirely.
 */
export async function removeAppDir(appId: string): Promise<void> {
  const appDir = getAppDir(appId);
  await fs.rm(appDir, { recursive: true, force: true });
}
