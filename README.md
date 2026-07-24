# BLORBO

A clicker/idle game for children. Web only, no backend, zero data collection.
Hebrew UI, right-to-left. See `PRD.md` for the full spec and `CLAUDE.md` for the
engineering constraints.

## Run

```bash
npm install
npm run dev      # local dev server
npm run build    # type-check + production build to dist/
npm run preview  # serve the production build
```

Everything is bundled locally — fonts included. After `npm run build` the app
runs fully offline with no third-party network requests.

## What's built (milestones 1–4)

This is the complete, testable game per PRD §13:

1. **Shell + economy** — click loop, `balance.ts`, Zustand state, IndexedDB
   save/load (autosave every 5s + on hide/unload).
2. **Creatures + passive income** — 10 inline-SVG characters, per-rarity income,
   collection screen.
3. **Hatching** — weighted gacha, pity (`sinceRare` 15, `totalHatches` 60),
   duplicate → level-up or goo, and the reveal moment.
4. **Upgrades + offline income** — the "finger" upgrade and the "חזרת!" modal.

Milestones 5–7 (sound synthesis, extra juice, share card) are intentionally not
started — they're polish to add only if the milestone-4 signal is positive.

## Layout

```
src/
  game/          pure logic — no React, no DOM
    balance.ts   every tunable number lives here
    characters.ts, economy.ts, hatching.ts, offline.ts, save.ts, format.ts
  ui/            components, screens, SVG character bodies
  persistence.ts IndexedDB I/O (kept out of game/ so game/ stays pure)
  store.ts       Zustand store wiring game logic to React
  App.tsx
```

All balance tuning happens in `src/game/balance.ts` — never inline in a
component. `src/game/` imports nothing from `src/ui/` and can be tested on its own.
