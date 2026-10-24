import { connectDatabase, disconnectDatabase } from '../config/database';
import { parseEnvironment } from '../config/env';
import { runRetention } from '../services/operations/retention';
import { User } from '../models';
async function main() {
 const c = parseEnvironment(process.env); if (!c.MONGODB_URI || !process.env.RETENTION_CUTOFF) throw new Error('MONGODB_URI and RETENTION_CUTOFF required');
 await connectDatabase(c.MONGODB_URI);
 const actor = process.env.RETENTION_ACTOR_ID ? await User.findById(process.env.RETENTION_ACTOR_ID) : undefined;
 console.log(JSON.stringify(await runRetention({ cutoff: new Date(process.env.RETENTION_CUTOFF), apply: process.argv.includes('--apply'), actor }), null, 2));
}
main().catch(() => { console.error('Retention failed: check cutoff, synthetic database guard, active regulator and configuration'); process.exitCode = 1; }).finally(disconnectDatabase);
