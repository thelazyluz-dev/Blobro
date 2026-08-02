#!/usr/bin/env node
// Post-deploy sanity check. Plain Node, no dependencies, so it can run as a
// CI step right after a deploy with nothing to install.
//
// Usage: node scripts/sanity.mjs [baseUrl] [workerUrl]
//   baseUrl   defaults to https://bl-or-bo.com
//   workerUrl defaults to https://blorbo-leaderboard.blorbs.workers.dev

const baseUrl = (process.argv[2] || 'https://bl-or-bo.com').replace(/\/$/, '');
const workerUrl = (process.argv[3] || 'https://blorbo-leaderboard.blorbs.workers.dev').replace(/\/$/, '');
const TIMEOUT_MS = 15_000;

/** Fetch a URL with a hard timeout, returning { ok, status, text, error }. */
async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    const text = await res.text();
    return { ok: true, status: res.status, text };
  } catch (err) {
    return { ok: false, status: 0, text: '', error: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timer);
  }
}

const results = [];

function record(name, pass, detail) {
  results.push({ name, pass, detail });
  const tag = pass ? 'PASS' : 'FAIL';
  const line = `[${tag}] ${name}${detail ? ' — ' + detail : ''}`;
  console.log(line);
}

async function checkHtmlPage(name, url, { mustInclude } = {}) {
  const res = await fetchWithTimeout(url);
  if (!res.ok) {
    record(name, false, `request failed: ${res.error}`);
    return;
  }
  if (res.status !== 200) {
    record(name, false, `expected 200, got ${res.status}`);
    return;
  }
  if (mustInclude && !res.text.includes(mustInclude)) {
    record(name, false, `200 OK but missing "${mustInclude}"`);
    return;
  }
  record(name, true, `200 OK${mustInclude ? `, found "${mustInclude}"` : ''}`);
}

async function checkManifest() {
  const url = `${baseUrl}/manifest.webmanifest`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) {
    record('manifest.webmanifest', false, `request failed: ${res.error}`);
    return;
  }
  if (res.status !== 200) {
    record('manifest.webmanifest', false, `expected 200, got ${res.status}`);
    return;
  }
  try {
    JSON.parse(res.text);
  } catch {
    record('manifest.webmanifest', false, '200 OK but body is not valid JSON');
    return;
  }
  record('manifest.webmanifest', true, '200 OK and parses as JSON');
}

async function checkWorkerHealth() {
  const url = `${workerUrl}/health`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) {
    record('worker /health', false, `request failed: ${res.error}`);
    return;
  }
  if (res.status !== 200) {
    record('worker /health', false, `expected 200, got ${res.status}`);
    return;
  }
  let json;
  try {
    json = JSON.parse(res.text);
  } catch {
    record('worker /health', false, '200 OK but body is not valid JSON');
    return;
  }
  if (json?.ok !== true) {
    record('worker /health', false, `200 OK but body is not {ok:true} (got ${res.text})`);
    return;
  }
  record('worker /health', true, '200 OK and {ok:true}');
}

async function main() {
  console.log(`Sanity check against: ${baseUrl}`);
  console.log(`Leaderboard worker:   ${workerUrl}`);
  console.log('');

  await checkHtmlPage('GET / (root)', `${baseUrl}/`, { mustInclude: '<div id="root"' });
  await checkHtmlPage('GET /privacy.html', `${baseUrl}/privacy.html`);
  await checkHtmlPage('GET /how-to-play.html', `${baseUrl}/how-to-play.html`);
  await checkManifest();
  await checkWorkerHealth();

  const passed = results.filter((r) => r.pass).length;
  const failed = results.length - passed;
  console.log('');
  console.log(`Summary: ${passed}/${results.length} checks passed${failed ? `, ${failed} FAILED` : ''}.`);

  if (failed > 0) process.exit(1);
}

main();
