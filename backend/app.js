import express from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdir, rm, open, chmod } from 'node:fs/promises';
import path from 'node:path';
import { installSite } from './site.js';
import { installDevReload } from './dev.js';

export const CONSENT_VERSION = '2026-11-10-have-a-guru-v3';
export const CONSENT_TEXT = 'I authorize Have a Guru to review my quote(s) and share my phone number, original quoted pricing and relevant project details with matched contractors. Those contractors may contact me to ask for more details and schedule appointments for competitive quotes.';
export async function createApp({ dataDir = process.env.DATA_DIR || './data', production = process.env.NODE_ENV === 'production' } = {}) {
  const uploads = path.resolve(dataDir, 'uploads');
  await mkdir(uploads, { recursive: true, mode: 0o700 });
  const dbPath = path.resolve(dataDir, 'quotes.sqlite');
  const db = new DatabaseSync(dbPath);
  await chmod(dbPath, 0o600);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS submissions (id TEXT PRIMARY KEY, phone TEXT NOT NULL, consent_version TEXT NOT NULL, consent_text TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS files (id TEXT PRIMARY KEY, submission_id TEXT NOT NULL REFERENCES submissions(id), original_name TEXT NOT NULL, stored_name TEXT NOT NULL, mime_type TEXT NOT NULL, size INTEGER NOT NULL);`);
  const app = express();
  app.disable('x-powered-by');
  // Exactly one trusted reverse proxy in the production Compose network.
  if (production) app.set('trust proxy', 1);
  app.use((req, res, next) => {
    res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'X-Frame-Options': 'DENY' });
    next();
  });
  if (!production && process.env.DEV_RELOAD === '1') installDevReload(app);
  await installSite(app);
  app.get('/api/health', (_req, res) => {
    try { db.prepare('SELECT 1').get(); res.json({ status: 'ok' }); }
    catch { res.status(503).json({ status: 'unavailable' }); }
  });
  const upload = multer({
    storage: multer.diskStorage({
      destination: uploads,
      filename: (_req, _file, cb) => cb(null, randomUUID()),
    }),
    limits: { fileSize: 20 * 1024 * 1024, files: 5, fields: 3, fieldSize: 1024, parts: 8 },
    fileFilter: (_req, file, cb) => {
      const allowed = { 'application/pdf': /\.pdf$/i, 'image/jpeg': /\.jpe?g$/i, 'image/png': /\.png$/i };
      cb(allowed[file.mimetype]?.test(file.originalname) ? null : new Error('Use PDF, JPG or PNG files.'), Boolean(allowed[file.mimetype]?.test(file.originalname)));
    },
  }).array('quotes', 5);
  app.post('/api/quotes', rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false }), (req, res, next) => {
    const allowedOrigins = (process.env.PUBLIC_ORIGINS || process.env.PUBLIC_ORIGIN || '').split(',').map(origin => origin.trim()).filter(Boolean);
    if (production && !allowedOrigins.includes(req.get('origin'))) return res.status(403).json({ error: 'Please submit from our website.' });
    upload(req, res, async error => {
      const files = req.files || [];
      let committed = false;
      try {
        if (error) throw error;
        let phone = String(req.body.phone || '').replace(/\D/g, '');
        if (phone.length === 11 && phone.startsWith('1')) phone = phone.slice(1);
        if (!/^[2-9]\d{2}[2-9]\d{6}$/.test(phone)) throw new Error('Please enter a valid US phone number.');
        if (req.body.consent !== 'true' || req.body.consentVersion !== CONSENT_VERSION) throw new Error('Please accept the current contractor-sharing consent.');
        if (!files.length) throw new Error('Please add at least one quote.');
        for (const file of files) {
          await chmod(file.path, 0o600);
          const handle = await open(file.path, 'r');
          const signature = Buffer.alloc(8);
          try { await handle.read(signature, 0, 8, 0); } finally { await handle.close(); }
          const valid = file.mimetype === 'application/pdf' ? signature.subarray(0, 5).toString() === '%PDF-' : file.mimetype === 'image/png' ? signature.equals(Buffer.from([137,80,78,71,13,10,26,10])) : signature[0] === 255 && signature[1] === 216 && signature[2] === 255;
          if (!valid) throw new Error('A file does not match its PDF, JPG or PNG format.');
        }
        const id = randomUUID();
        db.exec('BEGIN');
        try {
          db.prepare('INSERT INTO submissions VALUES (?, ?, ?, ?, ?)').run(id, '+1' + phone, CONSENT_VERSION, CONSENT_TEXT, new Date().toISOString());
          const insert = db.prepare('INSERT INTO files VALUES (?, ?, ?, ?, ?, ?)');
          for (const file of files) insert.run(randomUUID(), id, file.originalname, file.filename, file.mimetype, file.size);
          db.exec('COMMIT'); committed = true;
        } catch (failure) { db.exec('ROLLBACK'); throw failure; }
        res.status(201).json({ id, fileCount: files.length });
      } catch (failure) {
        if (!committed) await Promise.all(files.map(file => rm(file.path, { force: true })));
        if (failure instanceof multer.MulterError || !committed && ['Please', 'Use ', 'A file'].some(prefix => failure.message.startsWith(prefix))) {
          res.status(400).json({ error: failure instanceof multer.MulterError ? 'Upload up to 5 files, no more than 20 MB each.' : failure.message });
        } else { next(failure); }
      }
    });
  });
  app.use(express.static(path.resolve('dist'), { dotfiles: 'deny' }));
  app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
  app.use((error, _req, res, _next) => {
    console.error('Request failed:', error.code || error.name);
    res.status(500).json({ error: 'Unable to save your quotes. Please try again.' });
  });
  return { app, close: () => db.close() };
}
