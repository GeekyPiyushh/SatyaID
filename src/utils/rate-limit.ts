import { rateLimit, MemoryStore, type Options, type Store } from 'express-rate-limit';
export type RateLimitStoreFactory = (namespace: string) => Store;
let storeFactory: RateLimitStoreFactory = () => new MemoryStore();
// Install an isolated/namespaced distributed Store adapter before importing application routers.
// The included backend is process-local memory; it does not claim multi-instance protection.
export function configureRateLimitStoreFactory(factory?: RateLimitStoreFactory) { storeFactory = factory ?? (() => new MemoryStore()); }
export function createRateLimiter(namespace: string, options: Partial<Options>) {
 return rateLimit({ ...options, store: storeFactory(namespace) });
}
