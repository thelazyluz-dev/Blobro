import {
  fingerBonus, clickPower, effectiveClickPower, autoClicksPerSec,
  autoTapMaxLevel, modifiersFrom,
} from '../src/game/economy';
import {
  fingerBonusBase, fingerBonusGrowth, upgradeConfig, tapProductionShare,
  clickBase, autoTapRatePerLevel, autoTapRateCap,
} from '../src/game/balance';
import { upgradeCost, defaultUpgrades } from '../src/game/upgrades';

const fmt = (n:number)=> n.toLocaleString('en-US',{maximumFractionDigits:2});
const up = { ...defaultUpgrades, finger:40, power:20, autoTap:20 };

console.log('=== CONSTANTS ===');
console.log('clickBase', clickBase, 'fingerBonusBase', fingerBonusBase, 'fingerBonusGrowth', fingerBonusGrowth);
console.log('power effectPerLevel', upgradeConfig.power.effectPerLevel);
console.log('autoTapRatePerLevel', autoTapRatePerLevel, 'cap', autoTapRateCap, 'autoTapMaxLevel', autoTapMaxLevel);
console.log('tapProductionShare', tapProductionShare);

for (const star of [1, 1.3]) {
  console.log(`\n===== star = ${star} (achievement income bonus ${((star-1)*100).toFixed(0)}%) =====`);
  const m = modifiersFrom(up, star-1);
  console.log('clickMultiplier (power 20) =', m.clickMultiplier);

  console.log('\n--- FINGER (owner level 40) ---');
  for (const L of [0,1,20,40,41]) console.log(`  fingerBonus(${L}) = ${fmt(fingerBonus(L))}`);
  const cp40 = clickPower(modifiersFrom({...up,finger:40},star-1));
  const cp41 = clickPower(modifiersFrom({...up,finger:41},star-1));
  console.log(`  clickPower @finger40 = ${fmt(cp40)}`);
  console.log(`  clickPower @finger41 = ${fmt(cp41)}  (+${fmt(cp41-cp40)}, +${((cp41/cp40-1)*100).toFixed(2)}%)`);
  console.log(`  cost finger 40->41 = ${fmt(upgradeCost('finger',40))} goo; taps to payback @face = ${fmt(upgradeCost('finger',40)/(cp41-cp40))}`);

  console.log('\n--- POWER (owner level 20) ---');
  const p20 = clickPower(modifiersFrom({...up,power:20},star-1));
  const p21 = clickPower(modifiersFrom({...up,power:21},star-1));
  console.log(`  clickPower @power20 = ${fmt(p20)}  @power21 = ${fmt(p21)}  (+${((p21/p20-1)*100).toFixed(2)}%)`);
  console.log(`  cost power 20->21 = ${fmt(upgradeCost('power',20))} goo`);

  console.log('\n--- AUTOTAP (owner level 20) ---');
  console.log(`  /sec @20 = ${autoClicksPerSec(20)}  @21 = ${autoClicksPerSec(21)}  cap@level ${autoTapMaxLevel} (=${autoClicksPerSec(autoTapMaxLevel)}/s); owner ${(20/autoTapMaxLevel*100).toFixed(0)}% to cap`);
  console.log(`  cost autoTap 20->21 = ${fmt(upgradeCost('autoTap',20))} goo`);

  console.log('\n--- PRODUCTION FLOOR crossover ---');
  const cp = clickPower(m);
  console.log(`  clickPower(m) = ${fmt(cp)};  floor beats upgrades once gooPerSec > ${fmt(cp/tapProductionShare)} /sec`);
  for (const gps of [1e5,1e6,1e7,1e8,1e9]) {
    const eff = effectiveClickPower(m, gps);
    console.log(`   gps=${fmt(gps).padStart(16)} effTap=${fmt(eff).padStart(14)} ${gps*tapProductionShare>cp?'FLOOR (finger/power invisible)':'upgrades win'}`);
  }
}

console.log('\n===== KEY: does buying finger/power move the REAL tap when floored? (star=1, gps=1e8) =====');
const s=0; const gps=1e8;
const e40=effectiveClickPower(modifiersFrom({...up,finger:40},s),gps);
const e41=effectiveClickPower(modifiersFrom({...up,finger:41},s),gps);
console.log(`  finger40 effTap=${fmt(e40)}  finger41 effTap=${fmt(e41)}  delta=${fmt(e41-e40)} => ${e41===e40?'ZERO, buy does nothing':'changes'}`);
const q20=effectiveClickPower(modifiersFrom({...up,power:20},s),gps);
const q21=effectiveClickPower(modifiersFrom({...up,power:21},s),gps);
console.log(`  power20 effTap=${fmt(q20)}  power21 effTap=${fmt(q21)}  delta=${fmt(q21-q20)} => ${q21===q20?'ZERO, buy does nothing':'changes'}`);
console.log(`  robot hand @autoTap20 output = ${fmt(effectiveClickPower(modifiersFrom(up,s),gps)*autoClicksPerSec(20))} goo/s (rides same floored effTap)`);
