/** Start the built Worker with an isolated, tracked local-demo environment. */
import { existsSync, mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const workspace = resolve(import.meta.dirname, '..');
const runtimeDirectory = resolve(workspace, '.mock-runtime');
const port = process.env.MOCK_PORT ?? '8787';
const wranglerCli = resolve(workspace, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
if (!existsSync(wranglerCli))
  throw new Error(
    `Local Wrangler CLI not found: ${wranglerCli}. Run npm install before npm run dev.`,
  );
const safeEnvironment = {
  PATH: process.env.PATH ?? '',
  Path: process.env.Path ?? '',
  SYSTEMROOT: process.env.SYSTEMROOT ?? '',
  SystemRoot: process.env.SystemRoot ?? '',
  COMSPEC: process.env.COMSPEC ?? '',
  PATHEXT: process.env.PATHEXT ?? '',
  TEMP: process.env.TEMP ?? '',
  TMP: process.env.TMP ?? '',
  HOME: process.env.HOME ?? '',
  USERPROFILE: process.env.USERPROFILE ?? '',
  ALLOW_DEMO_CONTENT: 'true',
  CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: 'false',
};

mkdirSync(runtimeDirectory, { recursive: true });
const worker = spawn(
  process.execPath,
  [
    wranglerCli,
    'dev',
    '--config',
    '../dist/server/wrangler.json',
    '--env-file',
    '../.env.mock',
    '--ip',
    '127.0.0.1',
    '--port',
    port,
    '--local',
    '--var',
    'ALLOW_DEMO_CONTENT:true',
  ],
  { cwd: runtimeDirectory, env: safeEnvironment, stdio: 'inherit', shell: false },
);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => worker.kill(signal));
}
worker.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
