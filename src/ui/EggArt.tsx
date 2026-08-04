// One shared, nicer-looking egg drawing (viewBox 0 0 120 150), used both in the
// hatch inventory and in the crack-open reveal. `spotColor` tints the speckles
// (a subtle rarity hint), and `cracks` reveals crack strokes one-by-one as the
// player taps it open, drawn in `crackColor`.

import type { CSSProperties, FC } from 'react';

// One connected fracture, revealed one segment per tap. Each segment starts
// where an earlier one ended, so instead of scattered scribbles the crack reads
// as a single split running down the shell from the top, then branching
// symmetrically and opening up around the middle — a real egg cracking apart.
export const EGG_CRACKS = [
  'M60 34 L56 46 L61 56', // stem, top of the shell
  'M61 56 L56 66 L60 74', // stem continues toward the middle
  'M56 46 L45 44', //        upper-left branch
  'M61 56 L73 53', //        upper-right branch
  'M60 74 L50 76', //        opens left, at the split line
  'M60 74 L71 78', //        opens right, at the split line
  'M60 74 L61 96 L56 106', // stem carries on down past the opening
  'M56 106 L47 112', //      lower-left branch
  'M56 106 L66 111', //      lower-right branch
  'M45 44 L36 39', //        top-left twig (only the rarest eggs reach this far)
];

export const MAX_EGG_CRACKS = EGG_CRACKS.length;

interface Props {
  spotColor: string;
  crackColor?: string;
  cracks?: number;
  /** 0-1: how far the egg has cracked open. Above 0 a dark opening widens at
   * the centre and two rarity-glowing eyes emerge and blink — the "someone's
   * in there!" tease. Left at 0 (the default) the inventory egg is untouched. */
  peek?: number;
  className?: string;
  style?: CSSProperties;
}

export const EggArt: FC<Props> = ({ spotColor, crackColor = '#2A1508', cracks = 0, peek = 0, className, style }) => {
  // The eyes hold back until the opening is wide enough to hold them, then fade
  // in — so early taps only hint at darkness, and the eyes are the payoff of the
  // last few. Kept just shy of full so the real reveal still surprises.
  const eyeAppear = Math.max(0, Math.min(1, (peek - 0.3) / 0.5));
  return (
    <svg viewBox="0 0 120 150" className={className} style={style} aria-hidden>
      {/* base shell (slightly darker for depth) */}
      <ellipse cx="60" cy="84" rx="47" ry="60" fill="#EFDDBB" stroke="#2A1508" strokeWidth="6" strokeLinejoin="round" />
      {/* lit upper body */}
      <ellipse cx="56" cy="74" rx="41" ry="50" fill="#FFF7E8" />
      {/* speckle band + spots in the tint colour */}
      <path
        d="M30 74 l9 -9 l8 9 l9 -10 l9 10 l9 -9 l8 9 l8 -8"
        fill="none"
        stroke={spotColor}
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.9"
      />
      <ellipse cx="44" cy="98" rx="8" ry="6" fill={spotColor} opacity="0.5" />
      <ellipse cx="76" cy="104" rx="6" ry="5" fill={spotColor} opacity="0.45" />
      <ellipse cx="64" cy="112" rx="5" ry="4" fill={spotColor} opacity="0.4" />
      {/* soft highlight */}
      <ellipse cx="45" cy="52" rx="10" ry="16" fill="#FFFFFF" opacity="0.55" />
      {/* the widening opening + the eyes peeking from the dark inside */}
      {peek > 0 && (
        <>
          <ellipse cx="60" cy="90" rx={7 + peek * 24} ry={5 + peek * 18} fill="#0B0418" opacity={Math.min(0.92, peek * 1.1)} />
          <g className="hatch-peek-eyes" opacity={eyeAppear}>
            <circle cx="52" cy="88" r="6" fill={crackColor} opacity="0.5" />
            <circle cx="68" cy="88" r="6" fill={crackColor} opacity="0.5" />
            <circle cx="52" cy="88" r="3.4" fill="#FFF4E0" />
            <circle cx="68" cy="88" r="3.4" fill="#FFF4E0" />
            <circle cx="52.7" cy="88" r="1.7" fill="#0B0418" />
            <circle cx="68.7" cy="88" r="1.7" fill="#0B0418" />
          </g>
        </>
      )}
      {/* cracks (rarity-coloured hint) grow with taps, over the opening */}
      {EGG_CRACKS.slice(0, cracks).map((d, i) => (
        <path key={i} d={d} fill="none" stroke={crackColor} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </svg>
  );
};
