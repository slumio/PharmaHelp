import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
// Resolve storage before Next's generated server changes its working directory.
const env = { ...process.env, DATABASE_PATH: resolve(process.env.DATABASE_PATH ?? 'data/pharmahelp.sqlite') };
const child = spawn(process.execPath, ['.next-production/standalone/server.js'], { stdio: 'inherit', env });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 0; });
