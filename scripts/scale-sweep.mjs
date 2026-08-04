// DAU sweep on the same per-user model as scale-cost-sim.mjs, to produce a
// by-user-count table: per-day load vs the Cloudflare free limits, the monthly
// Workers-Paid cost, and the ad-revenue band. Board size scales with DAU (~75%
// of DAU carry a leaderboard nickname row). Read-only; prints JSON.

const DAYS = 30;
const poisson = (mean) => { const L = Math.exp(-mean); let k = 0, p = 1; do { k++; p *= Math.random(); } while (p > L); return k - 1; };
const expo = (mean) => -Math.log(1 - Math.random()) * mean;
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

function run(DAU) {
  const BOARD_N = Math.round(DAU * 0.75);
  let reqTotal = 0, d1Read = 0, d1Write = 0, adViews = 0;
  for (let u = 0; u < DAU; u++) {
    const sessions = clamp(poisson(3.5), 1, 30);
    const above = Math.round(BOARD_N * Math.random());
    for (let s = 0; s < sessions; s++) {
      const activeMin = clamp(expo(5), 0.2, 90);
      reqTotal += 2; d1Read += 1; d1Read += 2;
      const puts = Math.floor(activeMin) + 1;
      reqTotal += puts; d1Read += puts * 2; d1Write += puts;
      if (Math.random() < 0.25) {
        reqTotal += 1; d1Read += 3; d1Write += 1;
        d1Read += 1 + 3 * above + BOARD_N;
        const tops = 1 + (Math.random() < 0.5 ? 1 : 0);
        reqTotal += tops; d1Read += tops * 50;
      }
      adViews += Math.random() < 0.45 ? 1 + poisson(0.8) : 0;
    }
  }
  const perDay = { req: reqTotal, read: d1Read, write: d1Write };
  const reqM = reqTotal * DAYS, readM = d1Read * DAYS, writeM = d1Write * DAYS, adM = adViews * DAYS;
  // Free limits (per day)
  const FREE = { req: 100_000, read: 5_000_000, write: 100_000 };
  const overFree = perDay.req > FREE.req || perDay.read > FREE.read || perDay.write > FREE.write;
  // Workers Paid inclusions / overage
  const reqCost = Math.max(0, reqM - 10e6) * (0.30 / 1e6);
  const readCost = Math.max(0, readM - 25e9) * (0.001 / 1e6);
  const writeCost = Math.max(0, writeM - 50e6) * (1.0 / 1e6);
  const infra = overFree ? 5 + reqCost + readCost + writeCost : 0;
  const billed = adM * 0.7;
  const ads = { low: billed * 2 / 1000, mid: billed * 4 / 1000, high: billed * 6 / 1000 };
  return { DAU, perDay, perMonth: { req: reqM, read: readM, write: writeM }, overFree, infra, ads,
           firstLimit: perDay.read > FREE.read ? 'D1 reads' : perDay.req > FREE.req ? 'Worker requests' : perDay.write > FREE.write ? 'D1 writes' : '—' };
}

const tiers = [200, 500, 1000, 2000, 3000, 5000, 10000, 20000, 30000, 50000];
const rows = tiers.map(run);
console.log(JSON.stringify(rows, null, 1));
