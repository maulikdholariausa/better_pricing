import { installUploadRoute } from "./upload-quote.js";
import { randomUUID, createHash, timingSafeEqual } from "node:crypto";
import { consume } from "./quote-store.js";

const DAY = 86400000;
const hash = (value) => createHash("sha256").update(value).digest("hex");
const fail = (status, message) => Object.assign(new Error(message), { status });
const nowISO = () => new Date().toISOString();
export async function installQuoteRoutes(
  app,
  {
    db,
    uploads,
    services,
    production,
    consentVersion,
    consentText,
    quotesPrefix,
  },
) {
  const locks = new Set();
  const limited = (scope, subject, limit, window = DAY, amount = 1) =>
    consume(db, scope, hash(String(subject)), limit, window, amount);
  const readQuote = (id) =>
    db.prepare("SELECT * FROM quotes WHERE id=?").get(id);
  const filesFor = (id) =>
    db
      .prepare("SELECT * FROM quote_files WHERE quote_id=? ORDER BY position")
      .all(id);
  function receipt(quote) {
    return {
      id: quote.id,
      status: quote.matching_status,
      fileCount: filesFor(quote.id).length,
      files: filesFor(quote.id).map((f) => ({
        id: f.id,
        name: f.original_name,
        size: f.size,
        status: f.storage_status,
      })),
      verificationRequired: quote.matching_status === "awaiting_verification",
    };
  }
  function authorize(req, res, next) {
    const quote = readQuote(req.params.id),
      token = req.get("Authorization")?.replace(/^Bearer /, "");
    if (
      !quote ||
      typeof token !== "string" ||
      token.length > 128 ||
      quote.expires_at < Date.now() ||
      !timingSafeEqual(
        Buffer.from(hash(token)),
        Buffer.from(quote.token_hash.padEnd(64, "0").slice(0, 64)),
      )
    )
      return res
        .status(404)
        .json({
          error:
            "This verification request is unavailable or expired. Please upload your quote again.",
        });
    req.quote = quote;
    next();
  }
  app.use("/api", (req, res, next) => {
    res.set("Cache-Control", "private, no-store");
    if (req.method === "GET" || req.method === "HEAD") return next();
    const origins = (
      process.env.PUBLIC_ORIGINS ||
      process.env.PUBLIC_ORIGIN ||
      ""
    )
      .split(",")
      .map((x) => x.trim());
    if (production && !origins.includes(req.get("origin")))
      return res.status(403).json({ error: "Please submit from our website." });
    try {
      limited("api-ip", req.visitorIp, 120, 60000);
      next();
    } catch (error) {
      next(error);
    }
  });
  const uploadControl = await installUploadRoute(app, {
    db,
    uploads,
    services,
    consentVersion,
    consentText,
    quotesPrefix,
    receipt,
  });
  app.post(
    "/api/quotes/:id/verification/send",
    authorize,
    async (req, res, next) => {
      const quote = req.quote;
      if (quote.matching_status !== "awaiting_verification")
        return next(
          fail(
            409,
            "Finish uploading your quote first, or it has already been verified.",
          ),
        );
      if (locks.has("sms:" + quote.id))
        return next(fail(429, "A verification message is already being sent."));
      locks.add("sms:" + quote.id);
      try {
        let challenge = db
          .prepare(
            "SELECT * FROM phone_verifications WHERE quote_id=? ORDER BY rowid DESC LIMIT 1",
          )
          .get(quote.id);
        const time = Date.now();
        if (challenge && time - challenge.last_sent_at >= DAY) challenge = null;
        if (challenge && time - challenge.last_sent_at < 60000)
          throw fail(
            429,
            "Please wait 60 seconds before requesting another code.",
          );
        // Resends do not reset attempts, so a caller cannot bypass the five-attempt limit.
        if (challenge && (challenge.sends >= 3 || challenge.attempts >= 5))
          throw fail(
            429,
            "The verification limit has been reached. Please try again tomorrow.",
          );
        db.exec("BEGIN IMMEDIATE");
        try {
          limited("sms-phone", quote.phone_e164, 3);
          limited("sms-ip", req.visitorIp, 10);
          limited("sms-global-day", "all", 100);
          limited(
            "sms-global-month",
            "all",
            Number(process.env.SMS_MONTHLY_SEND_LIMIT || 400),
            32 * DAY,
          );
          const previous = challenge;
          if (previous)
            db.prepare(
              "UPDATE phone_verifications SET status='superseded' WHERE id=?",
            ).run(previous.id);
          challenge = { id: randomUUID() };
          db.prepare(
            `INSERT INTO phone_verifications (id,quote_id,status,sends,attempts,last_sent_at,expires_at)
          VALUES (?,?,'sending',?,?,?,?)`,
          ).run(
            challenge.id,
            quote.id,
            (previous?.sends || 0) + 1,
            previous?.attempts || 0,
            time,
            time + 300000,
          );
          db.exec("COMMIT");
        } catch (error) {
          db.exec("ROLLBACK");
          throw error;
        }
        try {
          const result = await services.otp.send({
            phone: quote.phone_e164,
            reference: challenge.id,
          });
          db.prepare(
            "UPDATE phone_verifications SET status='pending',provider_id=? WHERE id=?",
          ).run(result.id || challenge.id, challenge.id);
        } catch {
          db.prepare(
            "UPDATE phone_verifications SET status='failed' WHERE id=?",
          ).run(challenge.id);
          throw fail(
            503,
            "Your quote is saved. We could not send the code. Please try again in a minute.",
          );
        }
        res.json({ status: "pending", expiresIn: 300, resendAfter: 60 });
      } catch (error) {
        next(error);
      } finally {
        locks.delete("sms:" + quote.id);
      }
    },
  );
  app.post(
    "/api/quotes/:id/verification/check",
    authorize,
    async (req, res, next) => {
      const quote = req.quote;
      if (quote.matching_status === "queued") return res.json(receipt(quote));
      const lock = "verify:" + quote.id;
      if (locks.has(lock))
        return next(
          fail(429, "Please wait for the current verification attempt."),
        );
      locks.add(lock);
      try {
        if (quote.matching_status !== "awaiting_verification")
          throw fail(409, "Finish uploading your quote first.");
        const challenge = db
          .prepare(
            "SELECT * FROM phone_verifications WHERE quote_id=? ORDER BY rowid DESC LIMIT 1",
          )
          .get(quote.id);
        if (
          !challenge ||
          challenge.status !== "pending" ||
          challenge.expires_at < Date.now()
        )
          throw fail(
            400,
            "This code has expired or is unavailable. Please request a new code.",
          );
        if (challenge.attempts >= 5)
          throw fail(
            429,
            "Too many incorrect codes. Please try again tomorrow.",
          );
        if (!/^\d{6}$/.test(String(req.body.code || "")))
          throw fail(400, "Enter the six-digit code from your text message.");
        db.prepare(
          "UPDATE phone_verifications SET attempts=attempts+1 WHERE id=?",
        ).run(challenge.id);
        let verified;
        try {
          verified = await services.otp.verify({
            phone: quote.phone_e164,
            reference: challenge.id,
            code: String(req.body.code),
          });
        } catch {
          throw fail(
            503,
            "Verification is temporarily unavailable. Your quote is saved.",
          );
        }
        if (!verified)
          throw fail(
            400,
            "That code is incorrect or expired. Please check your text message.",
          );
        db.exec("BEGIN IMMEDIATE");
        try {
          const at = nowISO();
          db.prepare(
            "UPDATE users SET phone_verified_at=COALESCE(phone_verified_at,?) WHERE id=?",
          ).run(at, quote.user_id);
          const user = db
            .prepare("SELECT * FROM users WHERE id=?")
            .get(quote.user_id);
          db.prepare(
            "UPDATE quotes SET phone_verified_at=?,verification_method='sms',matching_status='queued' WHERE id=?",
          ).run(user.phone_verified_at, quote.id);
          db.prepare(
            "UPDATE phone_verifications SET status='verified',verified_at=? WHERE id=?",
          ).run(at, challenge.id);
          db.exec("COMMIT");
        } catch (error) {
          db.exec("ROLLBACK");
          throw error;
        }
        res.json(receipt(readQuote(quote.id)));
      } catch (error) {
        next(error);
      } finally {
        locks.delete(lock);
      }
    },
  );
  return uploadControl;
}
