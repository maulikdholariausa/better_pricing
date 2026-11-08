import { spawn } from 'node:child_process';
import { watch } from 'node:fs';
import { fileURLToPath } from 'node:url';
const cwd = fileURLToPath(new URL('../', import.meta.url));
let child;
let timer;
let restarting = false;
let pending = false;
let stopping = false;
function start() {
  child = spawn(process.execPath, ['server.js'], {
    cwd, stdio: 'inherit', env: { ...process.env, NODE_ENV: 'development', DEV_RELOAD: '1' },
  });
  child.on('error', error => console.error(error.message));
  child.on('exit', code => {
    if (!restarting && !stopping) console.log(`Server exited (${code}). Save a source file to retry. If port 8000 is occupied, stop the old npm start process first.`);
  });
}
async function restart() {
  if (stopping) return;
  if (restarting) { pending = true; return; }
  restarting = true;
  if (child && child.exitCode === null && child.signalCode === null) {
    await new Promise(resolve => { child.once('exit', resolve); child.kill('SIGTERM'); });
  }
  if (!stopping) { console.log('Source changed. Restarting…'); start(); }
  restarting = false;
  if (pending) { pending = false; schedule(); }
}
function schedule() { clearTimeout(timer); timer = setTimeout(restart, 150); }
const watchers = ['backend', 'content', 'dist'].map(dir => watch(new URL(`../${dir}/`, import.meta.url), { recursive: true }, schedule));
// Watch the directory so editor saves that replace server.js also keep working.
watchers.push(watch(new URL('../', import.meta.url), (_event, filename) => {
  if (filename?.toString() === 'server.js') schedule();
}));
function stop() {
  stopping = true; clearTimeout(timer); watchers.forEach(w => w.close());
  if (child && child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
start();
