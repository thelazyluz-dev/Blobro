# BLORBO

A clicker/idle game for children. Web only, no backend, zero data collection.
Hebrew UI, right-to-left, installable as a web app and fully playable offline.
See `PRD.md` for the full spec and `CLAUDE.md` for the engineering constraints.

## Run

```bash
npm install
npm run dev           # local dev server
npm run build         # type-check + production build to dist/
npm run preview       # serve the production build
npm run build:single  # one self-contained HTML in dist-single/ (opens with no server)
```

Everything is bundled locally — fonts included. After `npm run build` the app
runs fully offline with no third-party network requests.

## What's built — the complete game (PRD §13, milestones 1–7)

1. **Shell + economy** — click loop, `balance.ts`, Zustand state, IndexedDB
   save/load (autosave every 5s + on hide/unload).
2. **Creatures + passive income** — 10 inline-SVG characters, per-rarity income,
   collection screen.
3. **Hatching** — weighted gacha, pity (`sinceRare` 15, `totalHatches` 60),
   duplicate → level-up or goo, and the staged reveal moment.
4. **Upgrades + offline income** — the "finger" upgrade and the "חזרת!" modal.
5. **Sound** — runtime Web Audio synthesis, a distinct jingle per creature, a
   persisted global mute. No audio files.
6. **Juice** — glow, goo-droplet particles, squash-and-stretch, reveal burst,
   ambient motion — all gated behind `prefers-reduced-motion`.
7. **Share card** — a 1080×1920 PNG drawn on-canvas for rare/legendary creatures,
   saved via the Web Share API or a download. Never uploaded.

## Web app / offline

- Installable PWA: `public/manifest.webmanifest` + an SVG icon.
- `public/sw.js` — a dependency-free service worker: network-first for the HTML
  (so tuning updates reach testers) and cache-first for hashed assets, giving
  offline play. Same-origin only, no third-party requests.
- The build uses a relative `base`, so `dist/` is portable — host it on any
  static server or subpath.

## Deploy

`.github/workflows/deploy.yml` builds and publishes `dist/` to GitHub Pages on
every push to `main`. Enable it once under **Settings → Pages → Build and
deployment → Source: GitHub Actions**. The relative base means the same build
also works on Netlify/Vercel or your own domain — just serve `dist/`.

## Layout

```
src/
  game/          pure logic — no React, no DOM
    balance.ts   every tunable number lives here
    characters.ts, economy.ts, hatching.ts, offline.ts, save.ts, format.ts
  audio/         Web Audio synthesis
  ui/            components, screens, SVG character bodies, share card
  persistence.ts IndexedDB I/O (kept out of game/ so game/ stays pure)
  store.ts       Zustand store wiring game logic to React
  App.tsx
```

All balance tuning happens in `src/game/balance.ts` — never inline in a
component. `src/game/` imports nothing from `src/ui/` and can be tested on its
own. In dev, `window.__game` exposes the store for console tuning (stripped from
production builds).
