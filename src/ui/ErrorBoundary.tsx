// Last-resort catch for a render/lifecycle throw anywhere in the tree. Without
// it, one bad overlay white-screens the whole game for a kid mid-session with
// no way back short of knowing to pull-to-refresh. The fallback is deliberately
// tiny and calm: the blob, one sentence, one big reload button. State lives in
// the store/save layers, which persist independently — reloading loses nothing.

import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  crashed: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { crashed: false };

  static getDerivedStateFromError(): State {
    return { crashed: true };
  }

  componentDidCatch(error: unknown): void {
    console.error('Blorbo crashed:', error);
  }

  render() {
    if (!this.state.crashed) return this.props.children;
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="text-6xl" aria-hidden>
          😵
        </div>
        <div className="font-display text-2xl text-bone">אוֹפְּס! מַשֶּׁהוּ הִסְתַּבֵּךְ</div>
        <p className="text-sm text-bone/70">הַהִתְקַדְּמוּת שֶׁלְּךָ שְׁמוּרָה. לוֹחֲצִים וְחוֹזְרִים לַמִּשְׂחָק:</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="btn bg-goo px-10 py-3 font-display text-xl text-void"
        >
          חֲזָרָה לַמִּשְׂחָק! 🔄
        </button>
      </div>
    );
  }
}
