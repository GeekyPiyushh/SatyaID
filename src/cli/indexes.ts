import { connectDatabase, disconnectDatabase } from '../config/database';
import { parseEnvironment } from '../config/env';
import mongoose from 'mongoose';
import '../models';
async function main() { const config = parseEnvironment(process.env); if (!config.MONGODB_URI) throw new Error('Missing database'); await connectDatabase(config.MONGODB_URI); for (const model of Object.values(mongoose.models)) await model.createIndexes(); console.log('Indexes created'); }
main().catch(() => { console.error('Index creation failed; inspect database configuration securely.'); process.exitCode = 1; }).finally(disconnectDatabase);
