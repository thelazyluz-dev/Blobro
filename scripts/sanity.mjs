#!/usr/bin/env node
// Post-deploy sanity check. Plain Node, no dependencies, so it can run as a
// CI step right after a deploy with nothing to install.
//
// Usage: node scripts/sanity.mjs [baseUrl] [workerUrl]
//   baseUrl   defaults to https://bl-or-bo.com
//   workerUrl defaults to whatever AUTH_API is set to in src/config.ts
//
// The worker URL is READ FROM src/config.ts rather than hardcoded, because the
// only URL worth checking is the one the shipped app actually calls. It used
// to be pinned to the *.workers.dev address while the app had already moved to
// api.bl-or-bo.com — so the check was green while testing a host no player
// ever touches.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function authApiFromConfig() {
  try {
    const src = readFileSync(resolve(__dirname, '../src/config.ts'), 'utf-8');
    const m = src.match(/export const AUTH_API\s*=\s*['"]([^'"]*)['"]/);
    return m?.[1]?.trim() || '';
  } catch {
    return '';
  }
}

const baseUrl = (process.argv[2] || 'https://bl-or-bo.com').replace(/\/$/, '');
const workerUrl = (process.argv[3] || authApiFromConfig()).replace(/\/$/, '');
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

/**
 * Check a route that must exist and must refuse an anonymous caller.
 *
 * A 401 is the PASS here: it proves the route is deployed AND that it doesn't
 * hand game data to someone without a session. A 404 is the interesting
 * failure — it means the Worker running in production is older than the code
 * that just shipped to Pages, which the owner fixes by deploying it by hand
 * (the Worker is not part of the Pages deploy — see worker/README.md).
 *
 * This matters more than it used to: sign-in is mandatory (AUTH_REQUIRED in
 * src/config.ts), so a stale Worker doesn't degrade the game, it makes it
 * unplayable. That is worth failing a build over.
 */
async function checkRequiresAuth(name, path) {
  const url = `${workerUrl}${path}`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) {
    record(name, false, `request failed: ${res.error}`);
    return;
  }
  if (res.status === 404) {
    record(name, false, `404 — the deployed Worker is missing ${path}. Run \`npx wrangler deploy\` from worker/`);
    return;
  }
  if (res.status !== 401) {
    record(name, false, `expected 401 for an anonymous caller, got ${res.status}`);
    return;
  }
  record(name, true, '401 as expected (route live, anonymous access refused)');
}

async function main() {
  console.log(`Sanity check against: ${baseUrl}`);
  console.log(`API worker:           ${workerUrl || '(none configured)'}`);
  console.log('');

  await checkHtmlPage('GET / (root)', `${baseUrl}/`, { mustInclude: '<div id="root"' });
  await checkHtmlPage('GET /privacy.html', `${baseUrl}/privacy.html`);
  await checkHtmlPage('GET /how-to-play.html', `${baseUrl}/how-to-play.html`);
  await checkManifest();
  if (!workerUrl) {
    record('API worker', false, 'no worker URL given and AUTH_API is empty in src/config.ts');
  } else {
    await checkWorkerHealth();
    // Sign-in and cloud save are load-bearing now — a stale Worker means
    // nobody can play, so these are hard failures, not warnings.
    await checkRequiresAuth('worker /auth/me (identity live)', '/auth/me');
    await checkRequiresAuth('worker /save (cloud save live)', '/save');
  }

  const passed = results.filter((r) => r.pass).length;
  const failed = results.length - passed;
  console.log('');
  console.log(`Summary: ${passed}/${results.length} checks passed${failed ? `, ${failed} FAILED` : ''}.`);

  if (failed > 0) process.exit(1);
}

main();
