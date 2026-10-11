// apps/api/src/routes/apps.router.ts
// Routes for quick-generate apps: generate, preview, stop, delete.
// Matches existing routing conventions.

import { Router, type Request, type Response } from 'express';
import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import { GeneratedAppModel } from '../db/models/generatedapp.model.js';
import { generateApp, generateFix, type GeneratedFile, type GenerationProvider } from '../gen/generator.js';
import { writeProject, getAppDir, removeAppDir } from '../gen/writer.js';
import { startApp, stopApp, checkDocker } from '../gen/runner.js';
import { sseManager } from '../sse/sse.manager.js';

export const appsRouter = Router();

// ── POST /api/apps — Generate a new app ──────────────────────────────────────
appsRouter.post('/', async (req: Request, res: Response) => {
  try {
    const { prompt, provider: reqProvider } = req.body as { prompt?: string; provider?: string };

    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      return res.status(400).json({ error: 'prompt is required' });
    }

    // Determine provider — default to openai
    const provider: GenerationProvider =
      reqProvider === 'bedrock' ? 'bedrock' : 'openai';

    // Validate the chosen provider is configured
    if (provider === 'openai' && !process.env['OPENAI_API_KEY']) {
      return res.status(400).json({
        error: 'OpenAI is not configured. Set OPENAI_API_KEY.',
        code: 'OPENAI_NOT_CONFIGURED',
      });
    }
    if (provider === 'bedrock' && (!process.env['AWS_ACCESS_KEY_ID'] || !process.env['AWS_SECRET_ACCESS_KEY'])) {
      return res.status(400).json({
        error: 'AWS Bedrock is not configured. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY.',
        code: 'BEDROCK_NOT_CONFIGURED',
      });
    }

    const appId = randomUUID();

    await GeneratedAppModel.create({
      appId,
      prompt: prompt.trim(),
      provider,
      status: 'generating',
    });

    // Respond immediately
    res.status(201).json({ appId, status: 'generating', provider });

    // Run generation in background
    runGeneration(appId, prompt.trim(), provider).catch((err) => {
      console.error(`[apps] Generation failed for ${appId}:`, err);
    });

    return;
  } catch (err) {
    console.error('[apps] POST error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /api/apps — List all generated apps ──────────────────────────────────
appsRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const apps = await GeneratedAppModel.find({})
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    return res.json(apps);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch apps' });
  }
});

// ── GET /api/apps/:id — Get a single app ─────────────────────────────────────
appsRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const app = await GeneratedAppModel.findOne({ appId: req.params['id'] }).lean();
    if (!app) return res.status(404).json({ error: 'App not found' });
    return res.json(app);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch app' });
  }
});

// ── GET /api/apps/:id/files — Get generated file tree with content ───────────
appsRouter.get('/:id/files', async (req: Request, res: Response) => {
  try {
    const app = await GeneratedAppModel.findOne({ appId: req.params['id'] });
    if (!app) return res.status(404).json({ error: 'App not found' });

    const appDir = getAppDir(app.appId);
    const files: { path: string; content: string }[] = [];

    for (const filePath of app.filePaths) {
      // Only return client/ and server/ files, not Docker templates
      const posixPath = filePath.replace(/\\/g, '/');
      if (!posixPath.startsWith('client/') && !posixPath.startsWith('server/')) continue;

      try {
        const fullPath = `${appDir}/${filePath}`;
        const content = await fs.readFile(fullPath, 'utf-8');
        files.push({ path: filePath, content });
      } catch {
        files.push({ path: filePath, content: '(file not found)' });
      }
    }

    return res.json({ appId: app.appId, files });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch files' });
  }
});

// ── POST /api/apps/:id/preview — Build and run in Docker ─────────────────────
appsRouter.post('/:id/preview', async (req: Request, res: Response) => {
  try {
    const app = await GeneratedAppModel.findOne({ appId: req.params['id'] });
    if (!app) return res.status(404).json({ error: 'App not found' });

    if (app.status === 'running') {
      return res.json({ ok: true, url: app.previewUrl, port: app.previewPort });
    }

    if (app.status === 'building') {
      return res.status(409).json({ error: 'App is already building' });
    }

    // Check Docker availability
    const dockerError = await checkDocker();
    if (dockerError) {
      return res.status(503).json({ error: dockerError });
    }

    // Mark as building
    app.status = 'building';
    app.lastError = null;
    await app.save();

    // Respond immediately
    res.json({ status: 'building', message: 'Docker build started. Subscribe to SSE for progress.' });

    // Run in background with auto-fix loop
    runPreviewWithFix(app.appId).catch((err) => {
      console.error(`[apps] Preview failed for ${app.appId}:`, err);
    });

    return;
  } catch (err) {
    return res.status(500).json({ error: 'Failed to start preview' });
  }
});

// ── POST /api/apps/:id/stop — Stop running Docker containers ─────────────────
appsRouter.post('/:id/stop', async (req: Request, res: Response) => {
  try {
    const app = await GeneratedAppModel.findOne({ appId: req.params['id'] });
    if (!app) return res.status(404).json({ error: 'App not found' });

    const appDir = getAppDir(app.appId);
    await stopApp(app.appId, appDir);

    app.status = 'stopped';
    app.previewUrl = null;
    app.previewPort = null;
    await app.save();

    sendAppEvent(app.appId, 'app-stopped', { appId: app.appId });
    return res.json({ status: 'stopped' });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to stop app' });
  }
});

// ── DELETE /api/apps/:id — Stop + remove workspace dir + DB record ────────────
appsRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    const app = await GeneratedAppModel.findOne({ appId: req.params['id'] });
    if (!app) return res.status(404).json({ error: 'App not found' });

    // Stop containers if running
    if (app.status === 'running' || app.status === 'building') {
      const appDir = getAppDir(app.appId);
      await stopApp(app.appId, appDir);
    }

    // Remove workspace directory
    await removeAppDir(app.appId);

    // Remove DB record
    await GeneratedAppModel.deleteOne({ appId: app.appId });

    sendAppEvent(app.appId, 'app-deleted', { appId: app.appId });
    return res.json({ status: 'deleted' });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to delete app' });
  }
});

// ── GET /api/apps/:id/events — SSE stream for app progress ───────────────────
appsRouter.get('/:id/events', (req: Request, res: Response) => {
  const appId = req.params['id'] as string;
  const clientId = randomUUID();

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  res.write(`event: connected\ndata: ${JSON.stringify({ clientId, appId })}\n\n`);

  // Reuse SSE manager — prefix appId to avoid collision with project SSE
  const sseAppId = `genapp-${appId}`;
  sseManager.addClient(clientId, sseAppId, res);

  const heartbeat = setInterval(() => {
    try { res.write(': heartbeat\n\n'); } catch { clearInterval(heartbeat); }
  }, 30000);

  req.on('close', () => {
    clearInterval(heartbeat);
    sseManager.removeClient(clientId);
  });
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function sendAppEvent(appId: string, type: string, data: unknown) {
  sseManager.sendToProject(`genapp-${appId}`, { type, data });
}

async function runGeneration(appId: string, prompt: string, provider: GenerationProvider = 'openai') {
  try {
    sendAppEvent(appId, 'app-progress', { step: 'generating', message: `Starting AI generation via ${provider}...` });

    const files = await generateApp(prompt, (msg) => {
      sendAppEvent(appId, 'app-progress', { step: 'generating', message: msg });
    }, provider);

    sendAppEvent(appId, 'app-progress', { step: 'writing', message: 'Writing files to disk...' });
    const appDir = getAppDir(appId);
    const writtenPaths = await writeProject(appDir, files);

    await GeneratedAppModel.updateOne(
      { appId },
      { status: 'generated', filePaths: writtenPaths },
    );

    sendAppEvent(appId, 'app-generated', {
      appId,
      status: 'generated',
      fileCount: writtenPaths.length,
      filePaths: writtenPaths,
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    await GeneratedAppModel.updateOne(
      { appId },
      { status: 'error', lastError: errorMsg },
    );
    sendAppEvent(appId, 'app-error', { appId, error: errorMsg });
  }
}

async function runPreviewWithFix(appId: string) {
  const MAX_FIX_ATTEMPTS = 3;
  const app = await GeneratedAppModel.findOne({ appId });
  if (!app) return;

  const appDir = getAppDir(appId);

  for (let attempt = 0; attempt <= MAX_FIX_ATTEMPTS; attempt++) {
    sendAppEvent(appId, 'app-progress', {
      step: 'building',
      message: attempt === 0
        ? 'Building Docker image (this may take 1-3 minutes)...'
        : `Auto-fix attempt ${attempt}/${MAX_FIX_ATTEMPTS}: rebuilding...`,
    });

    const result = await startApp(appId, appDir);

    if (result.ok) {
      await GeneratedAppModel.updateOne(
        { appId },
        { status: 'running', previewUrl: result.url, previewPort: result.port, lastError: null },
      );
      sendAppEvent(appId, 'app-running', {
        appId,
        url: result.url,
        port: result.port,
      });
      return;
    }

    // Failed — try auto-fix if we have attempts left
    if (attempt < MAX_FIX_ATTEMPTS) {
      sendAppEvent(appId, 'app-progress', {
        step: 'fixing',
        message: `Build failed. Running auto-fix (${attempt + 1}/${MAX_FIX_ATTEMPTS})...`,
      });

      try {
        // Stop the failed containers
        await stopApp(appId, appDir);

        // Read current files from disk
        const currentFiles = await readProjectFiles(appDir);

        // Ask LLM to fix (using same provider as original generation)
        const appProvider: GenerationProvider = (app.provider as GenerationProvider) ?? 'openai';
        const fixedFiles = await generateFix(currentFiles, result.error ?? 'Unknown error', appProvider);

        // Rewrite project
        await writeProject(appDir, fixedFiles);

        await GeneratedAppModel.updateOne(
          { appId },
          { fixAttempts: attempt + 1 },
        );
      } catch (fixErr) {
        console.error(`[apps] Fix attempt ${attempt + 1} failed:`, fixErr);
      }
    } else {
      // All attempts exhausted
      await GeneratedAppModel.updateOne(
        { appId },
        {
          status: 'failed',
          lastError: result.error ?? 'Build failed after all fix attempts',
          fixAttempts: MAX_FIX_ATTEMPTS,
        },
      );
      sendAppEvent(appId, 'app-error', {
        appId,
        error: result.error ?? 'Build failed after all fix attempts',
        fixAttempts: MAX_FIX_ATTEMPTS,
      });

      // Clean up failed containers
      await stopApp(appId, appDir);
    }
  }
}

async function readProjectFiles(appDir: string): Promise<GeneratedFile[]> {
  const files: GeneratedFile[] = [];

  async function walk(dir: string, prefix: string) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        // Only recurse into client/ and server/ directories, skip node_modules
        if (entry.name === 'node_modules' || entry.name === '.git') continue;
        await walk(`${dir}/${entry.name}`, relPath);
      } else {
        // Only include files under client/ or server/
        if (relPath.startsWith('client/') || relPath.startsWith('server/')) {
          try {
            const content = await fs.readFile(`${dir}/${entry.name}`, 'utf-8');
            files.push({ path: relPath, content });
          } catch {
            // Skip unreadable files
          }
        }
      }
    }
  }

  await walk(appDir, '');
  return files;
}
