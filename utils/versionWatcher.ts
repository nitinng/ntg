/**
 * Automatically checks for new Vercel deployments and refreshes open tabs.
 *
 * Checks:
 * 1. Whenever the tab becomes visible again (visibilitychange / focus)
 * 2. Periodically every 2 minutes while the tab remains open
 *
 * If a new deployment buildId is detected:
 * - If user is not actively typing in an input/textarea, reloads immediately.
 * - If user is actively typing, waits until they finish / blur before reloading.
 */

const CURRENT_BUILD_ID: string = (import.meta as any).env?.VITE_BUILD_ID || 'dev';
const CHECK_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes

let isReloading = false;

export function isUserActivelyTyping(): boolean {
  if (typeof document === 'undefined') return false;
  const active = document.activeElement;
  if (!active) return false;
  const tag = active.tagName.toUpperCase();
  return tag === 'INPUT' || tag === 'TEXTAREA' || (active as HTMLElement).isContentEditable;
}

export async function checkDeploymentVersion(): Promise<boolean> {
  if (typeof window === 'undefined' || isReloading) return false;
  if ((import.meta as any).env?.DEV || CURRENT_BUILD_ID === 'dev') return false;

  try {
    const res = await fetch(`/version.json?_t=${Date.now()}`, {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' }
    });

    if (!res.ok) return false;
    const data = await res.json();
    const remoteBuildId = data?.buildId;

    if (remoteBuildId && remoteBuildId !== CURRENT_BUILD_ID) {
      console.info(`[VersionWatcher] New Vercel deployment detected: ${remoteBuildId} (current: ${CURRENT_BUILD_ID})`);

      if (!isUserActivelyTyping()) {
        isReloading = true;
        window.location.reload();
        return true;
      } else {
        // User is actively typing; reload once they finish / blur
        const onFinishTyping = () => {
          if (!isUserActivelyTyping() && !isReloading) {
            isReloading = true;
            document.removeEventListener('focusout', onFinishTyping);
            window.location.reload();
          }
        };
        document.addEventListener('focusout', onFinishTyping);
      }
    }
  } catch {
    // Network glitch or offline — ignore silently
  }

  return false;
}

export function installVersionWatcher(): () => void {
  if (typeof window === 'undefined' || (import.meta as any).env?.DEV) return () => {};

  // Check whenever user switches back to this tab
  const onVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      void checkDeploymentVersion();
    }
  };

  const onFocus = () => {
    void checkDeploymentVersion();
  };

  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('focus', onFocus);

  // Periodic poll
  const interval = setInterval(() => {
    void checkDeploymentVersion();
  }, CHECK_INTERVAL_MS);

  // Initial check 10 seconds after load
  const initialTimer = setTimeout(() => {
    void checkDeploymentVersion();
  }, 10000);

  return () => {
    document.removeEventListener('visibilitychange', onVisibilityChange);
    window.removeEventListener('focus', onFocus);
    clearInterval(interval);
    clearTimeout(initialTimer);
  };
}
