import type { FC } from 'react';
import type { CharId } from '../../game/types';
import { CHARACTER_BODIES } from './svgs';

interface Props {
  id: CharId;
  className?: string;
  /** Evolution stage 0-4. From stage 1 up the body gets an escalating golden
   * aura (pure CSS drop-shadow, size-agnostic) — a stage-4 creature used to be
   * pixel-identical to stage 0 despite costing billions (art audit). */
  evolution?: number;
}

/** Renders a character's inline SVG body, with its evolution aura when earned. */
export const CharacterBody: FC<Props> = ({ id, className, evolution = 0 }) => {
  const Body = CHARACTER_BODIES[id];
  if (evolution <= 0) return <Body className={className} />;
  const stage = Math.min(4, Math.floor(evolution));
  // The wrapper carries the aura class so the filter never fights the body's
  // own className (sizing stays on the svg exactly as before).
  return (
    <span className={`evo-aura-${stage} inline-flex`}>
      <Body className={className} />
    </span>
  );
};
