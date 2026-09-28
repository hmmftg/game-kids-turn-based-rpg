/**
 * Captures the browser's `beforeinstallprompt` event so the parent area can
 * offer a real install button. iOS Safari never fires it — the install
 * section already explains the manual Share → Add to Home Screen flow there.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export interface InstallPromptHandle {
  readonly prompt: () => void;
  readonly dispose: () => void;
}

export function listenForInstallPrompt(onReady: (ready: boolean) => void): InstallPromptHandle {
  let deferred: BeforeInstallPromptEvent | null = null;
  let disposed = false;

  const onBeforeInstall = (event: Event) => {
    event.preventDefault();
    deferred = event as BeforeInstallPromptEvent;
    if (!disposed) onReady(true);
  };
  const onInstalled = () => {
    deferred = null;
    if (!disposed) onReady(false);
  };

  window.addEventListener('beforeinstallprompt', onBeforeInstall);
  window.addEventListener('appinstalled', onInstalled);

  return {
    prompt: () => {
      if (!deferred) return;
      const event = deferred;
      deferred = null;
      void event.prompt().then(() =>
        event.userChoice.then((choice) => {
          if (!disposed && choice.outcome === 'dismissed') onReady(false);
        }),
      );
    },
    dispose: () => {
      disposed = true;
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    },
  };
}
