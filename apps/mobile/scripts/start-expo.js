#!/usr/bin/env node
/**
 * Start Expo, loading .env first so NGROK_AUTHTOKEN is set when using --tunnel.
 * Use: pnpm run dev  OR  pnpm run dev -- --tunnel
 */
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const root = path.resolve(__dirname, '..');
const envPath = path.join(root, '.env');

if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  content.split('\n').forEach((line) => {
    const trimmed = line.replace(/^#.*/, '').trim();
    if (!trimmed) return;
    const m = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m) {
      const key = m[1];
      const val = m[2].trim().replace(/^["']|["']$/g, '');
      if (key && val !== undefined) process.env[key] = val;
    }
  });
}

const args = process.argv.slice(2);
const hasTunnel = args.includes('--tunnel');
const token = process.env.NGROK_AUTHTOKEN;
if (hasTunnel && token) {
  process.env.NGROK_CONFIG = JSON.stringify({ authtoken: token });
  console.warn('Tunnel: using NGROK_AUTHTOKEN from .env');
}
if (hasTunnel && !token) {
  console.warn(
    'Tip: Add NGROK_AUTHTOKEN to .env to avoid tunnel errors, or run: npx ngrok config add-authtoken YOUR_TOKEN\n  See apps/mobile/TUNNEL.md'
  );
}

// Use pnpm exec so Expo is resolved from workspace (apps/mobile has expo in dependencies)
const child = spawn('pnpm', ['exec', 'expo', 'start', ...args], {
  cwd: root,
  stdio: 'inherit',
  shell: true,
  env: process.env,
});
child.on('exit', (code) => process.exit(code ?? 0));
