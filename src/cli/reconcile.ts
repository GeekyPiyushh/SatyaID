import { connectDatabase, disconnectDatabase } from '../config/database';
import { parseEnvironment } from '../config/env';
import { reconcileIdentityLinks } from '../services/operations/identity-reconcile';
import { reconcileAdmissions } from '../services/operations/reconcile';
async function main() { const c = parseEnvironment(process.env); if (!c.MONGODB_URI) throw new Error('Database required'); await connectDatabase(c.MONGODB_URI); console.log(JSON.stringify(await (process.argv.includes('--identity') ? reconcileIdentityLinks() : reconcileAdmissions()), null, 2)); }
main().catch(() => { console.error('Read-only reconciliation failed; check database and replica set'); process.exitCode = 1; }).finally(disconnectDatabase);
