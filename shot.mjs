import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await b.newPage({ viewport: { width: 320, height: 568 } });
await p.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
await p.waitForFunction(() => !!window.__game, null, { timeout: 15000 });
await p.evaluate(() => window.__game.setState({ authUser:{id:'x',email:'e',displayName:'t'}, authChecked:true }));
await p.waitForTimeout(500);
const t = await p.evaluate(() => [...document.querySelectorAll('nav button')].map(b => {
  const r = b.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; }));
console.log('nav touch targets (min recommended 44x44):');
t.forEach((x,i)=>console.log(`  tab ${i+1}: ${x.w}x${x.h}  ${x.h>=44 && x.w>=44 ? 'OK' : 'TOO SMALL'}`));
await b.close();
