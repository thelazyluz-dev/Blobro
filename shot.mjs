import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await b.newPage({ viewport: { width: 390, height: 844 } });
await p.emulateMedia({ reducedMotion: 'reduce' });
await p.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
await p.waitForFunction(() => !!window.__game, null, { timeout: 15000 });
await p.evaluate(() => window.__game.setState({ authUser: {id:'x',email:'e2e@x.com',displayName:'טסט'}, authChecked: true }));
await p.waitForTimeout(500);
await p.evaluate(() => window.__game.setState({ goo: 1e30, clicks: 900, nicknameOpen: false, activeTab: 'shop',
  milestone: null, unlockReveal: null, offlineReport: null, hatchResult: null, multiHatchResult: null }));
await p.waitForTimeout(900);
await p.evaluate(() => window.__game.setState({ milestone: null, unlockReveal: null, offlineReport: null }));
await p.waitForTimeout(200);
const locked = await p.locator('text=/לְחִיצוֹת/').count();
const r = await p.evaluate(() => {
  const g = window.__game;
  g.getState().buyCosmetic('bg-lava');    // gated at 600k taps
  g.getState().buyCosmetic('bg-ocean');   // ungated
  g.getState().buyCosmetic('bg-sunset');  // gated at 3k taps
  const o = g.getState().ownedCosmetics;
  return { lava: o.includes('bg-lava'), ocean: o.includes('bg-ocean'), sunset: o.includes('bg-sunset') };
});
console.log('locked rows rendered:', locked);
console.log('bg-lava   (600k taps needed):', r.lava,   ' <- must be false');
console.log('bg-sunset (3k taps needed)  :', r.sunset, ' <- must be false');
console.log('bg-ocean  (no tap gate)     :', r.ocean,  ' <- must be TRUE');
await p.screenshot({ path: 'shop.png' });
await b.close();
