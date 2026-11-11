import { loadEnvironment } from './backend/environment.js';
const environment = loadEnvironment();
const { createApp } = await import('./backend/app.js');
const { app, close } = await createApp();
const port = Number(process.env.PORT || 8000);
const server = app.listen(port, process.env.HOST || '127.0.0.1', () => console.log(`Have a Guru (${environment.name}) running on http://localhost:${server.address().port} — S3 ${process.env.QUOTES_BUCKET}/${environment.prefix}/`));
server.requestTimeout = 120000;
server.on('error', error => { console.error(error.message); close(); process.exitCode = 1; });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(async () => { await close(); process.exit(0); }));
