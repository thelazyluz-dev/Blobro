// Regenerates public/og.png — the 1200×630 link-preview image WhatsApp / social
// shows for https://bl-or-bo.com. There was no generator before (the image was a
// one-off), so the "first to a decillion" hook was baked in as pixels; this
// script rebuilds it on brand with the current "first to a googol" hook, reusing
// the real app icon (public/icon-512.png) and the game's Suez One display font.
//
// Run from the project root:  node scripts/generate-og.mjs
// Needs playwright-core (installed ad hoc): npm i --no-save playwright-core

import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const b64 = (p) => readFileSync(p).toString('base64');

const suez = b64('node_modules/@fontsource/suez-one/files/suez-one-hebrew-400-normal.woff2');
const icon = b64('public/icon-512.png');

// Brand tokens (tailwind.config.js / src/index.css).
const VOID = '#1A0B2E';
const GOO = '#A3FF12';
const CY = '#00E5FF';
const BONE = '#FFF4E0';

const html = `<!doctype html><html dir="rtl"><head><meta charset="utf-8"><style>
  @font-face { font-family: 'Suez'; src: url(data:font/woff2;base64,${suez}) format('woff2'); font-weight: 400; }
  * { margin: 0; box-sizing: border-box; }
  html, body { width: 1200px; height: 630px; }
  .stage {
    position: relative; width: 1200px; height: 630px; overflow: hidden;
    font-family: 'Suez', sans-serif; color: ${BONE};
    background:
      radial-gradient(600px 500px at 88% 22%, rgba(163,255,18,0.28), transparent 65%),
      repeating-linear-gradient(135deg, rgba(255,255,255,0.05) 0 2px, transparent 2px 44px),
      linear-gradient(135deg, #2a0f49 0%, ${VOID} 55%, #120722 100%);
  }
  .tile {
    position: absolute; top: 135px; right: 90px; width: 360px; height: 360px;
    border-radius: 48px; background: #241338;
    box-shadow: 0 0 60px 6px rgba(163,255,18,0.35), inset 0 0 0 2px rgba(163,255,18,0.15);
    display: flex; align-items: center; justify-content: center;
  }
  .tile img { width: 300px; height: 300px; border-radius: 50%; }
  .text { position: absolute; top: 168px; right: 500px; width: 620px; text-align: right; }
  .word { font-size: 132px; line-height: 1; color: ${GOO}; text-shadow: 0 0 40px rgba(163,255,18,0.55); }
  .tag { margin-top: 34px; font-size: 60px; line-height: 1.28; color: ${CY}; text-shadow: 0 0 22px rgba(0,229,255,0.4); }
  .url { position: absolute; bottom: 54px; left: 0; right: 0; text-align: center; font-size: 58px; color: ${BONE}; letter-spacing: 1px; }
</style></head><body>
  <div class="stage">
    <div class="tile"><img src="data:image/png;base64,${icon}"></div>
    <div class="text">
      <div class="word">בלורבו</div>
      <div class="tag">🏆 מי הראשון<br>שיגיע לגוגל?</div>
    </div>
    <div class="url">bl-or-bo.com</div>
  </div>
</body></html>`;

const browser = await chromium.launch({ executablePath: EXE });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(150);
const el = await page.$('.stage');
await el.screenshot({ path: 'public/og.png' });
await browser.close();
console.log('Wrote public/og.png');
