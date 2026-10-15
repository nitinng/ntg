import React from 'react';

const CHUNK_RELOAD_KEY = 'chunk_reload_lock';

/**
 * Checks whether an error message or stack relates to a missing/stale chunk after a new deployment.
 */
export function isChunkLoadError(error: unknown): boolean {
  if (!error) return false;
  const msg = (error as any)?.message || String(error);
  const stack = (error as any)?.stack || '';
  return (
    msg.includes('Failed to fetch dynamically imported module') ||
    msg.includes('error loading dynamically imported module') ||
    msg.includes('Importing a module script failed') ||
    msg.includes('Loading chunk') ||
    stack.includes('Failed to fetch dynamically imported module') ||
    stack.includes('error loading dynamically imported module')
  );
}

/**
 * Wraps React.lazy with automatic window reload on stale chunk fetch failure.
 * When Vercel deploys a new release, old chunk hashes 404.
 * Instead of letting the app crash and sending an unhandled error to Slack,
 * this triggers a clean page reload with cache-busting and stays in loading state.
 */
export function lazyWithRetry<T extends React.ComponentType<any>>(
  factory: () => Promise<{ default: T }>
): React.LazyExoticComponent<T> {
  return React.lazy(async () => {
    try {
      return await factory();
    } catch (err: unknown) {
      if (typeof window !== 'undefined' && isChunkLoadError(err)) {
        const last = sessionStorage.getItem(CHUNK_RELOAD_KEY);
        const now = Date.now();
        // Prevent infinite reload loops if network is down (at most once every 20s)
        if (!last || now - Number(last) > 20000) {
          sessionStorage.setItem(CHUNK_RELOAD_KEY, String(now));
          console.warn('[App] Stale chunk detected after deployment. Reloading window to fetch fresh bundle...');
          window.location.reload();
          // Return non-resolving promise so React Suspense remains on fallback while the page reloads
          return new Promise<{ default: T }>(() => {});
        }
      }
      throw err;
    }
  });
}
