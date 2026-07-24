// Build config for a single self-contained HTML file (JS + CSS + fonts all
// inlined as data URIs). Used only to produce a testable Artifact build — the
// normal app build (vite.config.ts) is unchanged.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  plugins: [react(), viteSingleFile()],
  build: {
    outDir: 'dist-single',
    assetsInlineLimit: 100000000,
    cssCodeSplit: false,
    reportCompressedSize: false,
  },
});
