// Regenerates public/badge-96.png — the Android notification SMALL icon (the
// tiny mark shown in the status bar next to the clock).
//
// Android renders the status-bar icon from the ALPHA CHANNEL ONLY: it paints a
// white silhouette of whatever is opaque and throws the colours away. A full
// colour icon (we were passing icon-192.png) therefore shows up as a solid
// white SQUARE. The fix is a purpose-made monochrome asset: a WHITE blob
// silhouette on a TRANSPARENT background, with the eyes + grin punched out so
// it still reads as Blorbo at ~24dp.
//
// Same rendering approach as generate-og.mjs (headless Chromium screenshot),
// so there's no native image dependency. Run from the project root:
//   node scripts/generate-badge.mjs      (needs: npm i --no-save playwright-core)

import { writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const SIZE = 96; // Android's recommended small-icon size; the OS downscales it.

// The blob mark from public/icon.svg, recoloured to a pure white silhouette via
// a mask: white = keep, black = punch transparent. Body + antenna + arms are
// white; the eyes and grin are black so they show through as the face.
const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="${SIZE}" height="${SIZE}">
  <defs>
    <mask id="blob" maskUnits="userSpaceOnUse" x="0" y="0" width="200" height="200">
      <g transform="translate(100 104) scale(0.82) translate(-100 -100)">
        <!-- silhouette (white = visible) -->
        <path d="M104 34 Q112 16 128 12" fill="none" stroke="#fff" stroke-width="9" stroke-linecap="round"/>
        <circle cx="132" cy="11" r="12" fill="#fff"/>
        <path d="M26 116 q-16 2 -20 16" fill="none" stroke="#fff" stroke-width="15" stroke-linecap="round"/>
        <path d="M174 116 q16 2 20 16" fill="none" stroke="#fff" stroke-width="15" stroke-linecap="round"/>
        <path d="M100 30 C150 30 176 68 176 108 C176 140 160 160 140 170 Q142 184 130 182 Q124 180 122 172 Q112 176 106 172 Q98 178 90 172 Q84 180 78 174 Q66 176 66 166 C44 156 24 138 24 108 C24 68 50 30 100 30 Z" fill="#fff"/>
        <!-- eyes + grin (black = punched out, so the white body reads as a face) -->
        <ellipse cx="76" cy="98" rx="16" ry="19" fill="#000"/>
        <ellipse cx="126" cy="96" rx="16" ry="19" fill="#000"/>
        <path d="M74 132 Q100 164 130 130 Q102 148 74 132 Z" fill="#000"/>
      </g>
    </mask>
  </defs>
  <rect width="200" height="200" fill="#fff" mask="url(#blob)"/>
</svg>`;

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;background:transparent}
  #wrap{width:${SIZE}px;height:${SIZE}px}
</style></head><body><div id="wrap">${svg}</div></body></html>`;

const browser = await chromium.launch({ executablePath: EXE });
const page = await browser.newPage({ viewport: { width: SIZE, height: SIZE }, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: 'load' });
const buf = await page.locator('#wrap').screenshot({ omitBackground: true }); // keep transparency
writeFileSync('public/badge-96.png', buf);
await browser.close();
console.log(`wrote public/badge-96.png (${SIZE}x${SIZE}, transparent, white silhouette)`);
