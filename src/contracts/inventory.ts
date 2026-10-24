import { createApp } from '../app';
import { authenticate } from '../middlewares/auth';
import { browserAuthRouter } from '../routes/browser-auth';
export interface Endpoint { method: string; path: string; authenticated: boolean; roles?: string[]; validations: { schema: any; target: string }[] }
export function endpointInventory(): Endpoint[] {
 const app = createApp({ CORS_ORIGINS: [] }); const result: Endpoint[] = [];
 function walk(router: any, prefix: string, inheritedAuth = false) {
  let authenticated = inheritedAuth;
  for (const layer of router.stack) {
   if (layer.handle === authenticate) authenticated = true;
   if (!layer.route && layer.handle === browserAuthRouter) walk(browserAuthRouter, prefix + '/browser', authenticated);
   if (!layer.route) continue;
   const stack = layer.route.stack.map((s: any) => s.handle);
   for (const method of Object.keys(layer.route.methods)) result.push({ method, path: (prefix + (layer.route.path === '/' ? '' : layer.route.path)).replace(/:([\w]+)/g, '{$1}'), authenticated: authenticated || stack.includes(authenticate), roles: stack.find((h: any) => h.allowedRoles)?.allowedRoles, validations: stack.filter((h: any) => h.validation).map((h: any) => h.validation) });
  }
 }
 for (const { prefix, router } of app.locals.apiMounts) walk(router, prefix);
 return result.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
}
