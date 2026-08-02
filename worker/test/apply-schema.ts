// Runs once before the integration suite: applies the REAL schema.sql (via
// TEST_SCHEMA_MIGRATIONS, built in vitest.config.ts) to the local D1 that
// Miniflare spins up for this test run.
//
// "Setup files run outside the per-test-file storage isolation, and may run
// multiple times. applyD1Migrations() only applies migrations that haven't
// already been applied, so calling it here is safe." (same contract Cloudflare's
// own d1 example fixture documents.)
import { applyD1Migrations, env } from 'cloudflare:test';

await applyD1Migrations(env.DB, env.TEST_SCHEMA_MIGRATIONS);
