// First-launch / new-game welcome: pick a nickname so you appear on the global
// table right away. Driven by the store's `nicknameOpen` flag (set on first
// launch and after a "new game" reset). The name chosen here is THE name — it's
// not edited elsewhere; starting over means another new-game reset.

import { useState } from 'react';
import { leaderboardNameMaxLen } from '../game/balance';
import { isCleanNickname } from '../game/profanity';
import { markNicknameAsked, submitScore } from '../net/leaderboard';
import { useGame } from '../store';

// A short, kid-friendly motivational line under the welcome — one at random.
const QUOTES = [
  'כָּל אַלּוּף הִתְחִיל כְּמַתְחִיל 💪',
  'חֲלוֹמוֹת גְּדוֹלִים מַתְחִילִים בְּצַעַד קָטָן 🌟',
  'כָּל לְחִיצָה מְקָרֶבֶת אוֹתְךָ לַפִּסְגָּה 🚀',
  'מִי שֶׁמַּמְשִׁיךְ — מְנַצֵּחַ 🏆',
  'הַיּוֹם הוּא יוֹם מְצֻיָּן לְהַתְחִיל ✨',
  'אֵין גָּבוֹהַּ מִדַּי בִּשְׁבִיל מִי שֶׁמַּאֲמִין 🌈',
];

export function NicknameWelcome() {
  const open = useGame((s) => s.nicknameOpen);
  const setOpen = useGame((s) => s.setNicknameOpen);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [quote] = useState(() => QUOTES[Math.floor(Math.random() * QUOTES.length)]);

  if (!open) return null;

  const close = () => {
    markNicknameAsked();
    setOpen(false);
  };

  const join = async () => {
    const clean = name.trim();
    if (!clean) return;
    if (!isCleanNickname(clean)) {
      setError('הַכִּנּוּי לֹא מַתְאִים — נַסּוּ אַחֵר 🙂');
      return;
    }
    setSaving(true);
    const s = useGame.getState();
    await submitScore(clean, s.clicks, s.lifetimeGoo); // saves nickname + joins both boards
    setSaving(false);
    close();
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
        <p className="mt-2 px-2 font-display text-base text-goo">״{quote}״</p>
        <input
          type="text"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (error) setError('');
          }}
          onKeyDown={(e) => e.key === 'Enter' && join()}
          maxLength={leaderboardNameMaxLen}
          placeholder="הכניסו כינוי…"
          autoFocus
          className="mt-4 w-full rounded-2xl bg-black/40 px-3 py-2 text-center text-bone outline-none ring-1 ring-hairline placeholder:text-bone/40 focus:ring-2 focus:ring-cy"
        />
        {error && <p className="mt-2 text-sm text-hot">{error}</p>}
        <button
          type="button"
          onClick={join}
          disabled={saving}
          className="btn mt-3 w-full bg-goo py-3 text-lg text-void glow-goo disabled:opacity-60"
        >
          {saving ? '…' : 'הִצְטָרֵף לַטַּבְלָה! 🚀'}
        </button>
        <button type="button" onClick={close} className="mt-2 min-h-11 w-full py-3 text-sm text-bone/50">
          אַחַר כָּךְ
        </button>
      </div>
    </div>
  );
}
