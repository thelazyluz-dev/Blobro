/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { configDefaults } from 'vitest/config';

export default defineConfig({
  // Relative base so the build runs from any host or subpath (GitHub Pages
  // project sites, a subdirectory, or a bare domain) without reconfiguring.
  base: './',
  plugins: [react()],
  test: {
    // Explicit include so the Worker's contract tests (worker/test/**) run
    // alongside the client's (src/**) under one `npm test` — this is what
    // proves the two sides agree on the shared game core (see
    // src/game/golden.test.ts and worker/test/golden.test.ts).
    include: ['src/**/*.test.ts', 'worker/test/**/*.test.ts'],
    // e2e/ holds Playwright specs (a different test runner/API) — keep them
    // out of vitest's unit-test collection. `*.integration.test.ts` under
    // worker/test/ runs under @cloudflare/vitest-pool-workers (a real
    // Workers runtime + local D1), which needs its own vitest version and
    // the `cloudflare:test` module this Node-based run doesn't have — see
    // worker/vitest.config.ts and worker/README.md "Testing".
    exclude: [...configDefaults.exclude, 'e2e/**', 'worker/test/**/*.integration.test.ts'],
  },
});
