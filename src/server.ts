import { createApp } from './app';
import { parseEnvironment } from './config/env';
import { connectDatabase, disconnectDatabase } from './config/database';

async function start() {
  const config = parseEnvironment(process.env);
  if (config.MONGODB_URI) await connectDatabase(config.MONGODB_URI);
  const server = createApp(config).listen(config.PORT, () => {
    console.log(`SatyaID API listening on port ${config.PORT}`);
  });
  server.on('error', () => { console.error('HTTP server failed to start. Check port availability.'); process.exitCode = 1; });
  let stopping = false;
  const shutdown = () => {
    if (stopping) return;
    stopping = true;
    const deadline = setTimeout(() => { console.error('Shutdown deadline exceeded.'); process.exit(1); }, 10_000);
    deadline.unref();
    server.close(() => {
      disconnectDatabase().then(() => { clearTimeout(deadline); }).catch(() => { clearTimeout(deadline); process.exitCode = 1; });
    });
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
start().catch(() => { console.error('Startup failed. Check configuration and MongoDB availability securely.'); process.exitCode = 1; });
