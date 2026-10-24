import { parseEnvironment } from '../src/config/env';
import { verifyDatabase, disconnectDatabase } from '../src/config/database';
async function main() {
  const config = parseEnvironment(process.env);
  if (!config.MONGODB_URI) {
    console.error('MONGODB_URI is required for the database connectivity check.');
    process.exitCode = 1;
    return;
  }
  const ok = await verifyDatabase(config.MONGODB_URI);
  console.log(ok ? 'Database connectivity verified.' : 'Database connectivity failed. Check configuration and MongoDB availability securely.');
  if (!ok) process.exitCode = 1;
}
main().catch(() => { console.error('Database configuration check failed.'); process.exitCode = 1; }).finally(disconnectDatabase);
