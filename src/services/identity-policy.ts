import type { ClientSession } from 'mongoose';
import { ApaarIdentityVault } from '../models';
export const admissionIdentityPolicy = 'ALLOW_WITH_REVIEW_FLAGS_V1';
export async function assessIdentity(student: string, verificationStatus: string, session?: ClientSession) {
 const linked = Boolean(await ApaarIdentityVault.exists({ student }).session(session ?? null));
 return { policy: admissionIdentityPolicy, identifierPresence: linked ? 'LINKED' : 'MISSING', formatStatus: linked ? 'VALID_AT_LINK' : 'NOT_PROVIDED', verificationStatus, officialVerificationAvailable: false, reviewRequired: !linked || verificationStatus !== 'OFFICIALLY_VERIFIED', warnings: [...(!linked ? ['MISSING_APAAR'] : []), ...(verificationStatus !== 'OFFICIALLY_VERIFIED' ? ['IDENTITY_NOT_OFFICIALLY_VERIFIED'] : [])] };
}
