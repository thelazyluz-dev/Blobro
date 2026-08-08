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
// A parental gate (worded-arithmetic step) shipped here briefly and was
// REMOVED by owner decision: one tap to the Google button. The kids-safety
// posture leans on Google's own account-age/Family-Link layer plus the
// parent-facing docs (parents.html, privacy.html) — which must keep matching
// this flow exactly.

import { useState } from 'react';
import { AUTH_API } from '../config';
import { googleSignInUrl } from '../net/auth';
import { CharacterBody } from './characters';
import { Wordmark } from './Wordmark';

// A tiny "what you get" preview shown ABOVE the sign-in button. Login is still
// mandatory (this gate blocks the game), but a cold visitor — often a kid who
// arrived from a friend's share link — now sees the fun BEFORE the wall instead
// of a bare "sign in with an adult's Google account". Value-before-login lifts
// the biggest drop in the funnel without weakening the mandatory-login rule.
const PERKS: Array<{ icon: string; text: string }> = [
  { icon: '👆', text: 'לוֹחֲצִים עַל הַבְּלוֹב וְצוֹבְרִים גּוּ' },
  { icon: '🥚', text: 'בּוֹקְעִים בֵּיצִים וְאוֹסְפִים יְצוּרִים חֲמוּדִים' },
  { icon: '🏆', text: 'מְטַפְּסִים בְּטַבְלַת הַמּוֹבִילִים' },
];

export function AuthGate() {
  const configured = AUTH_API.trim().length > 0;
  const [going, setGoing] = useState(false);

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
        {/* A live, bobbing blob instead of a static bubble — the first thing a
            visitor sees is the actual character, not a login form. */}
        <CharacterBody id="blombo" className="mx-auto h-24 w-24 anim-idle" />
        <Wordmark size="hero" className="mt-1 block" />

        {/* Show the fun first — three quick lines of what the game is. */}
        <ul className="mx-auto mt-3 flex max-w-[15rem] flex-col gap-1.5 text-start">
          {PERKS.map((p) => (
            <li key={p.icon} className="flex items-center gap-2 text-sm text-bone/85">
              <span className="text-lg">{p.icon}</span>
              <span>{p.text}</span>
            </li>
          ))}
        </ul>

        <p className="mt-4 px-1 text-sm leading-relaxed text-bone">מוּכָנִים לְשַׂחֵק? 🎮</p>
        {/* Kid-friendly framing: the CHILD can hand the phone to a parent for one
            tap, rather than being told they need an adult's account themselves. */}
        <p className="mt-1 px-1 text-[11px] leading-relaxed text-bone/60">
          בַּקְּשׁוּ מֵהוֹרֶה לְהִכָּנֵס בִּלְחִיצָה אַחַת — כָּךְ הַהִתְקַדְּמוּת נִשְׁמֶרֶת. 🧑‍🦱
        </p>

        {configured ? (
          <a
            href={googleSignInUrl()}
            onClick={() => setGoing(true)}
            aria-disabled={going}
            className="btn mt-4 flex w-full items-center justify-center gap-2 bg-bone py-3 text-base text-void"
          >
            {going ? 'מִתְחַבֵּר…' : '🔵 הִתְחַבְּרוּת עִם Google'}
          </a>
        ) : (
          <p className="mt-4 text-sm text-hot">הַהִתְחַבְּרוּת אֵינָהּ זְמִינָה כָּרֶגַע. נַסּוּ שׁוּב מְאֻחָר יוֹתֵר.</p>
        )}

        <p className="mt-4 px-1 text-[11px] leading-relaxed text-bone/60">
          אֲנַחְנוּ שׁוֹמְרִים רַק אֶת כְּתֹבֶת הָאִימֵייל וְהַשֵּׁם מֵהַחֶשְׁבּוֹן — לֹא סִיסְמָה.{' '}
          <a href="./parents.html" target="_blank" rel="noopener" className="text-cy underline">
            לְהוֹרִים
          </a>{' '}
          ·{' '}
          <a href="./privacy.html" target="_blank" rel="noopener" className="text-cy underline">
            פְּרָטִיּוּת
          </a>
        </p>
      </div>
    </div>
  );
}
