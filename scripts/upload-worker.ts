import { connectDatabase, disconnectDatabase } from '../src/config/database';
import { parseEnvironment } from '../src/config/env';
import { processNextReport } from '../src/services/regulatory/reports';
import { processNextUpload } from '../src/services/uploads';
let stopping = false;
process.on('SIGTERM', () => { stopping = true; }); process.on('SIGINT', () => { stopping = true; });
async function main() {
 const c = parseEnvironment(process.env); if (!c.MONGODB_URI) throw new Error('MongoDB required'); await connectDatabase(c.MONGODB_URI);
 while (!stopping) { const uploaded = await processNextUpload(); const reported = await processNextReport(); const worked = uploaded || reported; if (process.argv.includes('--once')) break; if (!worked) await new Promise(resolve => setTimeout(resolve, 1000)); }
}
main().catch(() => { console.error('Upload worker failed; inspect configuration and database availability securely.'); process.exitCode = 1; }).finally(disconnectDatabase);
