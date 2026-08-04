import type { FC } from 'react';
import type { CharId } from '../../game/types';
import { CHARACTER_BODIES } from './svgs';

interface Props {
  id: CharId;
  className?: string;
  /** Evolution stage 0-4. From stage 1 up the body gets an escalating golden
   * aura AND twinkling stars whose count equals the stage — a stage-4 creature
   * used to be pixel-identical to stage 0 despite costing billions (art audit),
   * and now the transformation reads at a glance. */
  evolution?: number;
}

// Star anchors in the body's 0-100 viewBox, tucked into the corners so they
// orbit the creature without covering its face. The Nth star lights up at
// evolution stage N: more stars = more evolved, legible even on a grid tile.
const EVO_SPARKS = [
  { cx: 84, cy: 17, s: 9 },
  { cx: 16, cy: 82, s: 8 },
  { cx: 19, cy: 24, s: 7 },
  { cx: 82, cy: 76, s: 8 },
];

/** A four-point sparkle (pinched "twinkle") centred at cx,cy with radius s. */
function sparklePath(cx: number, cy: number, s: number): string {
  const w = s * 0.22; // waist — how pinched the star's arms are
  return (
    `M${cx} ${cy - s} Q${cx + w} ${cy - w} ${cx + s} ${cy} ` +
    `Q${cx + w} ${cy + w} ${cx} ${cy + s} ` +
    `Q${cx - w} ${cy + w} ${cx - s} ${cy} ` +
    `Q${cx - w} ${cy - w} ${cx} ${cy - s} Z`
  );
}

/** Renders a character's inline SVG body, with its evolution aura + stars when earned. */
export const CharacterBody: FC<Props> = ({ id, className, evolution = 0 }) => {
  const Body = CHARACTER_BODIES[id];
  if (evolution <= 0) return <Body className={className} />;
  const stage = Math.min(4, Math.floor(evolution));
  // The wrapper carries the aura class so the filter never fights the body's
  // own className (sizing stays on the svg exactly as before). The star overlay
  // is a sibling svg in the same 0-100 viewBox, so it lines up at any rendered
  // size — from an 11px tile to the 252px main creature.
  return (
    <span className={`evo-aura-${stage} relative inline-flex`}>
      <Body className={className} />
      <svg viewBox="0 0 100 100" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
        {EVO_SPARKS.slice(0, stage).map((sp, i) => (
          <path
            key={i}
            d={sparklePath(sp.cx, sp.cy, sp.s)}
            fill={stage >= 4 ? '#00E5FF' : '#FFD84D'}
            className="evo-spark"
            style={{ animationDelay: `${i * 0.5}s` }}
          />
        ))}
      </svg>
    </span>
  );
};
