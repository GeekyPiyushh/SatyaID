// Optional framework-independent browser client. Import into Vite; never persist tokens.
export interface Envelope<T> { success: true; message: string; data: T }
export class ApiError extends Error {
 constructor(public status: number, public code: string, message: string, public requestId: string | null, public retryAfter: string | null) { super(message); }
}
type BrowserSession = { accessToken: string; csrfToken: string; expiresIn: number; tokenType: 'Bearer'; sessionExpiresAt: string };
export function createBrowserClient(baseUrl: string) {
 const base = baseUrl.replace(/\/$/, ''); let access: string | undefined, csrf: string | undefined, refreshing: Promise<void> | undefined;
 async function decode<T>(r: Response): Promise<T> {
  if (!r.ok) { const value = await r.json().catch(() => null); throw new ApiError(r.status, value?.error?.code ?? 'HTTP_ERROR', value?.error?.message ?? 'Request failed', r.headers.get('X-Request-ID'), r.headers.get('Retry-After')); }
  return (await r.json() as Envelope<T>).data;
 }
 async function bootstrap() {
  const value = await decode<{ csrfToken: string }>(await fetch(base + '/api/v1/auth/browser/csrf', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: '{}' })); csrf = value.csrfToken;
 }
 async function browser<T>(operation: 'login' | 'refresh' | 'logout', body: object, recover = true): Promise<T> {
  if (!csrf) await bootstrap();
  const r = await fetch(base + '/api/v1/auth/browser/' + operation, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf! }, body: JSON.stringify(body) });
  try { return await decode<T>(r); } catch (e) {
   if (recover && e instanceof ApiError && e.code === 'CSRF_INVALID') { await bootstrap(); return browser<T>(operation, body, false); } throw e;
  }
 }
 async function refresh() {
  if (!refreshing) refreshing = browser<BrowserSession>('refresh', {}).then(s => { access = s.accessToken; csrf = s.csrfToken; }).catch(e => { access = undefined; throw e; }).finally(() => { refreshing = undefined; });
  return refreshing;
 }
 async function response(path: string, init: RequestInit = {}, retry = true): Promise<Response> {
  if (!path.startsWith('/api/v1/') || path.startsWith('/api/v1/auth/browser/')) throw new Error('Use dedicated browser auth methods');
  if (!access) await refresh();
  const headers = new Headers(init.headers); headers.set('Authorization', 'Bearer ' + access);
  // FormData sets its own boundary. Callers set Content-Type for JSON bodies.
  const r = await fetch(base + path, { ...init, headers, credentials: 'omit' });
  if (r.status === 401 && retry) { await refresh(); return response(path, init, false); }
  if (!r.ok) await decode<never>(r);
  return r;
 }
 return {
  async login(email: string, password: string) { const s = await browser<BrowserSession>('login', { email, password }); access = s.accessToken; csrf = s.csrfToken; return s; },
  async restore() { await refresh(); },
  async logout() { try { await browser<null>('logout', {}); } finally { access = undefined; csrf = undefined; } },
  async request<T>(path: string, init: RequestInit = {}) { return decode<T>(await response(path, init)); },
  async download(path: string) { return (await response(path)).blob(); },
  clearMemory() { access = undefined; csrf = undefined; },
 };
}
