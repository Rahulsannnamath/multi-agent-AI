// apps/api/src/index.ts
// Express API Server entry point

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = process.env['ENV_FILE'] ?? path.resolve(__dirname, '../../../.env');
const envResult = dotenv.config({ path: envPath });
if (envResult.error) {
  console.warn(`[config] Could not load environment file: ${envPath}`);
}

for (const key of ['OPENAI_API_KEY', 'OPENAI_MODEL', 'OLLAMA_BASE_URL', 'OLLAMA_MODEL', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_BEDROCK_MODEL', 'AWS_BEDROCK_REGION']) {
  const value = process.env[key];
  if (value !== undefined) process.env[key] = value.trim();
}

console.log(`[config] OpenAI API key: ${process.env['OPENAI_API_KEY'] ? 'loaded' : 'missing'}`);
console.log(`[config] AWS IAM Credentials: ${process.env['AWS_ACCESS_KEY_ID'] && process.env['AWS_SECRET_ACCESS_KEY'] ? 'loaded' : 'missing'}`);
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { connectDB } from './db/connection.js';
import { projectsRouter } from './routes/projects.router.js';
import { experimentsRouter } from './routes/experiments.router.js';
import { providersRouter } from './routes/providers.router.js';
import { appsRouter } from './routes/apps.router.js';
import { diagramsRouter } from './routes/diagrams.router.js';
import { reactflowArchitecturesRouter } from './routes/reactflow-architectures.router.js';
import { studioRouter } from './ai-design-studio/router.js';
dotenv.config({ path: path.resolve(__dirname, '../../../.env.ai-design-studio') });
import { checkDocker } from './gen/runner.js';

const app = express();
const PORT = parseInt(process.env['PORT'] ?? '4000', 10);

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors({
  origin: process.env['CORS_ORIGIN'] ?? 'http://localhost:5173',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/projects', projectsRouter);
app.use('/api/experiments', experimentsRouter);
app.use('/api/providers', providersRouter);
app.use('/api/apps', appsRouter);
app.use('/api/diagrams', diagramsRouter);
app.use('/api/reactflow-architectures', reactflowArchitecturesRouter);
app.use('/api/ai-design-studio', studioRouter);

// ── Health Check ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    uptime: process.uptime(),
    environment: process.env['NODE_ENV'] ?? 'development',
  });
});

// ── 404 Handler ───────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ── Error Handler ─────────────────────────────────────────────────────────────
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[server] Unhandled error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// ── Start ─────────────────────────────────────────────────────────────────────
async function start() {
  try {
    await connectDB();

    // Check Docker availability on startup (non-fatal)
    const dockerErr = await checkDocker();
    if (dockerErr) {
      console.warn(`[server] ⚠ Docker check: ${dockerErr}`);
      console.warn('[server] Live Preview will not work until Docker is running.');
    } else {
      console.log('[server] ✓ Docker is available for Live Preview');
    }

    app.listen(PORT, () => {
      console.log(`[server] API server running at http://localhost:${PORT}`);
      console.log(`[server] Health: http://localhost:${PORT}/health`);
    });
  } catch (err) {
    console.error('[server] Failed to start:', err);
    process.exit(1);
  }
}

start();
