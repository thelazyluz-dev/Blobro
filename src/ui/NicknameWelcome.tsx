// First-launch welcome: when a global leaderboard is configured and the player
// hasn't picked a nickname yet, invite them to choose one so they appear on the
// table right away. Shown once (skippable) — never nags a returning player.

import { useState } from 'react';
import { leaderboardNameMaxLen } from '../game/balance';
import { hasGlobalLeaderboard, playerName, submitScore } from '../net/leaderboard';
import { useGame } from '../store';

const ASKED_KEY = 'blorbo.nicknameAsked';

export function NicknameWelcome() {
  const [show, setShow] = useState(() => {
    if (!hasGlobalLeaderboard() || playerName()) return false;
    try {
      return !localStorage.getItem(ASKED_KEY);
    } catch {
      return true;
    }
  });
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  if (!show) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(ASKED_KEY, '1');
    } catch {
      /* ignore */
    }
    setShow(false);
  };

  const join = async () => {
    const clean = name.trim();
    if (!clean) return;
    setSaving(true);
    await submitScore(clean, useGame.getState().clicks); // saves the nickname + joins the table
    useGame.getState().addToLeaderboard(clean); // local copy too
    setSaving(false);
    dismiss();
    useGame.getState().pushToast({ text: `${clean} נִכְנַס לַטַּבְלָה! 🏅`, icon: '🏅', tone: 'star' });
  };

  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center bg-black/80 p-6" role="dialog" aria-modal="true">
      <div
        className="surface anim-pop-in w-full max-w-xs rounded-3xl p-6 text-center"
        style={{ boxShadow: '0 0 0 2px #FFD84D, 0 24px 60px -20px #000' }}
      >
        <div className="text-5xl">🏅</div>
        <h2 className="mt-2 font-display text-2xl text-bone">בְּרוּכִים הַבָּאִים!</h2>
        <p className="mt-2 text-sm text-bone/60">בַּחֲרוּ כִּנּוּי כְּדֵי לְהוֹפִיעַ בְּטַבְלַת הַמּוֹבִילִים הָעוֹלָמִית 🌍</p>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && join()}
          maxLength={leaderboardNameMaxLen}
          placeholder="הכניסו כינוי…"
          autoFocus
          className="mt-4 w-full rounded-2xl bg-black/40 px-3 py-2 text-center text-bone outline-none ring-1 ring-hairline placeholder:text-bone/40 focus:ring-2 focus:ring-cy"
        />
        <button
          type="button"
          onClick={join}
          disabled={saving}
          className="btn mt-3 w-full bg-goo py-3 text-lg text-void glow-goo disabled:opacity-60"
        >
          {saving ? '…' : 'הִצְטָרֵף לַטַּבְלָה! 🚀'}
        </button>
        <button type="button" onClick={dismiss} className="mt-2 w-full py-2 text-sm text-bone/50">
          אַחַר כָּךְ
        </button>
      </div>
    </div>
  );
}
