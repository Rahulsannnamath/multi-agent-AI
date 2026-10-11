import { randomBytes } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
import { passwordHash } from '../backend/api/src/ai-design-studio/auth.js';

const username = process.env['STUDIO_SETUP_USERNAME'] ?? 'studio';
const password = process.env['STUDIO_SETUP_PASSWORD'] ?? randomBytes(18).toString('base64url');
const target = '.env.ai-design-studio';
if (existsSync(target)) throw new Error(`${target} already exists. Edit its user configuration instead of overwriting it.`);
if (!/^[a-zA-Z0-9_-]{1,80}$/.test(username) || password.length < 12) throw new Error('Use a valid username and a password with at least 12 characters.');
writeFileSync(target, `AI_DESIGN_STUDIO_USERS='${JSON.stringify({ [username]: passwordHash(password) })}'\nAI_DESIGN_STUDIO_SESSION_SECRET=${randomBytes(48).toString('hex')}\n`, { flag: 'wx' });
if (!process.env['STUDIO_SETUP_PASSWORD']) {
  const credentials = '.env.ai-design-studio.credentials';
  writeFileSync(credentials, `Studio username: ${username}\nStudio password: ${password}\n`, { flag: 'wx' });
  console.log(`Studio access configured. Read ${credentials} locally for your generated login. Keep this file private.`);
} else console.log(`Studio access configured for ${username}.`);
console.log('Restart the API server. Production deployments also require VITE_TLDRAW_LICENSE_KEY.');
