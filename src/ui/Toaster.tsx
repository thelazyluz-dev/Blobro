// Transient event messages (achievement unlocked, bonus collected). Each toast
// auto-dismisses. Stacks under the header, never blocks taps.

import { useEffect } from 'react';
import { useGame, type Toast } from '../store';

const TONE: Record<Toast['tone'], string> = {
  goo: 'bg-goo text-void',
  star: 'bg-pop text-void',
  pop: 'bg-hot text-bone',
};

export function Toaster() {
  const toasts = useGame((s) => s.toasts);

  return (
    <div className="pointer-events-none absolute inset-x-0 top-16 z-40 flex flex-col items-center gap-2 px-4">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>
  );
}

function ToastItem({ toast }: { toast: Toast }) {
  const dismiss = useGame((s) => s.dismissToast);

  useEffect(() => {
    const t = window.setTimeout(() => dismiss(toast.id), 2800);
    return () => window.clearTimeout(t);
  }, [toast.id, dismiss]);

  return (
    <div
      className={`anim-toast-in flex max-w-xs items-center gap-2 rounded-full px-4 py-2 font-display text-sm shadow-lg ${TONE[toast.tone]}`}
    >
      <span className="text-lg">{toast.icon}</span>
      <span className="tabular">{toast.text}</span>
    </div>
  );
}
