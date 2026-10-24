import type { RequestHandler } from 'express';
import { verifyAccess } from '../services/auth';
import { User, InstitutionMembership } from '../models';
import { AppError } from '../utils/app-error';
export const authenticate: RequestHandler = async (req, res, next) => {
 try { const header = req.headers.authorization; if (!header?.startsWith('Bearer ')) throw new AppError(401, 'UNAUTHENTICATED', 'Bearer token required');
 const id = verifyAccess(header.slice(7)); const user = await User.findOne({ _id: id, active: true }).select('email role');
 if (!user) throw new AppError(401, 'UNAUTHENTICATED', 'Account is unavailable'); res.locals.user = user; next(); } catch (e) { next(e); }
};
export const requireRoles = (...roles: string[]): RequestHandler => (_req, res, next) => {
 if (!roles.includes(res.locals.user.role)) return next(new AppError(403, 'FORBIDDEN', 'Permission denied')); next();
};
export async function institutionScope(user: any, institution: string, adminOnly = false) {
 if (user.role === 'AICTE_ADMIN') return;
 const membership = await InstitutionMembership.findOne({ user: user._id, institution, active: true, ...(adminOnly ? { role: 'INSTITUTION_ADMIN' } : {}) });
 if (!membership) throw new AppError(403, 'FORBIDDEN', 'Institution access denied');
}
