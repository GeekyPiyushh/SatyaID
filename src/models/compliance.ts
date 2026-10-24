import mongoose, { Schema } from 'mongoose';
const ref = (name: string) => ({ type: Schema.Types.ObjectId, ref: name, required: true });
export const CertificatePrintAuthorization = mongoose.model('CertificatePrintAuthorization', new Schema({ institution: ref('Institution'), status: { type: String, enum: ['APPROVED','SUSPENDED'], required: true }, authorityReference: { type: String, required: true }, expiresAt: { type: Date, required: true }, authorizedBy: ref('User') }, { timestamps: true, strict: 'throw', bufferCommands: false }));
CertificatePrintAuthorization.schema.index({ institution: 1 }, { unique: true });
export const CertificatePrintConsent = mongoose.model('CertificatePrintConsent', new Schema({ enrolment: ref('Enrolment'), institution: ref('Institution'), student: ref('Student'), grantedBy: ref('User'), expiresAt: { type: Date, required: true }, revokedAt: Date, purpose: { type: String, enum: ['CERTIFICATE_PRINT_PREPARATION'], default: 'CERTIFICATE_PRINT_PREPARATION' } }, { timestamps: true, strict: 'throw', bufferCommands: false }));
CertificatePrintConsent.schema.index({ enrolment: 1, grantedBy: 1, expiresAt: 1 });
