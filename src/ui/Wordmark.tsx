// The game's name, drawn the way the rest of the game is drawn.
//
// Placement is deliberately frugal. On the play screen it lives in the empty
// middle of the top bar, between the two buttons — that row already exists at
// that height for the buttons, so the name costs no vertical space at all.
// That mattered: we had just reclaimed 25px from the bottom bar to stop small
// screens clipping, and a dedicated title row would have spent it again.
//
// It is deliberately small there, too. The goo counter is the loudest thing on
// that screen and should stay that way — a wordmark that competes with it
// would be worse than no wordmark. The big version is for the splash and the
// sign-in gate, the two moments where the player has nothing else to look at.

const SIZES = {
  bar: 'text-[22px]',
  hero: 'text-5xl',
} as const;

export function Wordmark({ size = 'bar', className = '' }: { size?: keyof typeof SIZES; className?: string }) {
  return (
    <span className={`wordmark leading-none ${SIZES[size]} ${className}`} aria-label="בלורבו">
      בְּלוֹרְבּוֹ
    </span>
  );
}
