// Inline SVG bodies for the 16 characters. viewBox 0 0 100 100, flat shapes
// and thick strokes only — no gradients, filters, or drop shadows on bodies.
// Flat highlight/shadow shapes give depth. Identifiable at 64×64.
//
// The pupils of each creature are wrapped in <g className="creature-eyes"> so
// they gently drift inside the eyes (living eyes — same trick as the main
// blob). Only the pupils + their glints go in the group, never the eye-whites,
// noses or accessories. Two creatures wear opaque shades (Blombo, Idanosau) and
// have no pupils to move.

import type { FC } from 'react';
import type { CharId } from '../../game/types';

interface BodyProps {
  className?: string;
}

const OUT = '#2A1508'; // shared outline color
const S = { strokeLinejoin: 'round', strokeLinecap: 'round' } as const;

// 1. Blombo — potato with cool sunglasses and one giant sneaker.
const Blombo: FC<BodyProps> = ({ className }) => (
  <svg viewBox="0 0 100 100" className={className} aria-hidden>
    <path d="M22 40 Q20 20 44 18 Q78 16 82 40 Q86 66 60 70 Q30 74 24 54 Z" fill="#C99A5B" stroke={OUT} strokeWidth="4" {...S} />
    <path d="M24 48 Q45 58 78 48 Q50 56 24 52 Z" fill="#A87F45" />
    <ellipse cx="38" cy="30" rx="4" ry="3" fill="#A87F45" />
    <ellipse cx="66" cy="52" rx="5" ry="3" fill="#A87F45" />
    <circle cx="52" cy="46" r="2.5" fill="#A87F45" />
    <rect x="26" y="34" width="52" height="13" rx="6" fill="#150A22" stroke="#000" strokeWidth="3" {...S} />
    <rect x="30" y="37" width="16" height="6" rx="3" fill="#00E5FF" />
    <rect x="56" y="37" width="16" height="6" rx="3" fill="#00E5FF" />
    <rect x="31" y="38" width="5" height="2" rx="1" fill="#FFF4E0" />
    <path d="M44 58 q8 4 16 -1" fill="none" stroke={OUT} strokeWidth="3.5" {...S} />
    <path d="M40 70 Q42 92 72 88 Q84 86 82 78 Q60 82 52 66 Z" fill="#FFF4E0" stroke={OUT} strokeWidth="4" {...S} />
    <path d="M46 84 h30" stroke="#FF2E88" strokeWidth="4" {...S} />
    <path d="M30 66 q-3 8 1 13" fill="none" stroke={OUT} strokeWidth="4" {...S} />
  </svg>
);

// 2. Fizzik Fizzik — fizzy soda can with frog eyes.
const Fizzik: FC<BodyProps> = ({ className }) => (
  <svg viewBox="0 0 100 100" className={className} aria-hidden>
    <circle cx="66" cy="18" r="2.5" fill="#A3FF12" />
    <circle cx="40" cy="12" r="2" fill="#00E5FF" />
    <circle cx="54" cy="8" r="1.6" fill="#FFD84D" />
    <rect x="33" y="30" width="36" height="54" rx="9" fill="#FF2E88" stroke={OUT} strokeWidth="4" {...S} />
    <rect x="33" y="30" width="10" height="54" rx="6" fill="#FF63A6" />
    <rect x="33" y="46" width="36" height="7" fill="#FFD84D" />
    <ellipse cx="51" cy="30" rx="18" ry="4" fill="#C0C6D0" stroke={OUT} strokeWidth="3" />
    <circle cx="51" cy="30" r="3" fill="#8A8F98" />
    <circle cx="40" cy="22" r="11" fill="#A3FF12" stroke={OUT} strokeWidth="4" {...S} />
    <circle cx="64" cy="20" r="11" fill="#A3FF12" stroke={OUT} strokeWidth="4" {...S} />
    <g className="creature-eyes">
    <circle cx="41" cy="23" r="4.5" fill="#150A22" />
    <circle cx="65" cy="21" r="4.5" fill="#150A22" />
    <circle cx="43" cy="21" r="1.6" fill="#FFF4E0" />
    <circle cx="67" cy="19" r="1.6" fill="#FFF4E0" />
    </g>
    <path d="M44 64 q7 6 14 0" fill="none" stroke={OUT} strokeWidth="3.5" {...S} />
  </svg>
);

// 3. Nono Bango — upside-down banana with a tiny top hat.
const Nono: FC<BodyProps> = ({ className }) => (
  <svg viewBox="0 0 100 100" className={className} aria-hidden>
    <path d="M30 32 Q22 80 60 86 Q80 88 80 74 Q58 76 46 46 Q42 32 36 30 Z" fill="#FFD84D" stroke={OUT} strokeWidth="4" {...S} />
    <path d="M34 36 Q28 74 58 80" fill="none" stroke="#F2C230" strokeWidth="4" {...S} />
    <path d="M78 74 q4 2 4 5" fill="none" stroke="#7A5A12" strokeWidth="4" {...S} />
    <g className="creature-eyes">
    <circle cx="44" cy="56" r="4" fill="#150A22" />
    <circle cx="57" cy="62" r="4" fill="#150A22" />
    <circle cx="45.5" cy="54.5" r="1.4" fill="#FFF4E0" />
    </g>
    <path d="M42 68 q8 6 16 1" fill="none" stroke={OUT} strokeWidth="3.5" {...S} />
    <ellipse cx="48" cy="66" rx="4" ry="2.5" fill="#FF8FBF" opacity="0.7" />
    <rect x="24" y="18" width="24" height="8" rx="2" fill="#FF2E88" stroke={OUT} strokeWidth="3" {...S} />
    <rect x="29" y="8" width="14" height="11" rx="2" fill="#FF2E88" stroke={OUT} strokeWidth="3" {...S} />
    <rect x="29" y="15" width="14" height="3" fill="#00E5FF" />
  </svg>
);

// 4. Grumpolo — grumpy storm cloud with tiny arms.
const Grumpolo: FC<BodyProps> = ({ className }) => (
  <svg viewBox="0 0 100 100" className={className} aria-hidden>
    <path d="M26 60 Q12 60 16 47 Q8 34 26 33 Q30 18 49 26 Q64 15 74 31 Q90 30 85 47 Q94 60 76 62 Z" fill="#9AA7C7" stroke={OUT} strokeWidth="4" {...S} />
    <path d="M26 60 Q40 66 76 62 Q80 60 82 55 Q60 60 30 55 Z" fill="#7E8CAE" />
    <path d="M33 44 l14 5" stroke={OUT} strokeWidth="4.5" {...S} />
    <path d="M67 44 l-14 5" stroke={OUT} strokeWidth="4.5" {...S} />
    <g className="creature-eyes">
    <circle cx="42" cy="52" r="4" fill="#150A22" />
    <circle cx="60" cy="52" r="4" fill="#150A22" />
    </g>
    <path d="M42 63 q9 -7 18 0" fill="none" stroke={OUT} strokeWidth="4" {...S} />
    <path d="M18 56 l-8 7" stroke="#9AA7C7" strokeWidth="6" {...S} />
    <path d="M84 56 l8 7" stroke="#9AA7C7" strokeWidth="6" {...S} />
    <path d="M48 70 l-4 9 l6 -2 l-3 8" fill="none" stroke="#FFD84D" strokeWidth="3.5" {...S} />
  </svg>
);

// 5. Skwibbly Dop — springy coil with a duck beak.
const Skwibbly: FC<BodyProps> = ({ className }) => (
  <svg viewBox="0 0 100 100" className={className} aria-hidden>
    <path d="M34 86 h34 M31 76 q19 -9 38 0 M31 64 q19 -9 38 0 M32 52 q18 -9 36 0" fill="none" stroke="#00E5FF" strokeWidth="6" {...S} />
    <path d="M34 86 h34 M31 76 q19 -9 38 0 M31 64 q19 -9 38 0 M32 52 q18 -9 36 0" fill="none" stroke="#66F0FF" strokeWidth="2" {...S} />
    <circle cx="50" cy="30" r="17" fill="#A3FF12" stroke={OUT} strokeWidth="4" {...S} />
    <ellipse cx="43" cy="23" rx="6" ry="4" fill="#C6FF6E" />
    <g className="creature-eyes">
    <circle cx="44" cy="27" r="4.5" fill="#150A22" />
    <circle cx="57" cy="27" r="4.5" fill="#150A22" />
    <circle cx="45.5" cy="25.5" r="1.5" fill="#FFF4E0" />
    <circle cx="58.5" cy="25.5" r="1.5" fill="#FFF4E0" />
    </g>
    <path d="M40 34 q10 13 22 0 q-11 5 -22 0 Z" fill="#FFD84D" stroke={OUT} strokeWidth="3" {...S} />
  </svg>
);

// 6. Tikko Takko — alarm clock on chicken legs.
const Tikko: FC<BodyProps> = ({ className }) => (
  <svg viewBox="0 0 100 100" className={className} aria-hidden>
    <circle cx="35" cy="16" r="7" fill="#FFD84D" stroke={OUT} strokeWidth="3.5" {...S} />
    <circle cx="65" cy="16" r="7" fill="#FFD84D" stroke={OUT} strokeWidth="3.5" {...S} />
    <circle cx="50" cy="40" r="27" fill="#FFF4E0" stroke={OUT} strokeWidth="4" {...S} />
    <circle cx="50" cy="40" r="27" fill="none" stroke="#FF2E88" strokeWidth="2" opacity="0.5" />
    <path d="M50 18 v4 M72 40 h-4 M50 62 v-4 M28 40 h4" stroke={OUT} strokeWidth="2.5" {...S} />
    <g className="creature-eyes">
    <circle cx="43" cy="35" r="4" fill="#150A22" />
    <circle cx="57" cy="35" r="4" fill="#150A22" />
    <circle cx="44.5" cy="33.5" r="1.4" fill="#FFF4E0" />
    </g>
    <path d="M42 48 q8 6 16 0" fill="none" stroke={OUT} strokeWidth="3.5" {...S} />
    <path d="M50 40 l0 -11 M50 40 l9 5" stroke="#FF2E88" strokeWidth="3.5" {...S} />
    <circle cx="50" cy="40" r="2.5" fill="#FF2E88" />
    <path d="M41 66 l-6 15 m6 -15 l0 15 m0 -15 l6 15" stroke="#FFD84D" strokeWidth="4" {...S} />
    <path d="M59 66 l-6 15 m6 -15 l0 15 m0 -15 l6 15" stroke="#FFD84D" strokeWidth="4" {...S} />
  </svg>
);

// 7. Mumbo Flomp — mushroom with a fancy mustache.
const Mumbo: FC<BodyProps> = ({ className }) => (
  <svg viewBox="0 0 100 100" className={className} aria-hidden>
    <path d="M18 50 Q18 18 50 18 Q82 18 82 50 Q50 60 18 50 Z" fill="#FF2E88" stroke={OUT} strokeWidth="4" {...S} />
    <path d="M18 50 Q50 58 82 50 Q50 54 18 50 Z" fill="#C71E68" />
    <circle cx="36" cy="34" r="5" fill="#FFF4E0" />
    <circle cx="62" cy="30" r="7" fill="#FFF4E0" />
    <circle cx="50" cy="44" r="4" fill="#FFF4E0" />
    <path d="M37 50 h26 v20 a13 13 0 0 1 -26 0 Z" fill="#FFF4E0" stroke={OUT} strokeWidth="4" {...S} />
    <g className="creature-eyes">
    <circle cx="45" cy="58" r="3.2" fill="#150A22" />
    <circle cx="55" cy="58" r="3.2" fill="#150A22" />
    </g>
    <path d="M40 66 q10 8 20 0 M40 66 q-6 -3 -9 -7 M60 66 q6 -3 9 -7" fill="none" stroke={OUT} strokeWidth="4" {...S} />
  </svg>
);

// 8. Zapparoo — lightning bolt with kangaroo legs.
const Zapparoo: FC<BodyProps> = ({ className }) => (
  <svg viewBox="0 0 100 100" className={className} aria-hidden>
    <path d="M58 10 L28 52 H46 L38 74 L74 36 H54 Z" fill="#FFD84D" stroke={OUT} strokeWidth="4" {...S} />
    <path d="M55 16 L36 44 H48" fill="none" stroke="#FFF08A" strokeWidth="3" {...S} />
    <g className="creature-eyes">
    <circle cx="47" cy="34" r="4" fill="#150A22" />
    <circle cx="58" cy="32" r="4" fill="#150A22" />
    <circle cx="48.5" cy="32.5" r="1.4" fill="#FFF4E0" />
    </g>
    <path d="M50 42 q6 4 11 0" fill="none" stroke={OUT} strokeWidth="3" {...S} />
    <path d="M40 72 Q32 90 50 90 Q45 82 50 74" fill="#FF2E88" stroke={OUT} strokeWidth="4" {...S} />
    <path d="M54 68 Q64 88 78 82 L75 76 Q64 80 60 66" fill="#FF2E88" stroke={OUT} strokeWidth="4" {...S} />
    <path d="M64 60 q16 6 20 20" fill="none" stroke="#FF2E88" strokeWidth="6" {...S} />
  </svg>
);

// 9. Chompolino — giant grinning tooth with fins.
const Chompolino: FC<BodyProps> = ({ className }) => (
  <svg viewBox="0 0 100 100" className={className} aria-hidden>
    <path d="M28 32 Q28 18 50 18 Q72 18 72 32 L66 84 Q61 74 56 84 Q51 74 46 84 Q41 74 36 84 Q31 74 34 62 Z" fill="#FFF4E0" stroke={OUT} strokeWidth="4" {...S} />
    <path d="M34 30 Q50 24 66 30" fill="none" stroke="#E7DCC2" strokeWidth="3" {...S} />
    <g className="creature-eyes">
    <circle cx="43" cy="40" r="4.5" fill="#150A22" />
    <circle cx="58" cy="40" r="4.5" fill="#150A22" />
    <circle cx="44.5" cy="38" r="1.6" fill="#FFF4E0" />
    </g>
    <path d="M39 52 q11 12 23 0 q-11 6 -23 0 Z" fill="#FF2E88" stroke={OUT} strokeWidth="3.5" {...S} />
    <rect x="42" y="52" width="4" height="5" fill="#FFF4E0" />
    <rect x="54" y="52" width="4" height="5" fill="#FFF4E0" />
    <path d="M30 40 L12 32 L28 54 Z" fill="#00E5FF" stroke={OUT} strokeWidth="3.5" {...S} />
    <path d="M70 40 L88 32 L72 54 Z" fill="#00E5FF" stroke={OUT} strokeWidth="3.5" {...S} />
  </svg>
);

// 10. Gigablorf — one giant eye on a tower of wobbling blobs.
const Gigablorf: FC<BodyProps> = ({ className }) => (
  <svg viewBox="0 0 100 100" className={className} aria-hidden>
    <path d="M8 24 l3 5 M92 24 l-3 5 M14 14 l4 3 M86 14 l-4 3" stroke="#FFD84D" strokeWidth="2.5" {...S} />
    <ellipse cx="50" cy="88" rx="27" ry="9" fill="#7A18C7" stroke={OUT} strokeWidth="4" {...S} />
    <ellipse cx="50" cy="88" rx="27" ry="9" fill="#7A18C7" />
    <ellipse cx="50" cy="72" rx="21" ry="10" fill="#A3FF12" stroke={OUT} strokeWidth="4" {...S} />
    <ellipse cx="43" cy="69" rx="7" ry="3" fill="#C6FF6E" />
    <ellipse cx="50" cy="56" rx="15" ry="9" fill="#FF2E88" stroke={OUT} strokeWidth="4" {...S} />
    <ellipse cx="45" cy="53" rx="5" ry="2.5" fill="#FF7AB0" />
    <circle cx="50" cy="32" r="23" fill="#FFF4E0" stroke={OUT} strokeWidth="4" {...S} />
    <circle cx="50" cy="32" r="13" fill="#00E5FF" stroke={OUT} strokeWidth="3" {...S} />
    <g className="creature-eyes">
    <circle cx="50" cy="32" r="6" fill="#150A22" />
    <circle cx="54" cy="27" r="2.5" fill="#FFF4E0" />
    <circle cx="45" cy="36" r="1.4" fill="#FFF4E0" />
    </g>
    <path d="M35 16 q15 -8 30 0" fill="none" stroke={OUT} strokeWidth="3" {...S} />
  </svg>
);

// 11. Bubbo — pink bubblegum blob blowing a big bubble.
const Bubbo: FC<BodyProps> = ({ className }) => (
  <svg viewBox="0 0 100 100" className={className} aria-hidden>
    <circle cx="75" cy="28" r="16" fill="#FF8FBF" stroke={OUT} strokeWidth="3.5" opacity="0.85" />
    <circle cx="70" cy="23" r="4" fill="#FFF4E0" opacity="0.85" />
    <path d="M20 56 Q16 30 44 28 Q74 26 78 52 Q82 80 50 84 Q22 84 20 56 Z" fill="#FF63A6" stroke={OUT} strokeWidth="4" {...S} />
    <path d="M26 52 Q30 40 44 40" fill="none" stroke="#FF8FBF" strokeWidth="5" {...S} />
    <circle cx="40" cy="54" r="6" fill="#FFF4E0" stroke={OUT} strokeWidth="2.5" />
    <circle cx="58" cy="52" r="6" fill="#FFF4E0" stroke={OUT} strokeWidth="2.5" />
    <g className="creature-eyes">
    <circle cx="41" cy="55" r="2.6" fill="#150A22" />
    <circle cx="59" cy="53" r="2.6" fill="#150A22" />
    </g>
    <circle cx="61" cy="66" r="4" fill="#7A1540" />
  </svg>
);

// 12. Kaktuki — smiling potted cactus with a little flower.
const Kaktuki: FC<BodyProps> = ({ className }) => (
  <svg viewBox="0 0 100 100" className={className} aria-hidden>
    <path d="M32 78 L68 78 L64 94 L36 94 Z" fill="#C97A3C" stroke={OUT} strokeWidth="4" {...S} />
    <rect x="29" y="70" width="42" height="10" rx="3" fill="#E08A45" stroke={OUT} strokeWidth="4" {...S} />
    <rect x="40" y="24" width="20" height="50" rx="10" fill="#3FA34D" stroke={OUT} strokeWidth="4" {...S} />
    <path d="M40 46 q-14 0 -14 -12 q0 -6 5 -6" fill="none" stroke="#3FA34D" strokeWidth="9" {...S} />
    <path d="M60 52 q14 0 14 -12 q0 -6 -5 -6" fill="none" stroke="#3FA34D" strokeWidth="9" {...S} />
    <path d="M50 30 v-5 M45 40 l-3 -4 M55 40 l3 -4 M50 54 v-5" stroke="#2C7A38" strokeWidth="2.5" {...S} />
    <circle cx="50" cy="21" r="5" fill="#FF2E88" stroke={OUT} strokeWidth="2.5" />
    <circle cx="50" cy="21" r="1.8" fill="#FFD84D" />
    <g className="creature-eyes">
    <circle cx="45" cy="47" r="3.2" fill="#150A22" />
    <circle cx="56" cy="47" r="3.2" fill="#150A22" />
    </g>
    <path d="M45 55 q5 4 10 0" fill="none" stroke={OUT} strokeWidth="3" {...S} />
  </svg>
);

// 13. Flamo — a little living flame that never goes out.
const Flamo: FC<BodyProps> = ({ className }) => (
  <svg viewBox="0 0 100 100" className={className} aria-hidden>
    <path d="M50 8 Q64 34 70 50 Q78 74 50 88 Q22 74 30 50 Q36 34 50 8 Z" fill="#FF6A00" stroke={OUT} strokeWidth="4" {...S} />
    <path d="M50 30 Q58 46 58 58 Q58 74 50 80 Q42 74 42 58 Q42 46 50 30 Z" fill="#FFD84D" />
    <g className="creature-eyes">
    <circle cx="44" cy="58" r="4.5" fill="#150A22" />
    <circle cx="56" cy="58" r="4.5" fill="#150A22" />
    <circle cx="45.5" cy="56.5" r="1.5" fill="#FFF4E0" />
    <circle cx="57.5" cy="56.5" r="1.5" fill="#FFF4E0" />
    </g>
    <path d="M45 68 q5 4 10 0" fill="none" stroke={OUT} strokeWidth="3" {...S} />
  </svg>
);

// 14. Kristalo — a faceted living gem that sparkles.
const Kristalo: FC<BodyProps> = ({ className }) => (
  <svg viewBox="0 0 100 100" className={className} aria-hidden>
    <path d="M50 12 L78 40 L50 90 L22 40 Z" fill="#00E5FF" stroke={OUT} strokeWidth="4" {...S} />
    <path d="M22 40 L50 90 L78 40 Z" fill="#33ECFF" opacity="0.5" />
    <path d="M36 26 L50 40 L36 40 Z" fill="#BEF9FF" opacity="0.85" />
    <path d="M22 40 L78 40 M50 12 L50 90 M50 12 L22 40 M50 12 L78 40" fill="none" stroke="#7CF3FF" strokeWidth="2.5" {...S} />
    <g className="creature-eyes">
    <circle cx="44" cy="50" r="3.6" fill="#150A22" />
    <circle cx="57" cy="50" r="3.6" fill="#150A22" />
    <circle cx="45" cy="49" r="1.3" fill="#FFF4E0" />
    </g>
    <path d="M45 58 q5 3 10 0" fill="none" stroke="#0A3A44" strokeWidth="2.6" {...S} />
    <path d="M71 18 l2 5 l5 2 l-5 2 l-2 5 l-2 -5 l-5 -2 l5 -2 Z" fill="#FFF4E0" />
  </svg>
);

// 15. Dragapuf — a pint-sized dragon puffing sweet smoke.
const Dragapuf: FC<BodyProps> = ({ className }) => (
  <svg viewBox="0 0 100 100" className={className} aria-hidden>
    <path d="M28 44 Q8 34 12 56 Q22 54 30 60 Z" fill="#7A3FB0" stroke={OUT} strokeWidth="3.5" {...S} />
    <path d="M72 44 Q92 34 88 56 Q78 54 70 60 Z" fill="#7A3FB0" stroke={OUT} strokeWidth="3.5" {...S} />
    <path d="M28 56 Q26 34 50 32 Q74 34 72 56 Q74 82 50 84 Q26 82 28 56 Z" fill="#9B5DE5" stroke={OUT} strokeWidth="4" {...S} />
    <path d="M40 62 Q50 74 60 62 Q60 78 50 80 Q40 78 40 62 Z" fill="#C9A6F0" />
    <path d="M38 34 l-4 -12 l8 8 Z" fill="#FFD84D" stroke={OUT} strokeWidth="2.5" {...S} />
    <path d="M62 34 l4 -12 l-8 8 Z" fill="#FFD84D" stroke={OUT} strokeWidth="2.5" {...S} />
    <circle cx="43" cy="50" r="5" fill="#FFF4E0" stroke={OUT} strokeWidth="2.2" />
    <circle cx="58" cy="50" r="5" fill="#FFF4E0" stroke={OUT} strokeWidth="2.2" />
    <g className="creature-eyes">
    <circle cx="44" cy="51" r="2.4" fill="#150A22" />
    <circle cx="59" cy="51" r="2.4" fill="#150A22" />
    </g>
    <circle cx="47" cy="62" r="1.4" fill="#150A22" />
    <circle cx="54" cy="62" r="1.4" fill="#150A22" />
    <circle cx="81" cy="70" r="3" fill="#C9A6F0" opacity="0.6" />
    <circle cx="87" cy="63" r="2" fill="#C9A6F0" opacity="0.5" />
  </svg>
);

// 16. Galaxo — a star cradling a whole galaxy inside.
const Galaxo: FC<BodyProps> = ({ className }) => (
  <svg viewBox="0 0 100 100" className={className} aria-hidden>
    <path d="M50 8 L61 38 L92 40 L67 60 L76 90 L50 72 L24 90 L33 60 L8 40 L39 38 Z" fill="#3A2B7A" stroke={OUT} strokeWidth="4" {...S} />
    <circle cx="50" cy="52" r="20" fill="#5B3FA0" />
    <path d="M50 40 Q66 44 62 58 Q58 70 44 66 Q34 62 40 52" fill="none" stroke="#00E5FF" strokeWidth="3" {...S} />
    <circle cx="50" cy="53" r="3" fill="#FFD84D" />
    <circle cx="40" cy="46" r="1.5" fill="#FFF4E0" />
    <circle cx="61" cy="60" r="1.5" fill="#FFF4E0" />
    <circle cx="55" cy="44" r="1" fill="#A3FF12" />
    <circle cx="43" cy="54" r="3.4" fill="#FFF4E0" />
    <circle cx="57" cy="54" r="3.4" fill="#FFF4E0" />
    <g className="creature-eyes">
    <circle cx="43" cy="54" r="1.6" fill="#150A22" />
    <circle cx="57" cy="54" r="1.6" fill="#150A22" />
    </g>
  </svg>
);

// ===== Click-unlock creatures =====

// Dondonu — a dango: three balls on a skewer (pink / cream face / green).
const Dondonu: FC<BodyProps> = ({ className }) => (
  <svg viewBox="0 0 100 100" className={className} aria-hidden>
    <rect x="47" y="8" width="6" height="84" rx="3" fill="#C99A5B" stroke={OUT} strokeWidth="3" {...S} />
    <circle cx="50" cy="26" r="15" fill="#FF9FC4" stroke={OUT} strokeWidth="4" {...S} />
    <ellipse cx="45" cy="21" rx="5" ry="3" fill="#FFC8DE" />
    <circle cx="50" cy="78" r="15" fill="#A3FF12" stroke={OUT} strokeWidth="4" {...S} />
    <ellipse cx="45" cy="73" rx="5" ry="3" fill="#C6FF6E" />
    <circle cx="50" cy="52" r="17" fill="#FBEFCF" stroke={OUT} strokeWidth="4" {...S} />
    <ellipse cx="44" cy="45" rx="6" ry="3.5" fill="#FFF8E6" />
    <g className="creature-eyes">
    <circle cx="44" cy="51" r="3" fill="#150A22" />
    <circle cx="56" cy="51" r="3" fill="#150A22" />
    </g>
    <path d="M45 57 q5 5 10 0" fill="none" stroke={OUT} strokeWidth="3" {...S} />
    <ellipse cx="38" cy="55" rx="3.6" ry="2.4" fill="#FF7AB0" opacity="0.5" />
    <ellipse cx="62" cy="55" rx="3.6" ry="2.4" fill="#FF7AB0" opacity="0.5" />
  </svg>
);

// Romrom — a fuzzy koosh pom-pom (teal) with big eyes.
const Romrom: FC<BodyProps> = ({ className }) => (
  <svg viewBox="0 0 100 100" className={className} aria-hidden>
    <path
      d="M50 16 L58.3 24.3 L70 22.5 L71.8 34.1 L82.3 39.5 L77 50 L82.3 60.5 L71.8 65.9 L70 77.5 L58.3 75.7 L50 84 L41.7 75.7 L30 77.5 L28.2 65.9 L17.7 60.5 L23 50 L17.7 39.5 L28.2 34.1 L30 22.5 L41.7 24.3 Z"
      fill="#4FD6C0"
      stroke={OUT}
      strokeWidth="4"
      {...S}
    />
    <circle cx="50" cy="50" r="20" fill="#7FEAD8" />
    <ellipse cx="43" cy="44" rx="7" ry="4" fill="#B6F5EA" />
    <circle cx="43" cy="50" r="4.8" fill="#FFF4E0" stroke={OUT} strokeWidth="2.5" />
    <circle cx="57" cy="50" r="4.8" fill="#FFF4E0" stroke={OUT} strokeWidth="2.5" />
    <g className="creature-eyes">
    <circle cx="44" cy="51" r="2.4" fill="#150A22" />
    <circle cx="56" cy="51" r="2.4" fill="#150A22" />
    </g>
    <path d="M44 59 q6 5 12 0" fill="none" stroke={OUT} strokeWidth="3" {...S} />
    <ellipse cx="33" cy="56" rx="4" ry="2.6" fill="#FF7AB0" opacity="0.4" />
    <ellipse cx="67" cy="56" rx="4" ry="2.6" fill="#FF7AB0" opacity="0.4" />
  </svg>
);

// Gongoni — a lucky magic bell.
const Gongoni: FC<BodyProps> = ({ className }) => (
  <svg viewBox="0 0 100 100" className={className} aria-hidden>
    <circle cx="50" cy="22" r="4" fill="#FFD84D" stroke={OUT} strokeWidth="3" {...S} />
    <path d="M28 62 Q28 28 50 28 Q72 28 72 62 Z" fill="#FFD84D" stroke={OUT} strokeWidth="4" {...S} />
    <path d="M34 40 Q34 34 42 33" fill="none" stroke="#FFEDA0" strokeWidth="3" {...S} />
    <rect x="24" y="61" width="52" height="9" rx="4.5" fill="#E0B62A" stroke={OUT} strokeWidth="4" {...S} />
    <circle cx="50" cy="76" r="5" fill="#E0B62A" stroke={OUT} strokeWidth="3" {...S} />
    <ellipse cx="42" cy="46" rx="4.6" ry="5.6" fill="#FFF4E0" stroke={OUT} strokeWidth="2.5" />
    <ellipse cx="58" cy="46" rx="4.6" ry="5.6" fill="#FFF4E0" stroke={OUT} strokeWidth="2.5" />
    <g className="creature-eyes">
    <circle cx="42" cy="47" r="2.2" fill="#150A22" />
    <circle cx="58" cy="47" r="2.2" fill="#150A22" />
    </g>
    <path d="M44 55 q6 5 12 0" fill="none" stroke={OUT} strokeWidth="3" {...S} />
    <path d="M80 30 l1.6 4 l4 1.6 l-4 1.6 l-1.6 4 l-1.6 -4 l-4 -1.6 l4 -1.6 Z" fill="#00E5FF" />
  </svg>
);

// Mataru — a happy little rain cloud.
const Mataru: FC<BodyProps> = ({ className }) => (
  <svg viewBox="0 0 100 100" className={className} aria-hidden>
    <path d="M40 68 q-4 6 0 9 a4 4 0 0 0 8 0 q4 -3 0 -9 Z" fill="#4FC8E6" stroke={OUT} strokeWidth="2.5" {...S} />
    <circle cx="60" cy="72" r="3.4" fill="#4FC8E6" />
    <circle cx="50" cy="80" r="2.6" fill="#4FC8E6" />
    <path d="M26 56 Q19 40 35 38 Q39 26 54 30 Q70 26 72 41 Q84 44 77 56 Z" fill="#CBE8FF" stroke={OUT} strokeWidth="4" {...S} />
    <ellipse cx="41" cy="46" rx="4.6" ry="5.6" fill="#FFF4E0" stroke={OUT} strokeWidth="2.5" />
    <ellipse cx="59" cy="46" rx="4.6" ry="5.6" fill="#FFF4E0" stroke={OUT} strokeWidth="2.5" />
    <g className="creature-eyes">
    <circle cx="41" cy="47" r="2.2" fill="#150A22" />
    <circle cx="59" cy="47" r="2.2" fill="#150A22" />
    </g>
    <path d="M44 54 q6 5 12 0" fill="none" stroke={OUT} strokeWidth="3" {...S} />
    <ellipse cx="33" cy="52" rx="4" ry="2.6" fill="#FF7AB0" opacity="0.45" />
    <ellipse cx="67" cy="52" rx="4" ry="2.6" fill="#FF7AB0" opacity="0.45" />
  </svg>
);

// Gefenaou — a juicy bunch of grapes.
const Gefenaou: FC<BodyProps> = ({ className }) => (
  <svg viewBox="0 0 100 100" className={className} aria-hidden>
    <path d="M52 22 Q62 12 72 18 Q66 28 54 27 Z" fill="#A3FF12" stroke={OUT} strokeWidth="3" {...S} />
    <path d="M50 26 L52 33" stroke={OUT} strokeWidth="3" {...S} />
    <circle cx="38" cy="44" r="9" fill="#9B5DE5" stroke={OUT} strokeWidth="3" />
    <circle cx="62" cy="44" r="9" fill="#9B5DE5" stroke={OUT} strokeWidth="3" />
    <circle cx="30" cy="60" r="9" fill="#8A4BD0" stroke={OUT} strokeWidth="3" />
    <circle cx="70" cy="60" r="9" fill="#8A4BD0" stroke={OUT} strokeWidth="3" />
    <circle cx="46" cy="72" r="9" fill="#8A4BD0" stroke={OUT} strokeWidth="3" />
    <circle cx="63" cy="73" r="8" fill="#7A3FB0" stroke={OUT} strokeWidth="3" />
    <circle cx="50" cy="52" r="12" fill="#9B5DE5" stroke={OUT} strokeWidth="3" />
    <circle cx="46" cy="49" r="3.4" fill="#FFF4E0" />
    <circle cx="56" cy="49" r="3.4" fill="#FFF4E0" />
    <g className="creature-eyes">
    <circle cx="46" cy="50" r="1.6" fill="#150A22" />
    <circle cx="56" cy="50" r="1.6" fill="#150A22" />
    </g>
    <path d="M46 56 q4 4 8 0" fill="none" stroke={OUT} strokeWidth="2.6" {...S} />
    <circle cx="34" cy="40" r="2" fill="#C9A6F0" />
    <circle cx="58" cy="40" r="2" fill="#C9A6F0" />
  </svg>
);

// Tapuzi — a muscly, happy orange in a karate robe (the click-power champ).
const Tapuzi: FC<BodyProps> = ({ className }) => (
  <svg viewBox="0 0 100 100" className={className} aria-hidden>
    {/* stem + leaf */}
    <path d="M50 24 L50 17" stroke={OUT} strokeWidth="3" {...S} />
    <path d="M50 20 Q60 12 69 18 Q60 27 50 23 Z" fill="#A3FF12" stroke={OUT} strokeWidth="3" {...S} />
    {/* flexed arms + fists (drawn behind the body so only the biceps show) */}
    <path d="M28 58 Q9 58 11 42 Q12 32 24 34 Q34 36 33 48" fill="#FF7A1A" stroke={OUT} strokeWidth="4" {...S} />
    <path d="M72 58 Q91 58 89 42 Q88 32 76 34 Q66 36 67 48" fill="#FF7A1A" stroke={OUT} strokeWidth="4" {...S} />
    <circle cx="21" cy="33" r="6.5" fill="#FF9A3A" stroke={OUT} strokeWidth="3.5" />
    <circle cx="79" cy="33" r="6.5" fill="#FF9A3A" stroke={OUT} strokeWidth="3.5" />
    {/* round orange body */}
    <circle cx="50" cy="52" r="30" fill="#FF8A1E" stroke={OUT} strokeWidth="4" />
    {/* karate gi over the lower body, with a V neckline */}
    <path d="M32 58 Q31 77 41 84 Q50 88 59 84 Q69 77 68 58 L50 70 Z" fill="#FFF4E0" stroke={OUT} strokeWidth="3.5" {...S} />
    <path d="M32 58 L50 70 L68 58" fill="none" stroke={OUT} strokeWidth="2.5" {...S} />
    {/* red master's belt + knot */}
    <rect x="34" y="75" width="32" height="7" rx="2" fill="#E5342A" stroke={OUT} strokeWidth="3" />
    <rect x="46" y="76" width="8" height="6" rx="1.5" fill="#C4271F" stroke={OUT} strokeWidth="2.5" />
    <path d="M48 82 l-3 6 M52 82 l3 6" fill="none" stroke={OUT} strokeWidth="3" {...S} />
    {/* determined eyebrows */}
    <path d="M36 41 Q42 38 47 42" fill="none" stroke={OUT} strokeWidth="3" {...S} />
    <path d="M53 42 Q58 38 64 41" fill="none" stroke={OUT} strokeWidth="3" {...S} />
    {/* eyes */}
    <circle cx="42" cy="48" r="5" fill="#FFF4E0" stroke={OUT} strokeWidth="2.5" />
    <circle cx="58" cy="48" r="5" fill="#FFF4E0" stroke={OUT} strokeWidth="2.5" />
    <g className="creature-eyes">
      <circle cx="43" cy="49" r="2.3" fill="#150A22" />
      <circle cx="57" cy="49" r="2.3" fill="#150A22" />
    </g>
    {/* big happy smile + cheeks */}
    <path d="M40 56 q10 9 20 0" fill="none" stroke={OUT} strokeWidth="3.4" {...S} />
    <circle cx="33" cy="55" r="2.6" fill="#FFB870" />
    <circle cx="67" cy="55" r="2.6" fill="#FFB870" />
  </svg>
);

// Oziouh — a muscly power star.
const Oziouh: FC<BodyProps> = ({ className }) => (
  <svg viewBox="0 0 100 100" className={className} aria-hidden>
    <path d="M18 44 q-6 -10 4 -12 q8 -1 10 8" fill="#FF9A3A" stroke={OUT} strokeWidth="4" {...S} />
    <path d="M82 44 q6 -10 -4 -12 q-8 -1 -10 8" fill="#FF9A3A" stroke={OUT} strokeWidth="4" {...S} />
    <path d="M50 14 L60 40 L88 42 L65 58 L73 86 L50 70 L27 86 L35 58 L12 42 L40 40 Z" fill="#FF7A1A" stroke={OUT} strokeWidth="4" {...S} />
    <path d="M34 40 Q42 36 46 42" fill="none" stroke={OUT} strokeWidth="3" {...S} />
    <path d="M66 40 Q58 36 54 42" fill="none" stroke={OUT} strokeWidth="3" {...S} />
    <circle cx="42" cy="50" r="4.6" fill="#FFF4E0" stroke={OUT} strokeWidth="2.5" />
    <circle cx="58" cy="50" r="4.6" fill="#FFF4E0" stroke={OUT} strokeWidth="2.5" />
    <g className="creature-eyes">
    <circle cx="43" cy="51" r="2.2" fill="#150A22" />
    <circle cx="57" cy="51" r="2.2" fill="#150A22" />
    </g>
    <path d="M43 60 q7 5 14 0" fill="none" stroke={OUT} strokeWidth="3.2" {...S} />
    <ellipse cx="48" cy="30" rx="8" ry="4" fill="#FFC27A" />
  </svg>
);

// Baraku — living lightning.
const Baraku: FC<BodyProps> = ({ className }) => (
  <svg viewBox="0 0 100 100" className={className} aria-hidden>
    <circle cx="24" cy="24" r="2.2" fill="#FFF4E0" />
    <circle cx="78" cy="30" r="2.6" fill="#00E5FF" />
    <circle cx="72" cy="74" r="2.2" fill="#FFF4E0" />
    <path d="M58 10 L28 50 L46 50 L38 90 L74 42 L54 42 Z" fill="#FFD84D" stroke={OUT} strokeWidth="4" {...S} />
    <path d="M52 18 L40 34" stroke="#FFEDA0" strokeWidth="3" strokeLinecap="round" />
    <circle cx="46" cy="42" r="4.4" fill="#FFF4E0" stroke={OUT} strokeWidth="2.5" />
    <circle cx="57" cy="40" r="4.4" fill="#FFF4E0" stroke={OUT} strokeWidth="2.5" />
    <g className="creature-eyes">
    <circle cx="47" cy="43" r="2.1" fill="#150A22" />
    <circle cx="58" cy="41" r="2.1" fill="#150A22" />
    </g>
    <path d="M46 50 q7 4 12 -2" fill="none" stroke={OUT} strokeWidth="3" {...S} />
  </svg>
);

// Idanosau — the coolest dino (with shades).
const Idanosau: FC<BodyProps> = ({ className }) => (
  <svg viewBox="0 0 100 100" className={className} aria-hidden>
    <path d="M64 46 l8 -8 l3 10 l9 -5 l0 11 Z" fill="#7FCC0E" stroke={OUT} strokeWidth="3.5" {...S} />
    <path d="M74 78 q18 2 20 -12 q-10 4 -14 -2" fill="#A3FF12" stroke={OUT} strokeWidth="4" {...S} />
    <path d="M20 78 Q16 46 44 42 Q76 38 78 64 Q80 84 52 86 Q28 88 20 78 Z" fill="#A3FF12" stroke={OUT} strokeWidth="4" {...S} />
    <path d="M40 60 L34 54 L44 56 L40 48 L50 54 L48 46 L58 54" fill="none" stroke="#7FCC0E" strokeWidth="4" {...S} />
    <ellipse cx="34" cy="80" rx="6" ry="5" fill="#7FCC0E" stroke={OUT} strokeWidth="3" />
    <ellipse cx="58" cy="82" rx="6" ry="5" fill="#7FCC0E" stroke={OUT} strokeWidth="3" />
    <rect x="30" y="56" width="18" height="10" rx="4" fill="#150A22" stroke={OUT} strokeWidth="3" {...S} />
    <rect x="50" y="56" width="16" height="10" rx="4" fill="#150A22" stroke={OUT} strokeWidth="3" {...S} />
    <path d="M48 61 h2" stroke={OUT} strokeWidth="3" />
    <rect x="33" y="58" width="6" height="3" rx="1.5" fill="#00E5FF" />
    <rect x="53" y="58" width="6" height="3" rx="1.5" fill="#00E5FF" />
    <path d="M40 74 q10 6 20 0" fill="none" stroke={OUT} strokeWidth="3.5" {...S} />
    <rect x="47" y="74" width="5" height="4" rx="1" fill="#FFF4E0" />
  </svg>
);

export const CHARACTER_BODIES: Record<CharId, FC<BodyProps>> = {
  blombo: Blombo,
  fizzik: Fizzik,
  nono: Nono,
  grumpolo: Grumpolo,
  bubbo: Bubbo,
  skwibbly: Skwibbly,
  tikko: Tikko,
  mumbo: Mumbo,
  kaktuki: Kaktuki,
  zapparoo: Zapparoo,
  chompolino: Chompolino,
  flamo: Flamo,
  kristalo: Kristalo,
  gigablorf: Gigablorf,
  dragapuf: Dragapuf,
  galaxo: Galaxo,
  dondonu: Dondonu,
  romrom: Romrom,
  gongoni: Gongoni,
  mataru: Mataru,
  gefenaou: Gefenaou,
  tapuzi: Tapuzi,
  oziouh: Oziouh,
  baraku: Baraku,
  idanosau: Idanosau,
};
