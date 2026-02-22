#!/usr/bin/env node
/**
 * Start Expo with --tunnel, loading NGROK_AUTHTOKEN from .env so your own
 * ngrok account is used. This avoids "Cannot read properties of undefined (reading 'body')"
 * when Expo's shared tunnel fails.
 *
 * 1. Sign up at https://ngrok.com and get your authtoken:
 *    https://dashboard.ngrok.com/get-started/your-authtoken
 * 2. Add to apps/mobile/.env:  NGROK_AUTHTOKEN=your_token
 * 3. Run:  pnpm run tunnel
 */
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const root = path.resolve(__dirname, '..');
const envPath = path.join(root, '.env');

if (fs.existsSync(envPath)) {
  const env = process.env;
  const content = fs.readFileSync(envPath, 'utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  content.split('\n').forEach((line) => {
    const trimmed = line.replace(/^#.*/, '').trim();
    const m = trimmed.match(/^NGROK_AUTHTOKEN=(.+)$/);
    if (m) env.NGROK_AUTHTOKEN = m[1].trim().replace(/^["']|["']$/g, '');
  });
  if (env.NGROK_AUTHTOKEN) {
    env.NGROK_CONFIG = JSON.stringify({ authtoken: env.NGROK_AUTHTOKEN });
    console.warn('Tunnel: using NGROK_AUTHTOKEN from .env');
  } else {
    console.warn(
      'Tip: Add NGROK_AUTHTOKEN to .env (from https://dashboard.ngrok.com/get-started/your-authtoken) to use your own ngrok account and avoid tunnel errors.'
    );
  }
}

const child = spawn('npx', ['expo', 'start', '--tunnel'], {
  cwd: root,
  stdio: 'inherit',
  shell: true,
  env: process.env,
});
child.on('exit', (code) => process.exit(code ?? 0));
