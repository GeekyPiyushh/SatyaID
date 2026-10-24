import mongoose from 'mongoose';
export async function connectDatabase(uri: string) { await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000, connectTimeoutMS: 5000, autoIndex: false }); }
export async function disconnectDatabase() { await mongoose.disconnect(); }
export async function verifyDatabase(uri: string) { try { await connectDatabase(uri); await mongoose.connection.db!.admin().ping(); return true; } catch { return false; } }
export function databaseReady() { return mongoose.connection.readyState === 1; }
