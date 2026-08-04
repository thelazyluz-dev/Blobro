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
// Note for parents (see public/privacy.html): Google accounts have a minimum
// age, so the account for a young child should be created by the parent.

import { AUTH_API } from '../config';
import { googleSignInUrl } from '../net/auth';
import { Wordmark } from './Wordmark';

export function AuthGate() {
  const configured = AUTH_API.trim().length > 0;

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

        {configured ? (
          <a
            href={googleSignInUrl()}
            className="btn mt-5 flex w-full items-center justify-center gap-2 bg-bone py-3 text-base text-void"
          >
            🔵 הִתְחַבְּרוּת עִם Google
          </a>
        ) : (
          <p className="mt-5 text-sm text-hot">הַהִתְחַבְּרוּת אֵינָהּ זְמִינָה כָּרֶגַע. נַסּוּ שׁוּב מְאֻחָר יוֹתֵר.</p>
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
