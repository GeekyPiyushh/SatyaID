import type { Request, Response, CookieOptions, RequestHandler } from 'express';
import { parse } from 'cookie';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { parseEnvironment } from '../config/env';
import { AppError } from '../utils/app-error';
export const REFRESH_COOKIE = 'satyaid_refresh';
export const CSRF_COOKIE = 'satyaid_csrf';
export function cookieOptions(): CookieOptions {
 const c = parseEnvironment(process.env);
 return { httpOnly: true, secure: c.COOKIE_SECURE ?? c.NODE_ENV === 'production', sameSite: c.COOKIE_SAME_SITE, path: c.COOKIE_PATH, ...(c.COOKIE_DOMAIN ? { domain: c.COOKIE_DOMAIN } : {}) };
}
function csrfKey() { const key = parseEnvironment(process.env).CSRF_SECRET; if (!key) throw new AppError(503, 'BROWSER_AUTH_UNAVAILABLE', 'Browser authentication is not configured'); return key; }
export function browserOrigin(req: Request) {
 const origin = req.headers.origin; const allowed = req.app.locals.allowedBrowserOrigins as string[];
 if (!origin || !allowed.includes(origin)) throw new AppError(403, 'BROWSER_ORIGIN_DENIED', 'An explicitly trusted browser Origin is required'); return origin;
}
export function cookies(req: Request) { try { return parse(req.headers.cookie ?? ''); } catch { throw new AppError(403, 'CSRF_INVALID', 'Cookie state is invalid'); } }
export function createCsrf(origin: string) {
 const nonce = randomBytes(32).toString('base64url'), expiresAt = Date.now() + 20 * 60000;
 const payload = Buffer.from(JSON.stringify({ nonce, expiresAt })).toString('base64url');
 const signature = createHmac('sha256', csrfKey()).update(`${payload}.${origin}.${cookieOptions().path}`).digest('base64url');
 return { nonce, value: `${payload}.${signature}`, expiresAt };
}
export function setCsrf(res: Response, token: ReturnType<typeof createCsrf>) { res.cookie(CSRF_COOKIE, token.value, { ...cookieOptions(), maxAge: Math.max(0, token.expiresAt - Date.now()) }); }
export function checkCsrf(req: Request) {
 const origin = browserOrigin(req), token = cookies(req)[CSRF_COOKIE], submitted = req.headers['x-csrf-token'];
 if (!token || typeof submitted !== 'string') throw new AppError(403, 'CSRF_INVALID', 'CSRF token and cookie required');
 try {
  const [payload, signature, extra] = token.split('.'); if (!payload || !signature || extra) throw new Error();
  const expected = createHmac('sha256', csrfKey()).update(`${payload}.${origin}.${cookieOptions().path}`).digest(); const actual = Buffer.from(signature, 'base64url');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error();
  const value = JSON.parse(Buffer.from(payload, 'base64url').toString());
  if (typeof value.nonce !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(value.nonce) || !Number.isFinite(value.expiresAt) || value.expiresAt <= Date.now()) throw new Error();
  const a = Buffer.from(submitted), b = Buffer.from(value.nonce); if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error(); return { origin, nonce: value.nonce as string };
 } catch (error) { if (error instanceof AppError) throw error; throw new AppError(403, 'CSRF_INVALID', 'CSRF state is invalid or expired'); }
}
export function clearBrowserCookies(res: Response) { res.clearCookie(REFRESH_COOKIE, cookieOptions()); res.clearCookie(CSRF_COOKIE, cookieOptions()); }
export const nonBrowserTransport: RequestHandler = (req, _res, next) => {
 if (req.headers.origin || req.headers['sec-fetch-site'] || cookies(req)[REFRESH_COOKIE]) return next(new AppError(403, 'BROWSER_TRANSPORT_REQUIRED', 'Use browser cookie/CSRF authentication endpoints'));
 next();
};
