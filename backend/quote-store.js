import { randomUUID } from "node:crypto";

export function migrateQuotes(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, phone_e164 TEXT NOT NULL UNIQUE, phone_verified_at TEXT, created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS quotes (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), phone_e164 TEXT NOT NULL,
    submission_key TEXT NOT NULL UNIQUE, request_hash TEXT NOT NULL, token_hash TEXT NOT NULL,
    consent_version TEXT NOT NULL, consent_text TEXT NOT NULL, created_at TEXT NOT NULL,
    uploaded_at TEXT, phone_verified_at TEXT, verification_method TEXT,
    matching_status TEXT NOT NULL DEFAULT 'uploading', expires_at INTEGER NOT NULL);
  CREATE INDEX IF NOT EXISTS quotes_user_date ON quotes(user_id, created_at);
  CREATE TABLE IF NOT EXISTS quote_files (
    id TEXT PRIMARY KEY, quote_id TEXT NOT NULL REFERENCES quotes(id), position INTEGER NOT NULL,
    original_name TEXT NOT NULL, mime_type TEXT NOT NULL, size INTEGER NOT NULL,
    s3_key TEXT NOT NULL UNIQUE, sha256 TEXT, storage_status TEXT NOT NULL DEFAULT 'pending',
    stored_at TEXT, last_error TEXT, UNIQUE(quote_id, position));
  CREATE TABLE IF NOT EXISTS phone_verifications (
    id TEXT PRIMARY KEY, quote_id TEXT NOT NULL REFERENCES quotes(id), provider_id TEXT,
    status TEXT NOT NULL, sends INTEGER NOT NULL DEFAULT 0, attempts INTEGER NOT NULL DEFAULT 0,
    last_sent_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, verified_at TEXT);
  CREATE INDEX IF NOT EXISTS verification_quote ON phone_verifications(quote_id);
  CREATE TABLE IF NOT EXISTS rate_counters (
    scope TEXT NOT NULL, subject TEXT NOT NULL, window INTEGER NOT NULL, count INTEGER NOT NULL,
    PRIMARY KEY(scope, subject, window));`);
  // Legacy tables and their local attachments remain intact. No prior phone is considered verified.
  db.exec("BEGIN IMMEDIATE");
  try {
    for (const row of db
      .prepare(
        "SELECT * FROM submissions WHERE id NOT IN (SELECT id FROM quotes)",
      )
      .all()) {
      const existing = db
        .prepare("SELECT id FROM users WHERE phone_e164=?")
        .get(row.phone);
      const userId = existing?.id || randomUUID();
      if (!existing)
        db.prepare("INSERT INTO users VALUES (?, ?, NULL, ?)").run(
          userId,
          row.phone,
          row.created_at,
        );
      db.prepare(
        `INSERT INTO quotes (id,user_id,phone_e164,submission_key,request_hash,token_hash,consent_version,consent_text,created_at,uploaded_at,matching_status,expires_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,'legacy_unverified',0)`,
      ).run(
        row.id,
        userId,
        row.phone,
        "legacy:" + row.id,
        "legacy",
        "disabled",
        row.consent_version,
        row.consent_text,
        row.created_at,
        row.created_at,
      );
      let position = 0;
      for (const file of db
        .prepare("SELECT * FROM files WHERE submission_id=?")
        .all(row.id)) {
        db.prepare(
          `INSERT INTO quote_files (id,quote_id,position,original_name,mime_type,size,s3_key,storage_status,stored_at) VALUES (?,?,?,?,?,?,?,'legacy_local',?)`,
        ).run(
          file.id,
          row.id,
          position++,
          file.original_name,
          file.mime_type,
          file.size,
          "quotes/" + row.id + "/" + file.id,
          row.created_at,
        );
      }
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function consume(
  db,
  scope,
  subject,
  limit,
  windowMs,
  amount = 1,
  now = Date.now(),
) {
  const window = Math.floor(now / windowMs);
  // The conditional UPSERT is atomic across requests, including reservations before external calls.
  const result = db
    .prepare(
      `INSERT INTO rate_counters VALUES (?,?,?,?)
    ON CONFLICT(scope,subject,window) DO UPDATE SET count=count+excluded.count
    WHERE count+excluded.count<=? RETURNING count`,
    )
    .get(scope, subject, window, amount, limit);
  if (!result || result.count > limit) {
    const error = new Error("Too many requests. Please try again later.");
    error.status = 429;
    throw error;
  }
  db.prepare("DELETE FROM rate_counters WHERE scope=? AND window<?").run(
    scope,
    window - 2,
  );
}
