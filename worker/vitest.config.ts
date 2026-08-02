// Real Workers-runtime integration tests for PR 3a's /auth/* endpoints, using
// @cloudflare/vitest-pool-workers — runs the actual worker (src/index.ts)
// inside Miniflare/workerd against a local D1, not a hand-rolled fake DB.
//
// This is INTENTIONALLY separate from the root vitest config (vite.config.ts
// `test` block): the root suite runs on Node with vitest@2.1.9 hoisted from
// the repo root, and this package pins a compatible-but-independent vitest
// install of its own (see worker/package.json). Run it from inside worker/:
//   cd worker && npx vitest run
// It does NOT participate in the root `npm test` run — see worker/README.md
// "Testing" for why, and worker/test/README (below) for what this proves.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Turns schema.sql into the { name, queries } shape applyD1Migrations()
 * wants, WITHOUT hand-copying the schema into a second "test migrations"
 * file that could drift from the real one. Strips `--` line comments, then
 * splits on `;` — safe here because schema.sql has no string literals or
 * semicolons-in-comments that would confuse a naive split.
 */
function schemaAsMigration(schemaPath: string): { name: string; queries: string[] } {
  const sql = fs.readFileSync(schemaPath, 'utf8');
  const withoutComments = sql
    .split('\n')
    .map((line) => {
      const idx = line.indexOf('--');
      return idx === -1 ? line : line.slice(0, idx);
    })
    .join('\n');
  const queries = withoutComments
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return { name: '0000_schema', queries };
}

export default defineWorkersConfig({
  test: {
    // Glob, not a single named file: a hardcoded filename means any NEW
    // integration test is silently never run.
    include: ['test/**/*.integration.test.ts'],
    setupFiles: ['./test/apply-schema.ts'],
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.toml' },
        miniflare: {
          // A test-only binding carrying the real schema.sql's statements,
          // so the setup file can apply them via applyD1Migrations() before
          // any test runs. See worker/test/apply-schema.ts.
          bindings: { TEST_SCHEMA_MIGRATIONS: [schemaAsMigration(path.join(__dirname, 'schema.sql'))] },
        },
      },
    },
  },
});
