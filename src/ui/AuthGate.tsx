// Full-screen sign-in/registration gate — shown only when
// AUTH_REQUIRED && authChecked && !authUser (see App.tsx). AUTH_REQUIRED
// defaults to false (src/config.ts), so in this PR nobody ever sees this
// unless the owner deliberately flips it on for testing.
//
// This is identity only, same scope as the Worker's PR 3a — no game logic
// moves server-side here, and the player's local save is completely
// untouched by signing in (see the note in StatsOverlay's sign-out control).

import { useState } from 'react';
import { googleSignInUrl, login, register, type AuthErrorCode } from '../net/auth';
import { useGame } from '../store';

type Mode = 'register' | 'login';

const ERROR_TEXT: Record<AuthErrorCode, string> = {
  'bad-email': 'כְּתֹבֶת הָאִימֵייל לֹא תַּקִּינָה.',
  'bad-password': 'הַסִּיסְמָה צְרִיכָה לְהָכִיל לְפָחוֹת 8 תָּוִים.',
  'email-taken': 'הָאִימֵייל הַזֶּה כְּבָר רָשׁוּם. נַסּוּ לְהִתְחַבֵּר בִּמְקוֹם זֹאת.',
  'invalid-credentials': 'אִימֵייל אוֹ סִיסְמָה שְׁגוּיִים.',
  'too-many-attempts': 'יוֹתֵר מִדַּי נִסְיוֹנוֹת. נַסּוּ שׁוּב בְּעוֹד כַּמָּה דַּקּוֹת.',
  network: 'אֵין חִבּוּר לָרֶשֶׁת כָּרֶגַע. נַסּוּ שׁוּב.',
  unknown: 'מַשֶּׁהוּ הִשְׁתַּבֵּשׁ. נַסּוּ שׁוּב.',
};

function friendlyError(code: AuthErrorCode): string {
  return ERROR_TEXT[code] ?? ERROR_TEXT.unknown;
}

const MIN_PASSWORD_LEN = 8;

export function AuthGate() {
  const setAuthUser = useGame((s) => s.setAuthUser);
  const [mode, setMode] = useState<Mode>('register');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const switchMode = (m: Mode) => {
    setMode(m);
    setError('');
  };

  const submit = async () => {
    if (submitting) return; // guards a double-tap from firing twice
    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setError('כִּתְבוּ אֶת כְּתֹבֶת הָאִימֵייל שֶׁלָּכֶם.');
      return;
    }
    // Client-side password check BEFORE hitting the server — the same rule
    // (8 chars) the Worker enforces, but a network round-trip shouldn't be
    // needed just to say "too short".
    if (password.length < MIN_PASSWORD_LEN) {
      setError(friendlyError('bad-password'));
      return;
    }
    setError('');
    setSubmitting(true);
    const result =
      mode === 'register'
        ? await register({ email: cleanEmail, password, displayName: displayName.trim() || undefined })
        : await login({ email: cleanEmail, password });
    setSubmitting(false);
    if (!result.ok) {
      setError(friendlyError(result.error));
      return;
    }
    setAuthUser(result.user);
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-6"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="surface anim-pop-in w-full max-w-xs rounded-3xl p-6 text-center"
        style={{ boxShadow: '0 0 0 2px #00E5FF, 0 24px 60px -20px #000' }}
      >
        <div className="text-5xl">🫧</div>
        <h2 className="mt-2 font-display text-2xl text-bone">בּוֹאוּ נִכָּנֵס!</h2>
        <p className="mt-2 px-1 text-xs leading-relaxed text-bone/60">
          הַהִתְקַדְּמוּת שֶׁלְּךָ בַּמֶּכְשִׁיר הַזֶּה נִשְׁמֶרֶת, וְתְקֻשַּׁר לַחֶשְׁבּוֹן שֶׁלְּךָ.
        </p>

        <div className="mt-4 flex rounded-2xl bg-black/30 p-1 ring-1 ring-hairline">
          <button
            type="button"
            onClick={() => switchMode('register')}
            disabled={submitting}
            className={`flex-1 rounded-xl py-2 text-sm transition ${
              mode === 'register' ? 'bg-goo text-void' : 'text-bone/60'
            }`}
          >
            הַרְשָׁמָה
          </button>
          <button
            type="button"
            onClick={() => switchMode('login')}
            disabled={submitting}
            className={`flex-1 rounded-xl py-2 text-sm transition ${
              mode === 'login' ? 'bg-goo text-void' : 'text-bone/60'
            }`}
          >
            הִתְחַבְּרוּת
          </button>
        </div>

        <div className="mt-4 flex flex-col gap-2">
          {mode === 'register' && (
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              disabled={submitting}
              maxLength={40}
              placeholder="כִּנּוּי לְתְצוּגָה (רָשׁוּת)"
              className="w-full rounded-2xl bg-black/40 px-3 py-2 text-center text-bone outline-none ring-1 ring-hairline placeholder:text-bone/40 focus:ring-2 focus:ring-cy disabled:opacity-60"
            />
          )}
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={submitting}
            placeholder="אִימֵייל"
            dir="ltr"
            className="w-full rounded-2xl bg-black/40 px-3 py-2 text-center text-bone outline-none ring-1 ring-hairline placeholder:text-bone/40 focus:ring-2 focus:ring-cy disabled:opacity-60"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            disabled={submitting}
            placeholder="סִיסְמָה (לְפָחוֹת 8 תָּוִים)"
            dir="ltr"
            className="w-full rounded-2xl bg-black/40 px-3 py-2 text-center text-bone outline-none ring-1 ring-hairline placeholder:text-bone/40 focus:ring-2 focus:ring-cy disabled:opacity-60"
          />
        </div>

        {error && <p className="mt-2 text-sm text-hot">{error}</p>}

        <button
          type="button"
          onClick={submit}
          disabled={submitting}
          className="btn mt-3 w-full bg-goo py-3 text-lg text-void glow-goo disabled:opacity-60"
        >
          {submitting ? '…' : mode === 'register' ? 'הִרָּשְׁמוּ 🚀' : 'הִתְחַבְּרוּ 🚀'}
        </button>

        <div className="mt-3 flex items-center gap-2 text-[11px] text-bone/40">
          <div className="h-px flex-1 bg-hairline" />
          <span>אוֹ</span>
          <div className="h-px flex-1 bg-hairline" />
        </div>

        <a
          href={googleSignInUrl()}
          aria-disabled={submitting}
          className="btn mt-3 flex w-full items-center justify-center gap-2 bg-bone py-3 text-base text-void"
        >
          🔵 הִתְחַבְּרוּת עִם Google
        </a>
      </div>
    </div>
  );
}
