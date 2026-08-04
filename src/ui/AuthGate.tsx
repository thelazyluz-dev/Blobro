// The sign-in gate, shown when AUTH_REQUIRED is on and nobody is signed in.
//
// Google sign-in ONLY, deliberately. The Worker still exposes email/password
// endpoints (PR 3a, fully tested) but we do not offer them here, because there
// is no "forgot my password" flow: a child who forgets a password would be
// locked out of their game permanently, and building recovery properly means
// running email-sending infrastructure. Google already solves password
// recovery, 2FA and the rest, so leaning on it removes a whole class of
// support problems instead of half-solving them. Re-enabling the email form
// later is additive — the client and server code for it still exists.
//
// PARENTAL GATE (§ owner report: a child completed sign-up alone): the Google
// button is behind a two-step parent check — "I'm the parent" plus a worded
// arithmetic question (see parentGate.ts, including its honesty note: this is
// a deterrent, not legal COPPA consent). A pass is remembered on the device
// permanently — the gate guards the first sign-in, not every re-login.

import { useState } from 'react';
import { AUTH_API } from '../config';
import { googleSignInUrl } from '../net/auth';
import { parentGatePassed, pickParentQuestion, rememberParentGate } from './parentGate';
import { Wordmark } from './Wordmark';

export function AuthGate() {
  const configured = AUTH_API.trim().length > 0;
  const [step, setStep] = useState<'intro' | 'question' | 'open'>(() =>
    parentGatePassed() ? 'open' : 'intro',
  );
  const [question, setQuestion] = useState(pickParentQuestion);
  const [answer, setAnswer] = useState('');
  const [wrong, setWrong] = useState(false);

  const check = () => {
    if (Number(answer.trim()) === question.answer) {
      rememberParentGate();
      setStep('open');
      return;
    }
    // A fresh question on every miss, so mashing numbers doesn't converge.
    setWrong(true);
    setAnswer('');
    setQuestion(pickParentQuestion());
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
        {/* The sign-in gate is now the first thing anyone sees, so it is the
            right place for the name at full size — there is nothing else on
            screen for it to compete with. */}
        <Wordmark size="hero" className="mt-1 block" />
        <h2 className="mt-3 font-display text-2xl text-bone">בּוֹאוּ נִכָּנֵס!</h2>
        <p className="mt-2 px-1 text-xs leading-relaxed text-bone/60">
          הַהִתְקַדְּמוּת שֶׁלְּךָ בַּמֶּכְשִׁיר הַזֶּה נִשְׁמֶרֶת, וְתְקֻשַּׁר לַחֶשְׁבּוֹן שֶׁלְּךָ.
        </p>

        {!configured ? (
          <p className="mt-5 text-sm text-hot">הַהִתְחַבְּרוּת אֵינָהּ זְמִינָה כָּרֶגַע. נַסּוּ שׁוּב מְאֻחָר יוֹתֵר.</p>
        ) : step === 'intro' ? (
          <>
            <p className="mt-4 rounded-2xl bg-black/25 px-3 py-2.5 text-sm leading-relaxed text-bone/80 ring-hairline">
              כְּדֵי לְהִתְחַבֵּר צָרִיךְ <span className="font-bold text-cy">עֶזְרָה שֶׁל הוֹרֶה</span> 🧑‍🦱
              <br />
              קִרְאוּ לְאַבָּא אוֹ לְאִמָּא!
            </p>
            <button
              type="button"
              onClick={() => setStep('question')}
              className="btn mt-4 w-full bg-cy py-3 text-base text-void"
            >
              אֲנִי הַהוֹרֶה — הַמְשֵׁךְ
            </button>
          </>
        ) : step === 'question' ? (
          <>
            <p className="mt-4 text-sm text-bone/80">
              שְׁאֵלָה לַהוֹרֶה: כַּמָּה זֶה <span className="font-bold text-cy">{question.textHe}</span>?
            </p>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && check()}
              aria-label="תשובה לשאלת ההורים"
              className="mt-3 w-full rounded-2xl bg-black/40 px-4 py-3 text-center font-display text-xl text-bone ring-1 ring-hairline focus:outline-none focus:ring-cy"
            />
            {wrong && <p className="mt-2 text-xs text-hot">לֹא מְדֻיָּק — נַסּוּ שׁוּב</p>}
            <button type="button" onClick={check} className="btn mt-3 w-full bg-cy py-3 text-base text-void">
              בְּדִיקָה
            </button>
          </>
        ) : (
          <a
            href={googleSignInUrl()}
            className="btn mt-5 flex w-full items-center justify-center gap-2 bg-bone py-3 text-base text-void"
          >
            🔵 הִתְחַבְּרוּת עִם Google
          </a>
        )}

        <p className="mt-4 px-1 text-[11px] leading-relaxed text-bone/60">
          אֲנַחְנוּ שׁוֹמְרִים רַק אֶת כְּתֹבֶת הָאִימֵייל וְהַשֵּׁם מֵהַחֶשְׁבּוֹן — לֹא סִיסְמָה.{' '}
          <a href="./privacy.html" target="_blank" rel="noopener" className="text-cy underline">
            פְּרָטִיּוּת
          </a>
        </p>
      </div>
    </div>
  );
}
