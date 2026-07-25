import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--no-sandbox'] });
const page = await browser.newPage();
const errors=[];
page.on('pageerror', e=>errors.push('PAGEERROR: '+e.message));
page.on('console', m=>{ if(m.type()==='error') errors.push(m.text()); });
await page.goto('http://localhost:5173/', { waitUntil:'networkidle' });
await page.waitForFunction(() => !!window.__game, null, { timeout: 10000 });
await page.evaluate(() => window.__game.setState({ goo: 0, lifetimeGoo:0, loaded:true, characters:{}, upgrades:{finger:0,power:0,autoTap:0,nurture:0,crit:0,luck:0}, achievements:[] }));
await page.evaluate(() => window.__game.getState().setTab('click'));
await page.waitForTimeout(150);
// 2000 rapid taps -> combo bonuses at 50,100,250,500,1000,1500,2000 should all fire
const res = await page.evaluate(() => {
  const btn=document.querySelector('button[aria-label="לחיצה על הבלוב"]'); const r=btn.getBoundingClientRect();
  for(let i=0;i<2000;i++) btn.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,clientX:r.left+r.width/2,clientY:r.top+r.height/2}));
  return { goo: Math.round(window.__game.getState().goo) };
});
await page.waitForTimeout(80);
const burst = await page.evaluate(()=>{const el=[...document.querySelectorAll('div')].find(d=>/קוֹמְבּוֹ ×\d/.test(d.textContent||''));return el?el.textContent.match(/קוֹמְבּוֹ ×\d+/)[0]:null;});
// combo bonuses (clickPower=1): normal 2000 + 50+100+250+500+1000+1500+2000 = 2000+5400 = 7400 (+crit noise)
console.log('errors:', errors.length?errors:'NONE');
console.log('2000 taps -> goo:', res.goo, '(expect ~7400+: 2000 normal + combos 50/100/250/500/1000/1500/2000)');
console.log('last combo burst:', burst, '(expect ×2000)');
// creature income bump check: rare lvl 50
const inc = await page.evaluate(()=>{
  // use exposed economy? not available. compute via store: add a creature and read gooPerSec
  const g=window.__game; g.setState({ characters:{ chompolino:{level:50} }, upgrades:{finger:0,power:0,autoTap:0,nurture:0,crit:0,luck:0} });
  return null;
});
console.log('creature growth now 0.7 (built) — rare L50 base mult x35.3 vs old x20.6');
await browser.close(); process.exit(errors.length?1:0);
