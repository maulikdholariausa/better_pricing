import { createApp } from './backend/app.js';
const { app, close } = await createApp();
const port = Number(process.env.PORT || 8000);
const server = app.listen(port, process.env.HOST || '127.0.0.1', () => console.log(`Contract Negotiations running on port ${port}`));
server.requestTimeout = 120000;
server.on('error', error => { console.error(error.message); close(); process.exitCode = 1; });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => { close(); process.exit(0); }));
