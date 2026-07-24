import type { FC } from 'react';
import type { CharId } from '../../game/types';
import { CHARACTER_BODIES } from './svgs';

interface Props {
  id: CharId;
  className?: string;
}

/** Renders a character's inline SVG body. */
export const CharacterBody: FC<Props> = ({ id, className }) => {
  const Body = CHARACTER_BODIES[id];
  return <Body className={className} />;
};
