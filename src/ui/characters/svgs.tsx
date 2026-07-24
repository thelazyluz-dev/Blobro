// Inline SVG bodies for the 10 characters. viewBox 0 0 100 100, flat shapes
// and thick strokes only — no gradients, filters, or drop shadows on bodies.
// Acceptance test: identifiable at 64×64. Proportions are intentionally wrong.

import type { FC } from 'react';
import type { CharId } from '../../game/types';

interface BodyProps {
  className?: string;
}

const S = { strokeLinejoin: 'round', strokeLinecap: 'round' } as const;

// 1. Blombo — potato with sunglasses and one giant foot.
const Blombo: FC<BodyProps> = ({ className }) => (
  <svg viewBox="0 0 100 100" className={className} aria-hidden>
    <ellipse cx="52" cy="40" rx="30" ry="26" fill="#C89B5A" stroke="#3A1F10" strokeWidth="4" {...S} />
    <rect x="26" y="34" width="52" height="12" rx="6" fill="#1A0B2E" stroke="#000" strokeWidth="3" {...S} />
    <circle cx="40" cy="40" r="6" fill="#00E5FF" />
    <circle cx="64" cy="40" r="6" fill="#00E5FF" />
    <path d="M40 64 Q46 92 74 88 L78 78 Q56 82 52 62 Z" fill="#C89B5A" stroke="#3A1F10" strokeWidth="4" {...S} />
    <path d="M30 54 q-4 6 0 12" fill="none" stroke="#3A1F10" strokeWidth="4" {...S} />
  </svg>
);

// 2. Fizzik Fizzik — soda can with frog eyes.
const Fizzik: FC<BodyProps> = ({ className }) => (
  <svg viewBox="0 0 100 100" className={className} aria-hidden>
    <rect x="34" y="30" width="34" height="52" rx="8" fill="#FF2E88" stroke="#3A1F10" strokeWidth="4" {...S} />
    <rect x="34" y="46" width="34" height="8" fill="#FFD84D" />
    <circle cx="40" cy="22" r="11" fill="#A3FF12" stroke="#3A1F10" strokeWidth="4" {...S} />
    <circle cx="64" cy="20" r="11" fill="#A3FF12" stroke="#3A1F10" strokeWidth="4" {...S} />
    <circle cx="41" cy="23" r="4" fill="#1A0B2E" />
    <circle cx="65" cy="21" r="4" fill="#1A0B2E" />
    <ellipse cx="51" cy="30" rx="6" ry="3" fill="#8A8A8A" />
  </svg>
);

// 3. Nono Bango — upside-down banana with a tiny hat.
const Nono: FC<BodyProps> = ({ className }) => (
  <svg viewBox="0 0 100 100" className={className} aria-hidden>
    <path d="M28 30 Q22 78 60 84 Q78 86 78 74 Q56 74 44 44 Q40 30 34 28 Z" fill="#FFD84D" stroke="#3A1F10" strokeWidth="4" {...S} />
    <circle cx="42" cy="54" r="4" fill="#1A0B2E" />
    <circle cx="54" cy="60" r="4" fill="#1A0B2E" />
    <path d="M40 66 q8 6 16 2" fill="none" stroke="#3A1F10" strokeWidth="3" {...S} />
    <rect x="26" y="18" width="22" height="8" rx="2" fill="#FF2E88" stroke="#3A1F10" strokeWidth="3" {...S} />
    <rect x="31" y="10" width="12" height="10" rx="2" fill="#FF2E88" stroke="#3A1F10" strokeWidth="3" {...S} />
  </svg>
);

// 4. Grumpolo — grumpy cloud with tiny arms.
const Grumpolo: FC<BodyProps> = ({ className }) => (
  <svg viewBox="0 0 100 100" className={className} aria-hidden>
    <path d="M26 62 Q14 62 18 50 Q10 38 26 36 Q30 22 48 30 Q62 20 72 34 Q88 34 84 50 Q92 62 76 64 Z" fill="#9AA7C7" stroke="#3A1F10" strokeWidth="4" {...S} />
    <path d="M34 46 l12 4" stroke="#1A0B2E" strokeWidth="4" {...S} />
    <path d="M66 46 l-12 4" stroke="#1A0B2E" strokeWidth="4" {...S} />
    <circle cx="42" cy="52" r="3.5" fill="#1A0B2E" />
    <circle cx="60" cy="52" r="3.5" fill="#1A0B2E" />
    <path d="M42 62 q9 -6 18 0" fill="none" stroke="#1A0B2E" strokeWidth="4" {...S} />
    <path d="M20 58 l-8 6" stroke="#9AA7C7" strokeWidth="5" {...S} />
    <path d="M82 58 l8 6" stroke="#9AA7C7" strokeWidth="5" {...S} />
  </svg>
);

// 5. Skwibbly Dop — spring with a duck beak.
const Skwibbly: FC<BodyProps> = ({ className }) => (
  <svg viewBox="0 0 100 100" className={className} aria-hidden>
    <path d="M32 84 h36 M30 74 q20 -8 40 0 M30 62 q20 -8 40 0 M30 50 q20 -8 40 0 M32 40 q18 -8 36 0" fill="none" stroke="#00E5FF" strokeWidth="5" {...S} />
    <circle cx="50" cy="30" r="16" fill="#A3FF12" stroke="#3A1F10" strokeWidth="4" {...S} />
    <circle cx="45" cy="27" r="4" fill="#1A0B2E" />
    <circle cx="57" cy="27" r="4" fill="#1A0B2E" />
    <path d="M40 34 q10 12 22 0 Z" fill="#FFD84D" stroke="#3A1F10" strokeWidth="3" {...S} />
  </svg>
);

// 6. Tikko Takko — clock on chicken legs.
const Tikko: FC<BodyProps> = ({ className }) => (
  <svg viewBox="0 0 100 100" className={className} aria-hidden>
    <circle cx="50" cy="38" r="26" fill="#FFF4E0" stroke="#3A1F10" strokeWidth="4" {...S} />
    <circle cx="43" cy="34" r="4" fill="#1A0B2E" />
    <circle cx="57" cy="34" r="4" fill="#1A0B2E" />
    <path d="M50 38 l0 -12 M50 38 l10 4" stroke="#FF2E88" strokeWidth="4" {...S} />
    <path d="M42 50 q8 6 16 0" fill="none" stroke="#3A1F10" strokeWidth="3" {...S} />
    <path d="M40 64 l-6 14 m6 -14 l0 14 m0 -14 l6 14" stroke="#FFD84D" strokeWidth="4" {...S} />
    <path d="M60 64 l-6 14 m6 -14 l0 14 m0 -14 l6 14" stroke="#FFD84D" strokeWidth="4" {...S} />
  </svg>
);

// 7. Mumbo Flomp — mushroom with a mustache.
const Mumbo: FC<BodyProps> = ({ className }) => (
  <svg viewBox="0 0 100 100" className={className} aria-hidden>
    <path d="M20 48 Q20 20 50 20 Q80 20 80 48 Z" fill="#FF2E88" stroke="#3A1F10" strokeWidth="4" {...S} />
    <circle cx="38" cy="36" r="4" fill="#FFF4E0" />
    <circle cx="62" cy="34" r="6" fill="#FFF4E0" />
    <rect x="38" y="48" width="24" height="34" rx="10" fill="#FFF4E0" stroke="#3A1F10" strokeWidth="4" {...S} />
    <circle cx="45" cy="58" r="3" fill="#1A0B2E" />
    <circle cx="55" cy="58" r="3" fill="#1A0B2E" />
    <path d="M40 66 q10 8 20 0" fill="none" stroke="#3A1F10" strokeWidth="4" {...S} />
    <path d="M40 66 q-6 -2 -8 -6 M60 66 q6 -2 8 -6" fill="none" stroke="#3A1F10" strokeWidth="4" {...S} />
  </svg>
);

// 8. Zapparoo — lightning bolt with kangaroo legs.
const Zapparoo: FC<BodyProps> = ({ className }) => (
  <svg viewBox="0 0 100 100" className={className} aria-hidden>
    <path d="M56 14 L30 52 H46 L40 78 L72 40 H54 Z" fill="#FFD84D" stroke="#3A1F10" strokeWidth="4" {...S} />
    <circle cx="48" cy="36" r="3.5" fill="#1A0B2E" />
    <circle cx="58" cy="34" r="3.5" fill="#1A0B2E" />
    <path d="M40 78 Q34 90 50 90 Q46 82 50 76" fill="#FF2E88" stroke="#3A1F10" strokeWidth="4" {...S} />
    <path d="M56 72 Q64 88 76 84 L74 78 Q64 80 60 70" fill="#FF2E88" stroke="#3A1F10" strokeWidth="4" {...S} />
  </svg>
);

// 9. Chompolino — giant tooth with fins.
const Chompolino: FC<BodyProps> = ({ className }) => (
  <svg viewBox="0 0 100 100" className={className} aria-hidden>
    <path d="M30 30 Q30 18 50 18 Q70 18 70 30 L64 82 Q60 74 56 82 Q52 74 48 82 Q44 74 40 82 Q36 74 36 82 Z" fill="#FFF4E0" stroke="#3A1F10" strokeWidth="4" {...S} />
    <circle cx="43" cy="38" r="4" fill="#1A0B2E" />
    <circle cx="57" cy="38" r="4" fill="#1A0B2E" />
    <path d="M40 50 q10 10 20 0" fill="none" stroke="#FF2E88" strokeWidth="4" {...S} />
    <path d="M30 40 L14 34 L28 52 Z" fill="#00E5FF" stroke="#3A1F10" strokeWidth="3" {...S} />
    <path d="M70 40 L86 34 L72 52 Z" fill="#00E5FF" stroke="#3A1F10" strokeWidth="3" {...S} />
  </svg>
);

// 10. Gigablorf — one giant eye on a tower of wobbling blobs.
const Gigablorf: FC<BodyProps> = ({ className }) => (
  <svg viewBox="0 0 100 100" className={className} aria-hidden>
    <ellipse cx="50" cy="86" rx="26" ry="10" fill="#7A18C7" stroke="#3A1F10" strokeWidth="4" {...S} />
    <ellipse cx="50" cy="70" rx="20" ry="10" fill="#A3FF12" stroke="#3A1F10" strokeWidth="4" {...S} />
    <ellipse cx="50" cy="55" rx="15" ry="9" fill="#FF2E88" stroke="#3A1F10" strokeWidth="4" {...S} />
    <circle cx="50" cy="32" r="24" fill="#FFF4E0" stroke="#3A1F10" strokeWidth="4" {...S} />
    <circle cx="50" cy="32" r="12" fill="#00E5FF" stroke="#3A1F10" strokeWidth="3" {...S} />
    <circle cx="50" cy="32" r="5" fill="#1A0B2E" />
    <circle cx="54" cy="28" r="2" fill="#FFF4E0" />
  </svg>
);

export const CHARACTER_BODIES: Record<CharId, FC<BodyProps>> = {
  blombo: Blombo,
  fizzik: Fizzik,
  nono: Nono,
  grumpolo: Grumpolo,
  skwibbly: Skwibbly,
  tikko: Tikko,
  mumbo: Mumbo,
  zapparoo: Zapparoo,
  chompolino: Chompolino,
  gigablorf: Gigablorf,
};
