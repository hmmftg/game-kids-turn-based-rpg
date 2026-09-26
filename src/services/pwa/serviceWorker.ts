/**
 * Service-worker lifecycle.
 *
 * The update prompt is *offered* here but only *applied* by the UI from the
 * title or pause screen, so a child is never interrupted mid-encounter.
 */
export type CacheStatus = 'unsupported' | 'caching' | 'ready' | 'failed';

export interface ServiceWorkerHandle {
  readonly update: () => void;
  readonly dispose: () => void;
}

export interface ServiceWorkerCallbacks {
  readonly onCacheStatus: (status: CacheStatus) => void;
  readonly onUpdateReady: () => void;
}

export function registerServiceWorker(callbacks: ServiceWorkerCallbacks): ServiceWorkerHandle {
  const noop: ServiceWorkerHandle = { update: () => {}, dispose: () => {} };
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    callbacks.onCacheStatus('unsupported');
    return noop;
  }

  let waiting: ServiceWorker | null = null;
  let disposed = false;
  callbacks.onCacheStatus('caching');

  void navigator.serviceWorker
    .register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
    .then((registration) => {
      if (disposed) return;
      if (registration.active) callbacks.onCacheStatus('ready');
      if (registration.waiting) {
        waiting = registration.waiting;
        callbacks.onUpdateReady();
      }
      registration.addEventListener('updatefound', () => {
        const installing = registration.installing;
        if (!installing) return;
        installing.addEventListener('statechange', () => {
          if (installing.state === 'activated' && !navigator.serviceWorker.controller) {
            callbacks.onCacheStatus('ready');
          }
          if (installing.state === 'installed') {
            if (navigator.serviceWorker.controller) {
              waiting = installing;
              callbacks.onUpdateReady();
            } else {
              callbacks.onCacheStatus('ready');
            }
          }
        });
      });
    })
    .catch(() => {
      if (!disposed) callbacks.onCacheStatus('failed');
    });

  return {
    update: () => {
      if (!waiting) return;
      waiting.postMessage({ type: 'SKIP_WAITING' });
      navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), {
        once: true,
      });
    },
    dispose: () => {
      disposed = true;
    },
  };
}
