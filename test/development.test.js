import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { installDevReload } from '../backend/dev.js';
import { sectionAnchors } from '../backend/site.js';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, copyFile, writeFile, rm } from 'node:fs/promises';
import { once } from 'node:events';
import path from 'node:path';
import os from 'node:os';

test('section slugs handle accents, repeated headings and legacy ID collisions', () => {
  assert.deepEqual(sectionAnchors([['Get written clarifications'], ['Get written clarifications'], ['Section 1'], ['Café & costs'], ['???']]), ['get-written-clarifications', 'get-written-clarifications-2', 'section-1-2', 'cafe-costs', 'topic']);
});

test('development reload injects HTML only and provides uncached startup version', async () => {
  const app = express(); installDevReload(app);
  app.get('/', (_req, res) => res.type('html').send('<!doctype html><body>Hello</body>'));
  app.get('/api/example', (_req, res) => res.json({ ok: true }));
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.match(await (await fetch(base)).text(), /src="\/__dev\/reload.js"/);
    assert.deepEqual(await (await fetch(base+'/api/example')).json(), { ok: true });
    const first = await fetch(base+'/__dev/version'); assert.equal(first.headers.get('cache-control'), 'no-store');
    assert.equal((await first.json()).version, (await (await fetch(base+'/__dev/version')).json()).version);
    assert.match(await (await fetch(base+'/__dev/reload.js')).text(), /location.reload\(\)/);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('dev supervisor restarts after a static file save and exits cleanly', { timeout: 10000 }, async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'guru-dev-'));
  let child;
  try {
    for (const dir of ['scripts','backend','content','dist']) await mkdir(path.join(temp, dir));
    await copyFile('scripts/dev.mjs', path.join(temp,'scripts/dev.mjs'));
    await writeFile(path.join(temp,'server.js'), 'console.log("START:"+process.pid); setInterval(()=>{},1000);');
    child = spawn(process.execPath, [path.join(temp,'scripts/dev.mjs')], { stdio: ['ignore','pipe','pipe'] });
    let output=''; const waiters=[];
    child.stdout.on('data', data => { output+=data; for(const resolve of waiters.splice(0)) resolve(); });
    async function starts(count) { while ((output.match(/START:/g)||[]).length<count) await new Promise(resolve=>waiters.push(resolve)); }
    await starts(1);
    await writeFile(path.join(temp,'dist/style.css'),'body{color:green}');
    await starts(2);
    const exited=once(child,'exit'); child.kill('SIGTERM'); await exited;
    assert.match(output,/Source changed/);
  } finally {
    if(child && child.exitCode===null && child.signalCode===null) child.kill('SIGTERM');
    await rm(temp,{recursive:true,force:true});
  }
});
