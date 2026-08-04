// Monte-Carlo load & cost simulation for Blorbo at 20,000 daily active users.
// Grounded in the real cadences read from the code:
//   - cloud save PUT: <= 1 / 60s while dirty (idle clicker => always dirty)
//   - exit push: throttled 20s (visibilitychange/pagehide)
//   - auth/me: 1 GET per app load;  save GET: 1 per load
//   - leaderboard is event-driven (open only), no background polling
//   - /submit + /rank each run rankPayload = 4 COUNTs (3 range + 1 total) + row
// Cloudflare D1 bills "rows read"; COUNT(*) total scans the whole board (N rows),
// COUNT(*) WHERE col>me reads ~ (players above me) index rows.

const DAU = 20_000;
const BOARD_N = 15_000; // players with a nickname row on the leaderboard
const DAYS_PER_MONTH = 30;

function poisson(mean) { // Knuth
  const L = Math.exp(-mean); let k = 0, p = 1;
  do { k++; p *= Math.random(); } while (p > L);
  return k - 1;
}
const expo = (mean) => -Math.log(1 - Math.random()) * mean;
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

let reqTotal = 0, d1Read = 0, d1Write = 0;
let putSaves = 0, lbOpens = 0, adViews = 0;

for (let u = 0; u < DAU; u++) {
  const sessions = clamp(poisson(3.5), 1, 30);
  const percentile = Math.random();
  const above = Math.round(BOARD_N * (1 - percentile)); // rows an index range-COUNT walks

  for (let s = 0; s < sessions; s++) {
    const activeMin = clamp(expo(5), 0.2, 90);

    reqTotal += 2;            // auth/me + save GET
    d1Read += 1;              // auth/me: session lookup
    d1Read += 2;              // save GET: session + saves row

    const puts = Math.floor(activeMin) + 1;
    putSaves += puts; reqTotal += puts;
    d1Read += puts * 2;       // each PUT: session + current-rev read
    d1Write += puts * 1;      // each PUT: one upsert write

    if (Math.random() < 0.25) {
      lbOpens++;
      reqTotal += 1;
      d1Read += 3;            // session + payload + existing
      d1Write += 1;           // scores upsert
      d1Read += 1 + (3 * above) + BOARD_N; // rankPayload: row + 3 range COUNTs + total COUNT
      const tops = 1 + (Math.random() < 0.5 ? 1 : 0);
      reqTotal += tops;
      d1Read += tops * 50;
    }

    adViews += Math.random() < 0.45 ? 1 + poisson(0.8) : 0;
  }
}

const reqM = reqTotal * DAYS_PER_MONTH;
const readM = d1Read * DAYS_PER_MONTH;
const writeM = d1Write * DAYS_PER_MONTH;
const adM = adViews * DAYS_PER_MONTH;

const WK_BASE = 5;
const WK_REQ_INCL = 10e6, WK_REQ_OVER = 0.30 / 1e6;
const D1_READ_INCL = 25e9, D1_READ_OVER = 0.001 / 1e6;
const D1_WRITE_INCL = 50e6, D1_WRITE_OVER = 1.00 / 1e6;

const reqCost = Math.max(0, reqM - WK_REQ_INCL) * WK_REQ_OVER;
const readCost = Math.max(0, readM - D1_READ_INCL) * D1_READ_OVER;
const writeCost = Math.max(0, writeM - D1_WRITE_INCL) * D1_WRITE_OVER;
const cfTotal = WK_BASE + reqCost + readCost + writeCost;

const eCPM = { low: 2, mid: 4, high: 6 };
const fill = 0.7;
const rev = (c) => (adM * fill / 1000) * c;

const f = (n) => n.toLocaleString('en-US');
const $ = (n) => '$' + n.toFixed(2);
console.log('=== INPUTS ===');
console.log(`DAU ${f(DAU)} | board rows ${f(BOARD_N)} | avg 3.5 sessions/user`);
console.log('\n=== PER DAY ===');
console.log(`Worker requests  : ${f(Math.round(reqTotal))}`);
console.log(`  save PUTs       : ${f(putSaves)}`);
console.log(`  leaderboard opens: ${f(lbOpens)}`);
console.log(`D1 rows read      : ${f(Math.round(d1Read))}`);
console.log(`D1 rows written   : ${f(Math.round(d1Write))}`);
console.log(`rewarded views    : ${f(Math.round(adViews))}`);
console.log('\n=== PER MONTH ===');
console.log(`Worker requests  : ${f(Math.round(reqM))}  (incl ${f(WK_REQ_INCL)})`);
console.log(`D1 rows read      : ${f(Math.round(readM))}  (incl ${f(D1_READ_INCL)})`);
console.log(`D1 rows written   : ${f(Math.round(writeM))}  (incl ${f(D1_WRITE_INCL)})`);
console.log('\n=== CLOUDFLARE COST / MONTH ===');
console.log(`base             : ${$(WK_BASE)}`);
console.log(`request overage  : ${$(reqCost)}`);
console.log(`D1 read overage  : ${$(readCost)}`);
console.log(`D1 write overage : ${$(writeCost)}`);
console.log(`TOTAL            : ${$(cfTotal)}`);
console.log('\n=== AD REVENUE / MONTH (fill ' + fill + ') ===');
console.log(`views billed     : ${f(Math.round(adM * fill))}`);
console.log(`low  (eCPM $2)   : ${$(rev(eCPM.low))}`);
console.log(`mid  (eCPM $4)   : ${$(rev(eCPM.mid))}`);
console.log(`high (eCPM $6)   : ${$(rev(eCPM.high))}`);
console.log('\n=== NET / MONTH (mid ad case) ===');
console.log(`revenue - infra  : ${$(rev(eCPM.mid) - cfTotal)}`);
