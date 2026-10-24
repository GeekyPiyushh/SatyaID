import { Router } from 'express';
import { z } from 'zod';
import { createRateLimiter } from '../utils/rate-limit';
import { validate } from '../middlewares/validate';
import { browserOrigin, cookies, createCsrf, setCsrf, checkCsrf, clearBrowserCookies, cookieOptions, REFRESH_COOKIE } from '../security/browser-auth';
import * as auth from '../services/auth';
import { AppError } from '../utils/app-error';
export const browserAuthRouter = Router();
const limit = (name: string, count: number) => createRateLimiter(name, { windowMs: 60000, limit: count, standardHeaders: 'draft-8', legacyHeaders: false, handler: (_req, res) => { res.status(429).json({ success: false, error: { code: 'RATE_LIMITED', message: 'Browser authentication request limit reached' } }); } });
const credentials = z.object({ email: z.email().toLowerCase(), password: z.string().min(1).max(72).refine(v => Buffer.byteLength(v) <= 72) }).strict();
const empty = z.object({}).strict();
// POST bootstrap works for same-origin and cross-origin fetch: both send Origin for POST.
browserAuthRouter.post('/csrf', limit('browser.csrf', 60), validate(empty), async (req, res) => {
 const origin = browserOrigin(req), csrf = createCsrf(origin), refresh = cookies(req)[REFRESH_COOKIE];
 if (refresh) await auth.bindBrowserCsrf(refresh, origin, auth.digestToken(csrf.nonce));
 setCsrf(res, csrf); res.setHeader('Cache-Control', 'no-store');
 res.json({ success: true, message: 'Success', data: { csrfToken: csrf.nonce, expiresAt: new Date(csrf.expiresAt).toISOString() } });
});
browserAuthRouter.post('/login', limit('browser.login', 10), validate(credentials), async (req, res) => {
 const state = checkCsrf(req), next = createCsrf(state.origin), v = res.locals.validated;
 const result = await auth.loginSession(v.email, v.password, { transport: 'browser', origin: state.origin, csrfDigest: auth.digestToken(next.nonce) });
 res.cookie(REFRESH_COOKIE, result.tokens.refreshToken, { ...cookieOptions(), expires: result.expiresAt }); setCsrf(res, next); res.setHeader('Cache-Control', 'no-store');
 res.json({ success: true, message: 'Success', data: { accessToken: result.tokens.accessToken, expiresIn: result.tokens.expiresIn, tokenType: result.tokens.tokenType, csrfToken: next.nonce, sessionExpiresAt: result.expiresAt.toISOString() } });
});
browserAuthRouter.post('/refresh', limit('browser.refresh', 30), validate(empty), async (req, res) => {
 const state = checkCsrf(req), next = createCsrf(state.origin), refresh = cookies(req)[REFRESH_COOKIE];
 if (!refresh) { clearBrowserCookies(res); throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Refresh session is unavailable'); }
 try {
  const result = await auth.refreshSession(refresh, { transport: 'browser', origin: state.origin, csrfDigest: auth.digestToken(state.nonce), nextCsrfDigest: auth.digestToken(next.nonce) });
  res.cookie(REFRESH_COOKIE, result.tokens.refreshToken, { ...cookieOptions(), expires: result.expiresAt }); setCsrf(res, next); res.setHeader('Cache-Control', 'no-store');
  res.json({ success: true, message: 'Success', data: { accessToken: result.tokens.accessToken, expiresIn: result.tokens.expiresIn, tokenType: result.tokens.tokenType, csrfToken: next.nonce, sessionExpiresAt: result.expiresAt.toISOString() } });
 } catch (e) { if (e instanceof AppError && e.status === 401) clearBrowserCookies(res); throw e; }
});
browserAuthRouter.post('/logout', limit('browser.logout', 30), validate(empty), async (req, res) => {
 const state = checkCsrf(req), token = cookies(req)[REFRESH_COOKIE];
 if (token) await auth.logout(token, { transport: 'browser', origin: state.origin });
 clearBrowserCookies(res); res.setHeader('Cache-Control', 'no-store'); res.json({ success: true, message: 'Success', data: null });
});
