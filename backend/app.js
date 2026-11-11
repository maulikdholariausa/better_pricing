import { quotePrefix } from "./environment.js";
import express from "express";
import { timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import { DatabaseSync } from "node:sqlite";
import { mkdir, chmod, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { installSite } from "./site.js";
import { installDevReload } from "./dev.js";
import { migrateQuotes } from "./quote-store.js";
import { installQuoteRoutes } from "./quote-routes.js";
import { quoteServices } from "./quote-services.js";

export const CONSENT_VERSION = "2026-11-10-have-a-guru-v3";
export const CONSENT_TEXT =
  "I authorize Have a Guru to review my quote(s) and share my phone number, original quoted pricing and relevant project details with matched contractors. Those contractors may contact me to ask for more details and schedule appointments for competitive quotes.";
export async function createApp({
  dataDir = process.env.DATA_DIR || "./data",
  production = process.env.NODE_ENV === "production",
  services,
} = {}) {
  const uploads = path.resolve(dataDir, "staging");
  await mkdir(uploads, { recursive: true, mode: 0o700 });
  // Staging contains only transient new uploads; legacy documents remain in uploads/.
  for (const entry of await readdir(uploads))
    if (/^[a-f0-9-]{36}$/.test(entry))
      await rm(path.join(uploads, entry), { force: true });
  const dbPath = path.resolve(dataDir, "quotes.sqlite");
  const db = new DatabaseSync(dbPath);
  await chmod(dbPath, 0o600);
  db.exec(`PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS submissions (id TEXT PRIMARY KEY, phone TEXT NOT NULL, consent_version TEXT NOT NULL, consent_text TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS files (id TEXT PRIMARY KEY, submission_id TEXT NOT NULL REFERENCES submissions(id), original_name TEXT NOT NULL, stored_name TEXT NOT NULL, mime_type TEXT NOT NULL, size INTEGER NOT NULL);`);
  const app = express();
  app.disable("x-powered-by");
  // Exactly one trusted reverse proxy in the production Compose network.
  if (production) app.set("trust proxy", 1);
  app.use((req, res, next) => {
    if (req.path.startsWith("/api/"))
      res.set("Cache-Control", "private, no-store");
    res.set({
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "same-origin",
      "X-Frame-Options": "DENY",
    });
    next();
  });
  app.use((req, res, next) => {
    const secret = process.env.ORIGIN_SECRET,
      supplied = req.get("x-guru-origin");
    const trusted =
      secret &&
      supplied &&
      Buffer.byteLength(secret) === Buffer.byteLength(supplied) &&
      timingSafeEqual(Buffer.from(secret), Buffer.from(supplied));
    if (
      process.env.REQUIRE_CLOUDFRONT === "true" &&
      req.path !== "/api/health" &&
      !trusted
    )
      return res.status(403).json({ error: "Forbidden" });
    // The CloudFront viewer-request function overwrites this header before forwarding.
    const ip = trusted && req.get("x-guru-viewer-ip");
    req.visitorIp = isIP(ip || "") ? ip : req.ip;
    next();
  });
  if (!production && process.env.DEV_RELOAD === "1") installDevReload(app);
  await installSite(app);
  app.get("/api/health", (_req, res) => {
    try {
      db.prepare("SELECT 1").get();
      res.json({ status: "ok" });
    } catch {
      res.status(503).json({ status: "unavailable" });
    }
  });
  app.use(express.json({ limit: "16kb" }));
  app.use("/api", (req, _res, next) => {
    req.body ||= {};
    next();
  });
  migrateQuotes(db);
  const uploadControl = await installQuoteRoutes(app, {
    db,
    uploads,
    quotesPrefix: quotePrefix(),
    services: services || quoteServices({ dataDir, production }),
    production,
    consentVersion: CONSENT_VERSION,
    consentText: CONSENT_TEXT,
  });
  app.use(express.static(path.resolve("dist"), { dotfiles: "deny" }));
  app.use((_req, res) => res.status(404).json({ error: "Not found" }));
  app.use((error, _req, res, _next) => {
    if (!error.status || error.status >= 500)
      console.error("Request failed:", error.code || error.name);
    const status =
      (error.status >= 400 && error.status < 500) || error.status === 503
        ? error.status
        : 500;
    res.status(status).json({
      error: error.status
        ? error.message
        : "Unable to save your quote. Please try again.",
    });
  });
  return {
    app,
    close: async () => {
      await uploadControl.close();
      db.close();
    },
  };
}
