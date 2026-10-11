// backend/api/src/gen/runner.ts
// Docker runner: start, stop, health-check generated apps.

import { execFile, spawn } from 'child_process';
import { promisify } from 'util';
import net from 'net';

const execFileAsync = promisify(execFile);

/**
 * Find a free TCP port on the host.
 */
export async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      if (!addr || typeof addr === 'string') {
        srv.close();
        reject(new Error('Could not determine free port'));
        return;
      }
      const port = addr.port;
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

/**
 * Check if Docker is available. Returns an error message if not.
 */
export async function checkDocker(): Promise<string | null> {
  try {
    await execFileAsync('docker', ['info'], { timeout: 10000 });
    return null;
  } catch (err) {
    return 'Docker is not running or not installed. Please start Docker Desktop and try again.';
  }
}

export interface StartResult {
  ok: boolean;
  url?: string;
  port?: number;
  error?: string;
}

/**
 * Start a generated app via docker compose.
 * Uses execFile with args array — never shell-concatenated commands.
 */
export async function startApp(appId: string, appDir: string): Promise<StartResult> {
  const projectName = `genapp-${appId}`;
  const port = await freePort();

  // Build and start
  try {
    await execFileAsync(
      'docker',
      ['compose', '-p', projectName, 'up', '-d', '--build'],
      {
        cwd: appDir,
        env: { ...process.env, APP_PORT: String(port) },
        maxBuffer: 50 * 1024 * 1024, // 50 MB
        timeout: 300_000, // 5 minutes
      },
    );
  } catch (err: unknown) {
    const stderr = (err as { stderr?: string }).stderr ?? String(err);
    return { ok: false, error: stderr.slice(-3000) };
  }

  // Poll /api/health for up to ~90 seconds
  const healthUrl = `http://127.0.0.1:${port}/api/health`;
  const startTime = Date.now();
  const maxWait = 90_000;
  let lastError = '';

  while (Date.now() - startTime < maxWait) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(healthUrl, { signal: controller.signal });
      clearTimeout(timeout);
      if (res.ok) {
        return { ok: true, url: `http://localhost:${port}`, port };
      }
      lastError = `Health check returned ${res.status}`;
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
    await new Promise((r) => setTimeout(r, 3000));
  }

  // Health check failed — get logs for diagnostics
  try {
    const { stdout, stderr } = await execFileAsync(
      'docker',
      ['compose', '-p', projectName, 'logs', '--tail', '60', 'app'],
      { cwd: appDir, maxBuffer: 10 * 1024 * 1024, timeout: 15_000 },
    );
    const logs = (stderr + '\n' + stdout).trim();
    return { ok: false, error: `Health check timed out. Last error: ${lastError}\n\nContainer logs:\n${logs.slice(-3000)}` };
  } catch {
    return { ok: false, error: `Health check timed out. Last error: ${lastError}` };
  }
}

/**
 * Stop a running app: docker compose down -v, then remove the image.
 */
export async function stopApp(appId: string, appDir: string): Promise<void> {
  const projectName = `genapp-${appId}`;
  try {
    await execFileAsync(
      'docker',
      ['compose', '-p', projectName, 'down', '-v', '--rmi', 'local'],
      { cwd: appDir, maxBuffer: 10 * 1024 * 1024, timeout: 60_000 },
    );
  } catch (err) {
    console.error(`[runner] stopApp ${appId} error:`, err);
  }
}
