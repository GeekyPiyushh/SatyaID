import mongoose, { Schema } from 'mongoose';
// Serialization mutex for cross-key-version identity uniqueness. No national identifiers are stored here.
export const IdentityRegistryLock = mongoose.model('IdentityRegistryLock', new Schema({ _id: String, version: { type: Number, default: 0 } }, { timestamps: true, strict: 'throw', bufferCommands: false }));
