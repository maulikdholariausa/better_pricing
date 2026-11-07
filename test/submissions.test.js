import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createApp, CONSENT_VERSION } from '../backend/app.js';

test('quotes persist privately; invalid consent, files and phone are rejected without leftovers', async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'quotes-test-'));
  const { app, close } = await createApp({ dataDir });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const send = async (fields = {}, content = '%PDF-1.7\nquote') => {
    const body = new FormData();
    for (const [key, value] of Object.entries({ phone: '4155551234', consent: 'true', consentVersion: CONSENT_VERSION, ...fields })) body.append(key, value);
    body.append('quotes', new Blob([content], { type: 'application/pdf' }), 'quote.pdf');
    return fetch(base + '/api/quotes', { method: 'POST', body });
  };
  try {
    assert.equal((await fetch(base + '/api/health')).status, 200);
    assert.equal((await send({ consent: 'false' })).status, 400);
    assert.equal((await send({ phone: '123' })).status, 400);
    assert.equal((await send({}, 'fake pdf')).status, 400);
    assert.equal((await send({ consentVersion: 'old' })).status, 400);
    assert.deepEqual(await readdir(path.join(dataDir, 'uploads')), []);
    const response = await send();
    assert.equal(response.status, 201);
    const receipt = await response.json();
    assert.equal(receipt.fileCount, 1);
    const db = new DatabaseSync(path.join(dataDir, 'quotes.sqlite'));
    const saved = db.prepare('SELECT * FROM submissions WHERE id = ?').get(receipt.id);
    assert.equal(saved.phone, '+14155551234');
    assert.equal(saved.consent_version, CONSENT_VERSION);
    const file = db.prepare('SELECT * FROM files').get();
    assert.equal((await fetch(base + '/uploads/' + file.stored_name)).status, 404);
    assert.equal((await readdir(path.join(dataDir, 'uploads'))).length, 1);
    db.close();
  } finally {
    await new Promise(resolve => server.close(resolve)); close();
    await rm(dataDir, { recursive: true, force: true });
  }
});

test('production accepts both configured origins and rejects others', async () => {
  const previous = process.env.PUBLIC_ORIGINS;
  process.env.PUBLIC_ORIGINS = 'https://haveaguru.com,https://www.haveaguru.com';
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'quotes-origin-test-'));
  const { app, close } = await createApp({ dataDir, production: true });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}/api/quotes`;
  try {
    for (const origin of ['https://haveaguru.com', 'https://www.haveaguru.com']) {
      const body = new FormData();
      body.append('phone', '4155551234');
      body.append('consent', 'true');
      body.append('consentVersion', CONSENT_VERSION);
      body.append('quotes', new Blob(['%PDF-1.7\nquote'], { type: 'application/pdf' }), 'quote.pdf');
      assert.equal((await fetch(url, { method: 'POST', headers: { Origin: origin }, body })).status, 201);
    }
    assert.equal((await fetch(url, { method: 'POST', headers: { Origin: 'https://other.example' } })).status, 403);
    assert.equal((await fetch(url, { method: 'POST' })).status, 403);
  } finally {
    await new Promise(resolve => server.close(resolve)); close();
    await rm(dataDir, { recursive: true, force: true });
    if (previous === undefined) delete process.env.PUBLIC_ORIGINS;
    else process.env.PUBLIC_ORIGINS = previous;
  }
});
