import multer from "multer";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { readFile, chmod, rm } from "node:fs/promises";
import { parsePhoneNumberFromString } from "libphonenumber-js/max";
import { consume } from "./quote-store.js";

const MAX_SIZE = 20 * 1024 * 1024,
  DAY = 86400000;
const allowed = {
  "application/pdf": /\.pdf$/i,
  "image/jpeg": /\.jpe?g$/i,
  "image/png": /\.png$/i,
};
const hash = (value) => createHash("sha256").update(value).digest("hex");
const fail = (status, message) => Object.assign(new Error(message), { status });
export async function installUploadRoute(
  app,
  { db, uploads, services, consentVersion, consentText, quotesPrefix, receipt },
) {
  let active = 0,
    stopped = false,
    cleaning = null;
  async function clearQuote(id) {
    const quote = db
      .prepare(
        "SELECT * FROM quotes WHERE id=? AND matching_status='cleanup_pending'",
      )
      .get(id);
    if (!quote) return;
    // Include keys whose PUT may have succeeded even if its acknowledgement was lost.
    for (const file of db
      .prepare("SELECT s3_key FROM quote_files WHERE quote_id=?")
      .all(id))
      await services.storage.remove({ key: file.s3_key });
    db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare("DELETE FROM phone_verifications WHERE quote_id=?").run(id);
      db.prepare("DELETE FROM quote_files WHERE quote_id=?").run(id);
      db.prepare("DELETE FROM quotes WHERE id=?").run(id);
      db.prepare(
        "DELETE FROM users WHERE id=? AND phone_verified_at IS NULL AND NOT EXISTS (SELECT 1 FROM quotes WHERE user_id=?)",
      ).run(quote.user_id, quote.user_id);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
  async function retryCleanup() {
    if (cleaning || stopped) return cleaning;
    cleaning = (async () => {
      for (const row of db
        .prepare(
          "SELECT id FROM quotes WHERE matching_status='cleanup_pending'",
        )
        .all()) {
        try {
          await clearQuote(row.id);
        } catch (error) {
          console.error("Upload cleanup pending:", error.name);
        }
      }
    })();
    try {
      await cleaning;
    } finally {
      cleaning = null;
    }
  }
  // Retired, incomplete resumable uploads are no longer exposed or resumed.
  db.prepare(
    "UPDATE quotes SET matching_status='cleanup_pending' WHERE matching_status='uploading'",
  ).run();
  void retryCleanup();
  const timer = setInterval(() => void retryCleanup(), 60000);
  timer.unref();
  const upload = multer({
    storage: multer.diskStorage({
      destination: uploads,
      filename: (_req, _file, cb) => cb(null, randomUUID()),
    }),
    limits: {
      fileSize: MAX_SIZE,
      files: 5,
      fields: 3,
      fieldSize: 1024,
      parts: 8,
    },
    fileFilter: (_req, file, cb) =>
      cb(
        allowed[file.mimetype]?.test(file.originalname)
          ? null
          : fail(400, "Use PDF, JPG or PNG files."),
        Boolean(allowed[file.mimetype]?.test(file.originalname)),
      ),
  }).array("quotes", 5);
  app.post("/api/quotes", (req, res, next) => {
    if (active >= 4)
      return next(
        fail(429, "Uploads are busy. Please upload your files again shortly."),
      );
    active++;
    upload(req, res, async (parserError) => {
      const files = req.files || [];
      let id;
      try {
        if (parserError)
          throw fail(
            400,
            "Upload 1–5 PDF, JPG or PNG files, no more than 20 MB each.",
          );
        const phone = parsePhoneNumberFromString(
          String(req.body.phone || ""),
          "US",
        );
        if (!phone?.isValid() || phone.country !== "US")
          throw fail(400, "Please enter a valid US phone number.");
        if (
          req.body.consent !== "true" ||
          req.body.consentVersion !== consentVersion
        )
          throw fail(400, "Please accept the contractor-sharing consent.");
        if (!files.length)
          throw fail(400, "Please add at least one file for your quote.");
        for (const file of files) {
          await chmod(file.path, 0o600);
          const bytes = await readFile(file.path);
          const valid =
            file.size > 0 &&
            (file.mimetype === "application/pdf"
              ? bytes.subarray(0, 5).toString() === "%PDF-"
              : file.mimetype === "image/png"
                ? bytes
                    .subarray(0, 8)
                    .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
                : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255);
          if (!valid)
            throw fail(
              400,
              "A file does not match its PDF, JPG or PNG format.",
            );
          file.checksum = hash(bytes);
          file.id = randomUUID();
        }
        const token = randomBytes(32).toString("hex");
        db.exec("BEGIN IMMEDIATE");
        try {
          const limit = (scope, subject, count, window = DAY, amount = 1) =>
            consume(db, scope, hash(String(subject)), count, window, amount);
          limit("quote-ip", req.visitorIp, 10);
          limit("quote-phone", phone.number, 10);
          limit("quote-global", "all", 200);
          limit("file-ip", req.visitorIp, 30, 3600000, files.length);
          const bytes = files.reduce((sum, file) => sum + file.size, 0);
          limit("bytes-ip", req.visitorIp, 300 * 1024 * 1024, DAY, bytes);
          limit("bytes-global", "all", 2 * 1024 * 1024 * 1024, DAY, bytes);
          const existing = db
            .prepare("SELECT id FROM users WHERE phone_e164=?")
            .get(phone.number);
          const userId = existing?.id || randomUUID(),
            created = new Date().toISOString();
          if (!existing)
            db.prepare("INSERT INTO users VALUES (?,?,NULL,?)").run(
              userId,
              phone.number,
              created,
            );
          id = randomUUID();
          // Older columns are retained for DB compatibility; there is no resumable upload session.
          db.prepare(
            `INSERT INTO quotes(id,user_id,phone_e164,submission_key,request_hash,token_hash,consent_version,consent_text,created_at,expires_at) VALUES (?,?,?,?,?,?,?,?,?,?)`,
          ).run(
            id,
            userId,
            phone.number,
            id,
            "single-upload",
            hash(token),
            consentVersion,
            consentText,
            created,
            Date.now() + 3600000,
          );
          files.forEach((file, position) => {
            file.key = `${quotesPrefix}/${id}/${file.id}`;
            db.prepare(
              `INSERT INTO quote_files(id,quote_id,position,original_name,mime_type,size,s3_key,sha256) VALUES (?,?,?,?,?,?,?,?)`,
            ).run(
              file.id,
              id,
              position,
              file.originalname,
              file.mimetype,
              file.size,
              file.key,
              file.checksum,
            );
          });
          db.exec("COMMIT");
        } catch (error) {
          db.exec("ROLLBACK");
          id = null;
          throw error;
        }
        for (const file of files) {
          await services.storage.put({
            key: file.key,
            filePath: file.path,
            size: file.size,
            mime: file.mimetype,
            checksum: file.checksum,
          });
          db.prepare(
            "UPDATE quote_files SET storage_status='stored',stored_at=? WHERE id=?",
          ).run(new Date().toISOString(), file.id);
        }
        const quote = db.prepare("SELECT * FROM quotes WHERE id=?").get(id);
        const user = db
          .prepare("SELECT * FROM users WHERE id=?")
          .get(quote.user_id);
        db.prepare(
          `UPDATE quotes SET uploaded_at=?,phone_verified_at=?,verification_method=?,matching_status=? WHERE id=?`,
        ).run(
          new Date().toISOString(),
          user.phone_verified_at,
          user.phone_verified_at ? "previously_verified_phone" : null,
          user.phone_verified_at ? "queued" : "awaiting_verification",
          id,
        );
        // Detect an interrupted client before acknowledging the complete submission.
        if (res.destroyed || req.aborted)
          throw fail(400, "Upload interrupted. Please upload all files again.");
        await Promise.all(files.map((file) => rm(file.path, { force: true })));
        res
          .status(201)
          .json({
            ...receipt(db.prepare("SELECT * FROM quotes WHERE id=?").get(id)),
            verificationToken: token,
          });
      } catch (error) {
        if (id) {
          db.prepare(
            "UPDATE quotes SET matching_status='cleanup_pending' WHERE id=?",
          ).run(id);
          try {
            await clearQuote(id);
          } catch (cleanupError) {
            console.error("Upload cleanup pending:", cleanupError.name);
          }
        }
        if (!error.status)
          console.error(
            "Quote upload failed:",
            JSON.stringify({
              code: error.name,
              httpStatus: error.$metadata?.httpStatusCode,
              requestId: error.$metadata?.requestId,
            }),
          );
        await Promise.all(files.map((file) => rm(file.path, { force: true })));
        next(
          fail(
            error.status || 503,
            "Upload failed. Please select your files and upload everything again.",
          ),
        );
      } finally {
        await Promise.allSettled(
          files.map((file) => rm(file.path, { force: true })),
        );
        active--;
      }
    });
  });
  return {
    async close() {
      stopped = true;
      clearInterval(timer);
      if (cleaning) await cleaning;
    },
  };
}
