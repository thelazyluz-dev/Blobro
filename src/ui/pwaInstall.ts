// Single global capture of Android/Chrome's `beforeinstallprompt`, shared by the
// InstallPrompt banner and the Settings "install" button. Two callers, ONE
// event: capturing it in two places would race (only the first preventDefault
// keeps it). Also the platform helpers both callers need.

interface BIPEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}

let deferred: BIPEvent | null = null;
const subs = new Set<() => void>();
const notify = () => subs.forEach((fn) => fn());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // stop Chrome's mini-infobar; we drive the prompt ourselves
    deferred = e as BIPEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    notify();
  });
}

/** Android only: true once Chrome has offered the native install event. */
export function canPromptInstall(): boolean {
  return deferred !== null;
}

/** Fire the native Android install dialog. One-shot: the event can't be reused. */
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  if (!deferred) return 'unavailable';
  try {
    await deferred.prompt();
    const choice = await deferred.userChoice;
    deferred = null;
    notify();
    return choice.outcome === 'accepted' ? 'accepted' : 'dismissed';
  } catch {
    return 'unavailable';
  }
}

/** Subscribe to install-availability changes (event captured / app installed). */
export function onInstallChange(fn: () => void): () => void {
  subs.add(fn);
  return () => subs.delete(fn);
}

export function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function isIOS(): boolean {
  const ua = navigator.userAgent || '';
  // iPadOS 13+ reports as Mac; detect via touch points.
  return /iphone|ipad|ipod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}
