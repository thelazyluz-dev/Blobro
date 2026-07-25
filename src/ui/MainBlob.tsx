// The main clickable blob, drawn with a swappable colour scheme so shop skins
// can restyle it. Shape/eyes/grin stay constant; only the body/belly/highlight/
// arm colours change per skin.

import type { FC } from 'react';

interface Props {
  colors: { body: string; belly: string; highlight: string; arm: string };
  className?: string;
}

const OUT = '#2A1508';

export const MainBlob: FC<Props> = ({ colors, className }) => (
  <svg viewBox="0 0 200 200" className={className} aria-hidden>
    {/* antenna with a goo droplet */}
    <path d="M104 34 Q112 16 128 12" fill="none" stroke={OUT} strokeWidth="7" strokeLinecap="round" />
    <circle cx="132" cy="11" r="10" fill={colors.body} stroke={OUT} strokeWidth="6" />
    <circle cx="129" cy="8" r="2.6" fill="#FFF4E0" />
    {/* little nub arms */}
    <path d="M26 116 q-16 2 -20 16" fill="none" stroke={colors.arm} strokeWidth="15" strokeLinecap="round" />
    <path d="M174 116 q16 2 20 16" fill="none" stroke={colors.arm} strokeWidth="15" strokeLinecap="round" />
    <path d="M26 116 q-16 2 -20 16" fill="none" stroke={OUT} strokeWidth="6" strokeLinecap="round" />
    <path d="M174 116 q16 2 20 16" fill="none" stroke={OUT} strokeWidth="6" strokeLinecap="round" />
    {/* goo body with a drippy bottom */}
    <path
      d="M100 30 C150 30 176 68 176 108 C176 140 160 160 140 170 Q142 184 130 182 Q124 180 122 172 Q112 176 106 172 Q98 178 90 172 Q84 180 78 174 Q66 176 66 166 C44 156 24 138 24 108 C24 68 50 30 100 30 Z"
      fill={colors.body}
      stroke={OUT}
      strokeWidth="7"
      strokeLinejoin="round"
    />
    {/* flat belly shadow + top highlight */}
    <path d="M40 128 Q100 156 160 128 Q100 150 40 138 Z" fill={colors.belly} />
    <ellipse cx="72" cy="70" rx="26" ry="15" fill={colors.highlight} />
    {/* eyes */}
    <ellipse cx="76" cy="98" rx="18" ry="21" fill="#FFF4E0" stroke={OUT} strokeWidth="4" />
    <ellipse cx="126" cy="96" rx="18" ry="21" fill="#FFF4E0" stroke={OUT} strokeWidth="4" />
    <circle cx="80" cy="102" r="9" fill="#150A22" />
    <circle cx="122" cy="100" r="9" fill="#150A22" />
    <circle cx="84" cy="98" r="3" fill="#FFF4E0" />
    <circle cx="126" cy="96" r="3" fill="#FFF4E0" />
    {/* cheeky grin with tongue + tooth */}
    <path d="M74 132 Q100 164 130 130 Q102 146 74 132 Z" fill={OUT} stroke={OUT} strokeWidth="6" strokeLinejoin="round" />
    <path d="M90 142 Q102 154 116 142 Q104 150 90 142 Z" fill="#FF2E88" />
    <rect x="98" y="131" width="8" height="7" rx="2" fill="#FFF4E0" />
    {/* blush */}
    <ellipse cx="54" cy="120" rx="11" ry="7" fill="#FF7AB0" opacity="0.6" />
    <ellipse cx="148" cy="118" rx="11" ry="7" fill="#FF7AB0" opacity="0.6" />
  </svg>
);
