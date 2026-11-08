import { randomUUID } from 'node:crypto';

export function installDevReload(app) {
  const version = randomUUID();
  app.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  app.get('/__dev/version', (_req, res) => res.json({ version }));
  app.get('/__dev/reload.js', (_req, res) => res.type('application/javascript').send(`(() => {
    let version;
    async function check() {
      try {
        const response = await fetch('/__dev/version', { cache: 'no-store' });
        if (!response.ok) return;
        const next = (await response.json()).version;
        if (version && next !== version) location.reload();
        version = next;
      } catch { /* Wait for the restarting server to become reachable. */ }
    }
    check();
    setInterval(check, 1000);
  })();`));
  app.use((_req, res, next) => {
    const send = res.send;
    res.send = function (body) {
      if (typeof body === 'string' && /^<!doctype html>/i.test(body)) {
        body = body.replace('</body>', '<script defer src="/__dev/reload.js"></script></body>');
      }
      return send.call(this, body);
    };
    next();
  });
}
