import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createApp, CONSENT_VERSION, CONSENT_TEXT } from "../backend/app.js";

async function fixture(production = false) {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "guru-test-"));
  let failAt = 0,
    puts = 0,
    sendCalls = 0;
  const stored = new Map();
  const services = {
    storage: {
      async put(file) {
        stored.set(file.key, file.checksum);
        if (++puts === failAt) throw Error("S3 acknowledgement lost");
      },
      async remove({ key }) {
        stored.delete(key);
      },
    },
    otp: {
      async send() {
        sendCalls++;
        return { id: randomUUID() };
      },
      async verify({ code }) {
        return code === "123456";
      },
    },
  };
  const { app, close } = await createApp({ dataDir, production, services });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${server.address().port}`,
    db = new DatabaseSync(path.join(dataDir, "quotes.sqlite"));
  async function request(
    endpoint,
    { body, token, origin = "https://haveaguru.com", method = "POST" } = {},
  ) {
    const multipart = body instanceof FormData;
    const response = await fetch(base + endpoint, {
      method,
      headers: {
        Origin: origin,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body && !multipart ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? (multipart ? body : JSON.stringify(body)) : undefined,
    });
    return { status: response.status, body: await response.json() };
  }
  async function start({
    phone = "4155551234",
    consent = "true",
    consentVersion = CONSENT_VERSION,
    count = 1,
    content = "%PDF-1.7\nquote",
    origin,
  } = {}) {
    puts = 0;
    const body = new FormData();
    body.append("phone", phone);
    body.append("consent", consent);
    body.append("consentVersion", consentVersion);
    for (let i = 0; i < count; i++)
      body.append(
        "quotes",
        new Blob([content], { type: "application/pdf" }),
        `page${i}.pdf`,
      );
    const result = await request("/api/quotes", { body, origin });
    return { ...result, token: result.body.verificationToken };
  }
  return {
    dataDir,
    db,
    stored,
    request,
    start,
    setFail: (n) => {
      failAt = n;
    },
    sends: () => sendCalls,
    async close() {
      await new Promise((r) => server.close(r));
      await close();
      db.close();
      await rm(dataDir, { recursive: true, force: true });
    },
  };
}

test("any failed file removes the entire submission, including acknowledged and unacknowledged objects", async () => {
  const f = await fixture();
  try {
    f.setFail(2);
    const failed = await f.start({ count: 3 });
    assert.equal(failed.status, 503);
    assert.match(failed.body.error, /upload everything again/);
    assert.equal(f.stored.size, 0);
    for (const table of ["quotes", "quote_files", "users"])
      assert.equal(f.db.prepare(`SELECT count(*) n FROM ${table}`).get().n, 0);
    assert.deepEqual(await readdir(path.join(f.dataDir, "staging")), []);
    f.setFail(0);
    const fresh = await f.start({ count: 3 });
    assert.equal(fresh.status, 201);
    assert.equal(fresh.body.fileCount, 3);
    assert.equal(fresh.body.status, "awaiting_verification");
    assert.equal(f.db.prepare("SELECT count(*) n FROM quotes").get().n, 1);
    assert.equal(f.stored.size, 3);
    assert.equal(
      f.db.prepare("SELECT consent_text FROM quotes").get().consent_text,
      CONSENT_TEXT,
    );
    assert.ok(f.token !== fresh.token);
  } finally {
    await f.close();
  }
});
test("successful upload verifies once and later uploads bypass verification", async () => {
  const f = await fixture();
  try {
    const q = await f.start({ count: 3 });
    assert.equal(q.status, 201);
    const endpoint = `/api/quotes/${q.body.id}`;
    assert.equal(
      (await f.request(endpoint + "/verification/send", { token: q.token }))
        .status,
      200,
    );
    assert.equal(
      (await f.request(endpoint + "/verification/send", { token: q.token }))
        .status,
      429,
    );
    assert.equal(
      (
        await f.request(endpoint + "/verification/check", {
          token: q.token,
          body: { code: "123456" },
        })
      ).body.status,
      "queued",
    );
    f.setFail(1);
    assert.equal((await f.start()).status, 503);
    assert.equal(f.stored.size, 3);
    assert.equal(f.db.prepare("SELECT count(*) n FROM quotes").get().n, 1);
    assert.ok(
      f.db.prepare("SELECT phone_verified_at FROM users").get()
        .phone_verified_at,
    );
    f.setFail(0);
    const next = await f.start();
    assert.equal(next.body.status, "queued");
    assert.equal(f.sends(), 1);
    assert.equal(
      f.db
        .prepare("SELECT verification_method FROM quotes WHERE id=?")
        .get(next.body.id).verification_method,
      "previously_verified_phone",
    );
  } finally {
    await f.close();
  }
});
test("invalid files, consent and non-US phones leave no submission or files", async () => {
  const f = await fixture();
  try {
    for (const options of [
      { phone: "+14165551234" },
      { phone: "123" },
      { consent: "false" },
      { consentVersion: "old" },
      { count: 0 },
      { content: "fake pdf" },
      { count: 6 },
    ])
      assert.equal((await f.start(options)).status, 400);
    assert.equal(f.stored.size, 0);
    assert.equal(f.db.prepare("SELECT count(*) n FROM quotes").get().n, 0);
    assert.deepEqual(await readdir(path.join(f.dataDir, "staging")), []);
  } finally {
    await f.close();
  }
});
test("verification is token protected and blocks after five incorrect codes", async () => {
  const f = await fixture();
  try {
    const q = await f.start(),
      endpoint = `/api/quotes/${q.body.id}`;
    assert.equal(
      (await f.request(endpoint + "/verification/send", { token: "bad" }))
        .status,
      404,
    );
    await f.request(endpoint + "/verification/send", { token: q.token });
    for (let i = 0; i < 5; i++)
      assert.equal(
        (
          await f.request(endpoint + "/verification/check", {
            token: q.token,
            body: { code: "000000" },
          })
        ).status,
        400,
      );
    assert.equal(
      (
        await f.request(endpoint + "/verification/check", {
          token: q.token,
          body: { code: "123456" },
        })
      ).status,
      429,
    );
    assert.equal(
      f.db.prepare("SELECT phone_verified_at FROM users").get()
        .phone_verified_at,
      null,
    );
  } finally {
    await f.close();
  }
});
test("production accepts configured origins and rejects outside origins", async () => {
  const previous = process.env.PUBLIC_ORIGINS;
  process.env.PUBLIC_ORIGINS =
    "https://haveaguru.com,https://www.haveaguru.com";
  const f = await fixture(true);
  try {
    assert.equal((await f.start()).status, 201);
    assert.equal(
      (await f.start({ origin: "https://www.haveaguru.com" })).status,
      201,
    );
    assert.equal(
      (await f.start({ origin: "https://evil.example" })).status,
      403,
    );
  } finally {
    await f.close();
    if (previous === undefined) delete process.env.PUBLIC_ORIGINS;
    else process.env.PUBLIC_ORIGINS = previous;
  }
});
test("SMS resends retain the incorrect-code limit", async () => {
  const f = await fixture();
  try {
    const q = await f.start(),
      endpoint = `/api/quotes/${q.body.id}`;
    await f.request(endpoint + "/verification/send", { token: q.token });
    const old = f.db.prepare("SELECT * FROM phone_verifications").get();
    await f.request(endpoint + "/verification/check", {
      token: q.token,
      body: { code: "000000" },
    });
    f.db
      .prepare("UPDATE phone_verifications SET last_sent_at=? WHERE id=?")
      .run(Date.now() - 61000, old.id);
    await f.request(endpoint + "/verification/send", { token: q.token });
    const latest = f.db
      .prepare("SELECT * FROM phone_verifications ORDER BY rowid DESC LIMIT 1")
      .get();
    assert.notEqual(latest.id, old.id);
    assert.equal(latest.attempts, 1);
    assert.equal(latest.sends, 2);
  } finally {
    await f.close();
  }
});
test("legacy quote migration preserves original records and local attachments without inventing verification", async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "guru-legacy-"));
  const db = new DatabaseSync(path.join(dataDir, "quotes.sqlite"));
  db.exec(`CREATE TABLE submissions(id TEXT PRIMARY KEY,phone TEXT NOT NULL,consent_version TEXT NOT NULL,consent_text TEXT NOT NULL,created_at TEXT NOT NULL);
    CREATE TABLE files(id TEXT PRIMARY KEY,submission_id TEXT,original_name TEXT,stored_name TEXT,mime_type TEXT,size INTEGER);`);
  const id = randomUUID(),
    fileId = randomUUID();
  db.prepare("INSERT INTO submissions VALUES (?,?,?,?,?)").run(
    id,
    "+14155551234",
    "legacy",
    "legacy consent",
    "2026-01-01T00:00:00.000Z",
  );
  db.prepare("INSERT INTO files VALUES (?,?,?,?,?,?)").run(
    fileId,
    id,
    "original.pdf",
    "local-original",
    "application/pdf",
    14,
  );
  db.close();
  const { migrateQuotes } = await import("../backend/quote-store.js");
  const instance = new DatabaseSync(path.join(dataDir, "quotes.sqlite"));
  try {
    migrateQuotes(instance);
    migrateQuotes(instance);
    assert.equal(instance.prepare("SELECT count(*) n FROM quotes").get().n, 1);
    assert.equal(
      instance.prepare("SELECT matching_status FROM quotes").get()
        .matching_status,
      "legacy_unverified",
    );
    assert.equal(
      instance.prepare("SELECT phone_verified_at FROM users").get()
        .phone_verified_at,
      null,
    );
    assert.equal(
      instance.prepare("SELECT storage_status FROM quote_files").get()
        .storage_status,
      "legacy_local",
    );
    assert.equal(
      instance.prepare("SELECT stored_name FROM files").get().stored_name,
      "local-original",
    );
  } finally {
    instance.close();
    await rm(dataDir, { recursive: true, force: true });
  }
});

test("durable counters survive restart and atomically reject requests beyond their limit", async () => {
  const { consume } = await import("../backend/quote-store.js");
  const dir = await mkdtemp(path.join(os.tmpdir(), "guru-limits-"));
  let db = new DatabaseSync(path.join(dir, "rate.sqlite"));
  db.exec(
    "CREATE TABLE rate_counters(scope TEXT,subject TEXT,window INTEGER,count INTEGER,PRIMARY KEY(scope,subject,window))",
  );
  try {
    for (let i = 0; i < 3; i++)
      consume(db, "sms-phone", "hashed-phone", 3, 86400000);
    db.close();
    db = new DatabaseSync(path.join(dir, "rate.sqlite"));
    assert.throws(() => consume(db, "sms-phone", "hashed-phone", 3, 86400000), {
      status: 429,
    });
    assert.equal(db.prepare("SELECT count FROM rate_counters").get().count, 3);
  } finally {
    db.close();
    await rm(dir, { recursive: true, force: true });
  }
});
