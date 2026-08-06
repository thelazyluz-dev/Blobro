// The main clickable creature, drawn in one of several distinct SHAPES with a
// swappable colour scheme, plus an optional worn accessory. Shop skins pick the
// shape + colours; accessories overlay on top. All one SVG (viewBox 0 0 200 200)
// so body + accessory scale together.

import type { CSSProperties, FC } from 'react';
import type { AccessoryArt, BlobShape } from '../game/cosmetics';

interface Colors {
  body: string;
  belly: string;
  highlight: string;
  arm: string;
}

interface Props {
  colors: Colors;
  shape?: BlobShape;
  accessory?: AccessoryArt;
  className?: string;
}

const OUT = '#2A1508';
const EYE_W = '#FFF4E0';
const PUP = '#150A22';

/** Star / spike path generator (points alternating outer/inner radius). */
function spikePath(cx: number, cy: number, outer: number, inner: number, points: number): string {
  let d = '';
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 ? inner : outer;
    const a = (Math.PI * i) / points - Math.PI / 2;
    d += (i ? 'L' : 'M') + (cx + r * Math.cos(a)).toFixed(1) + ' ' + (cy + r * Math.sin(a)).toFixed(1) + ' ';
  }
  return d + 'Z';
}

/** Shared eyes + grin for the symmetric shapes. */
const Face: FC<{ eyeY: number; spread: number; mouthY: number }> = ({ eyeY, spread, mouthY }) => (
  <>
    <ellipse cx={100 - spread} cy={eyeY} rx="15" ry="18" fill={EYE_W} stroke={OUT} strokeWidth="4" />
    <ellipse cx={100 + spread} cy={eyeY} rx="15" ry="18" fill={EYE_W} stroke={OUT} strokeWidth="4" />
    <g className="blob-pupils">
      <circle cx={100 - spread + 3} cy={eyeY + 3} r="7.5" fill={PUP} />
      <circle cx={100 + spread + 3} cy={eyeY + 3} r="7.5" fill={PUP} />
      <circle cx={100 - spread + 6} cy={eyeY} r="2.6" fill={EYE_W} />
      <circle cx={100 + spread + 6} cy={eyeY} r="2.6" fill={EYE_W} />
    </g>
    <path
      d={`M${100 - 24} ${mouthY} Q100 ${mouthY + 26} ${100 + 24} ${mouthY} Q100 ${mouthY + 12} ${100 - 24} ${mouthY} Z`}
      fill={OUT}
      stroke={OUT}
      strokeWidth="5"
      strokeLinejoin="round"
    />
    <path d={`M${100 - 10} ${mouthY + 8} Q100 ${mouthY + 18} ${100 + 10} ${mouthY + 8} Q100 ${mouthY + 14} ${100 - 10} ${mouthY + 8} Z`} fill="#FF2E88" />
  </>
);

const Blush: FC<{ cy: number }> = ({ cy }) => (
  <>
    <ellipse cx="52" cy={cy} rx="11" ry="7" fill="#FF7AB0" opacity="0.55" />
    <ellipse cx="148" cy={cy} rx="11" ry="7" fill="#FF7AB0" opacity="0.55" />
  </>
);

function GooBody({ colors }: { colors: Colors }) {
  return (
    <>
      <path d="M104 34 Q112 16 128 12" fill="none" stroke={OUT} strokeWidth="7" strokeLinecap="round" />
      <circle cx="132" cy="11" r="10" fill={colors.body} stroke={OUT} strokeWidth="6" />
      <circle cx="129" cy="8" r="2.6" fill={EYE_W} />
      <path d="M26 116 q-16 2 -20 16" fill="none" stroke={colors.arm} strokeWidth="15" strokeLinecap="round" />
      <path d="M174 116 q16 2 20 16" fill="none" stroke={colors.arm} strokeWidth="15" strokeLinecap="round" />
      <path d="M26 116 q-16 2 -20 16" fill="none" stroke={OUT} strokeWidth="6" strokeLinecap="round" />
      <path d="M174 116 q16 2 20 16" fill="none" stroke={OUT} strokeWidth="6" strokeLinecap="round" />
      <path
        d="M100 30 C150 30 176 68 176 108 C176 140 160 160 140 170 Q142 184 130 182 Q124 180 122 172 Q112 176 106 172 Q98 178 90 172 Q84 180 78 174 Q66 176 66 166 C44 156 24 138 24 108 C24 68 50 30 100 30 Z"
        fill={colors.body}
        stroke={OUT}
        strokeWidth="7"
        strokeLinejoin="round"
      />
      <path d="M40 128 Q100 156 160 128 Q100 150 40 138 Z" fill={colors.belly} />
      <ellipse cx="72" cy="70" rx="26" ry="15" fill={colors.highlight} />
      <ellipse cx="76" cy="98" rx="18" ry="21" fill={EYE_W} stroke={OUT} strokeWidth="4" />
      <ellipse cx="126" cy="96" rx="18" ry="21" fill={EYE_W} stroke={OUT} strokeWidth="4" />
      <g className="blob-pupils">
        <circle cx="80" cy="102" r="9" fill={PUP} />
        <circle cx="122" cy="100" r="9" fill={PUP} />
        <circle cx="84" cy="98" r="3" fill={EYE_W} />
        <circle cx="126" cy="96" r="3" fill={EYE_W} />
      </g>
      <path d="M74 132 Q100 164 130 130 Q102 146 74 132 Z" fill={OUT} stroke={OUT} strokeWidth="6" strokeLinejoin="round" />
      <path d="M90 142 Q102 154 116 142 Q104 150 90 142 Z" fill="#FF2E88" />
      <rect x="98" y="131" width="8" height="7" rx="2" fill={EYE_W} />
      <Blush cy={120} />
    </>
  );
}

function ShapeBody({ shape, colors }: { shape: BlobShape; colors: Colors }) {
  switch (shape) {
    case 'goo':
      return <GooBody colors={colors} />;
    case 'round':
      return (
        <>
          <path d="M28 118 q-16 4 -18 18" fill="none" stroke={colors.arm} strokeWidth="14" strokeLinecap="round" />
          <path d="M172 118 q16 4 18 18" fill="none" stroke={colors.arm} strokeWidth="14" strokeLinecap="round" />
          <circle cx="100" cy="104" r="74" fill={colors.body} stroke={OUT} strokeWidth="7" />
          <path d="M36 132 Q100 156 164 132 Q100 148 36 140 Z" fill={colors.belly} />
          <ellipse cx="72" cy="70" rx="26" ry="15" fill={colors.highlight} />
          <Face eyeY={100} spread={26} mouthY={128} />
          <Blush cy={122} />
        </>
      );
    case 'star':
      return (
        <>
          <path d={spikePath(100, 102, 86, 40, 5)} fill={colors.body} stroke={OUT} strokeWidth="7" strokeLinejoin="round" />
          <ellipse cx="78" cy="72" rx="18" ry="10" fill={colors.highlight} />
          <Face eyeY={96} spread={20} mouthY={120} />
          <Blush cy={116} />
        </>
      );
    case 'ghost':
      return (
        <>
          <path
            d="M42 104 Q42 38 100 38 Q158 38 158 104 L158 170 Q149 155 140 170 Q131 155 122 170 Q113 155 104 170 Q95 155 86 170 Q77 155 68 170 Q57 155 42 170 Z"
            fill={colors.body}
            stroke={OUT}
            strokeWidth="7"
            strokeLinejoin="round"
          />
          <ellipse cx="74" cy="74" rx="20" ry="12" fill={colors.highlight} />
          <Face eyeY={94} spread={22} mouthY={118} />
          <Blush cy={116} />
        </>
      );
    case 'spiky':
      return (
        <>
          <path d={spikePath(100, 104, 92, 60, 12)} fill={colors.body} stroke={OUT} strokeWidth="6" strokeLinejoin="round" />
          <circle cx="100" cy="104" r="58" fill={colors.body} stroke={OUT} strokeWidth="5" />
          <ellipse cx="78" cy="78" rx="18" ry="10" fill={colors.highlight} />
          <Face eyeY={100} spread={22} mouthY={126} />
          <Blush cy={122} />
        </>
      );
    case 'heart':
      return (
        <>
          <path
            d="M100 178 C36 128 22 76 56 52 C82 33 100 58 100 58 C100 58 118 33 144 52 C178 76 164 128 100 178 Z"
            fill={colors.body}
            stroke={OUT}
            strokeWidth="7"
            strokeLinejoin="round"
          />
          <ellipse cx="72" cy="70" rx="20" ry="11" fill={colors.highlight} />
          <Face eyeY={92} spread={22} mouthY={116} />
          <Blush cy={112} />
        </>
      );
  }
}

function AccessoryArtEl({ art }: { art: AccessoryArt }) {
  switch (art) {
    case 'none':
      return null;
    case 'hat':
      return (
        <>
          <path d="M100 -2 L120 44 L80 44 Z" fill="#FF2E88" stroke={OUT} strokeWidth="4" strokeLinejoin="round" />
          <path d="M84 32 L116 32 M88 20 L112 20" stroke="#FFD84D" strokeWidth="4" strokeLinecap="round" />
          <circle cx="100" cy="-3" r="7" fill="#00E5FF" stroke={OUT} strokeWidth="3" />
        </>
      );
    case 'glasses':
      return (
        <>
          <rect x="58" y="86" width="34" height="24" rx="8" fill="#150A22" stroke={OUT} strokeWidth="4" />
          <rect x="108" y="86" width="34" height="24" rx="8" fill="#150A22" stroke={OUT} strokeWidth="4" />
          <path d="M92 96 h16" stroke={OUT} strokeWidth="4" />
          <rect x="63" y="90" width="12" height="6" rx="3" fill="#00E5FF" opacity="0.8" />
          <rect x="113" y="90" width="12" height="6" rx="3" fill="#00E5FF" opacity="0.8" />
        </>
      );
    case 'bow':
      return (
        <>
          <path d="M100 150 L72 138 L72 168 Z" fill="#FF2E88" stroke={OUT} strokeWidth="4" strokeLinejoin="round" />
          <path d="M100 150 L128 138 L128 168 Z" fill="#FF2E88" stroke={OUT} strokeWidth="4" strokeLinejoin="round" />
          <circle cx="100" cy="153" r="8" fill="#FF63A6" stroke={OUT} strokeWidth="4" />
        </>
      );
    case 'crown':
      return (
        <>
          <path d="M62 46 L62 16 L82 34 L100 8 L118 34 L138 16 L138 46 Z" fill="#FFD84D" stroke={OUT} strokeWidth="4" strokeLinejoin="round" />
          <path d="M62 46 L138 46" stroke={OUT} strokeWidth="4" />
          <circle cx="100" cy="30" r="4" fill="#FF2E88" />
          <circle cx="76" cy="34" r="3" fill="#00E5FF" />
          <circle cx="124" cy="34" r="3" fill="#00E5FF" />
        </>
      );
    case 'halo':
      return (
        <>
          <ellipse cx="100" cy="16" rx="36" ry="11" fill="none" stroke="#FFD84D" strokeWidth="7" />
          <ellipse cx="100" cy="16" rx="36" ry="11" fill="none" stroke="#FFF4E0" strokeWidth="2" opacity="0.7" />
        </>
      );
    // 💎 Crystal-exclusive (prestige-only). Cyan/white to read as "crystal".
    case 'sparkles':
      // Four-point sparkles scattered around the head — twinkle without covering
      // the face. A tiny CSS shimmer, disabled under reduced-motion (index.css).
      return (
        <g className="creature-sparkle" fill="#BEF9FF" stroke="#00E5FF" strokeWidth="2" strokeLinejoin="round">
          <path d="M40 40 L44 52 L56 56 L44 60 L40 72 L36 60 L24 56 L36 52 Z" />
          <path d="M158 34 L161 43 L170 46 L161 49 L158 58 L155 49 L146 46 L155 43 Z" />
          <path d="M168 104 L170 111 L177 113 L170 115 L168 122 L166 115 L159 113 L166 111 Z" />
          <path d="M34 116 L36 123 L43 125 L36 127 L34 134 L32 127 L25 125 L32 123 Z" />
        </g>
      );
    case 'wings': {
      // Faceted CRYSTAL WINGS on either side of the creature — the top-tier
      // premium accessory. Deliberately lateral (never a surrounding ring) so it
      // can't collide with the rebirth mastery halo. Each wing is three
      // crystal "feathers" (a colored diamond + a white inner facet), pivoted at
      // the body edge and fanned outward. Same gem-facet style the old aura used
      // — it survives the 80px shop card where thin strokes vanish — and it's
      // layered fills only (no SVG filter), so it stays cheap with many blobs on
      // screen. Breathes via .creature-wings (opacity), static under reduced-motion.
      //
      // A feather: a diamond whose BOTTOM vertex is the pivot (px,py); it points
      // straight up (tip at py−2L) and is then rotated `rot`° about the pivot to
      // fan out. Params kept so every tip lands inside the 200×200 box (≥8px).
      const feather = (px: number, py: number, L: number, W: number, rot: number, c: string, key: string) => (
        <g key={key} transform={`rotate(${rot} ${px} ${py})`} stroke={OUT} strokeWidth="1.5" strokeLinejoin="round">
          <path d={`M${px} ${py - 2 * L} L${px + W} ${py - L} L${px} ${py} L${px - W} ${py - L} Z`} fill={c} />
          <path
            d={`M${px} ${py - 1.5 * L} L${px + W * 0.5} ${py - L} L${px} ${py - 0.5 * L} L${px - W * 0.5} ${py - L} Z`}
            fill="#EAFDFF"
            stroke="none"
            opacity="0.85"
          />
        </g>
      );
      return (
        <g className="creature-wings">
          {/* right wing (viewer's right) */}
          {feather(146, 102, 26, 10, 26, '#33E1FF', 'r1')}
          {feather(146, 114, 28, 11, 50, '#00E5FF', 'r2')}
          {feather(148, 125, 20, 9, 72, '#BEF9FF', 'r3')}
          {/* left wing — mirror of the right */}
          {feather(54, 102, 26, 10, -26, '#33E1FF', 'l1')}
          {feather(54, 114, 28, 11, -50, '#00E5FF', 'l2')}
          {feather(52, 125, 20, 9, -72, '#BEF9FF', 'l3')}
        </g>
      );
    }
  }
}

export const MainBlob: FC<Props> = ({ colors, shape = 'goo', accessory = 'none', className }) => (
  <svg viewBox="0 0 200 200" className={className} aria-hidden>
    <ShapeBody shape={shape} colors={colors} />
    <AccessoryArtEl art={accessory} />
  </svg>
);

/**
 * The worn accessory on its own, so it can be layered over a collected creature
 * (which draws in its own viewBox). Same 200×200 coordinate space as MainBlob,
 * so it lands in the same spot when overlaid on an equally-sized box.
 */
export const AccessoryOverlay: FC<{ art: AccessoryArt; className?: string; style?: CSSProperties }> = ({
  art,
  className,
  style,
}) => {
  if (art === 'none') return null;
  return (
    <svg viewBox="0 0 200 200" className={className} style={style} aria-hidden>
      <AccessoryArtEl art={art} />
    </svg>
  );
};
